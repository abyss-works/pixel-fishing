// 통합 밸런스 기대값(EV) 엔진 — 제품 규칙(추첨·낚싯대·파워 게이트·밤 깊이)으로
// 해역별 1회 캐치 EV와 시간당 수입·확률을 단일 경로로 계산한다.
//
// 가정(측정치가 아닌 근사):
//   - 낮밤 혼합 — 하루 중 밤 비율(게임 22~6시)만큼 밤 풀로 추첨한다.
//   - 처리량 = 입질 평균 대기(낚싯대 레벨 곡선, 파워 미달이면 추가 초) + 판정 시간(수동은 바의 절반, 방치는 끝까지) + 획득 연출.
//   - 수동 판정은 고른 판정을 늘 성공한다고 본다. 존이 없는 판정(빨간 존이 안 열린 PERFECT)은 측정하지 않는다.
//   - 이동·판매 왕복·가방 한도·미끼·유물은 넣지 않는다. 시간당 지표는 돌연변이 기댓값을 포함하고, 낮 1회 캐치 EV는 일반 폼 기준이다.
import { SPOTS, spotById } from '../content/spots.js';
import type { Spot, SpotId } from '../content/spots.js';
import { FISH } from '../content/fish.js';
import type { Fish } from '../content/fish.js';
import { RARITY } from '../content/rarity.js';
import type { RarityId } from '../content/rarity.js';
import { minLevelOfPower, powerOfLevel, zonesFor } from './stats.js';
import { IDLE_BOOST_STEPS, idleDialsOf, relativeIdleBoost } from './power.js';
import { drawRows, rodStats, variantShare } from './logic.js';
import type { DrawOptions } from './logic.js';
import { CATCH_MS, JUDGMENT_MULT, VARIANT_PRICE_MULT } from './balance.js';
import { DAY_START_MIN, NIGHT_START_MIN, NIGHT_TOTAL_STEPS, nightDepthOfStep } from './time.js';

export const NIGHT_SHARE = 1 - (NIGHT_START_MIN - DAY_START_MIN) / 60;

/** 밤 구간 전체 스텝의 nightDepth 분포 — 대칭 깊이를 묶어 균등 평균과 같은 값을 더 적은 호출로 계산한다 */
export const NIGHT_DEPTH_WEIGHTS: readonly [number, number][] = (() => {
  const counts = new Map<number, number>();
  for (let k = 0; k < NIGHT_TOTAL_STEPS; k++) {
    const d = nightDepthOfStep(k);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].map(([d, c]) => [d, c / NIGHT_TOTAL_STEPS]);
})();

export const VARIANT_EV = 1 + variantShare() * (VARIANT_PRICE_MULT - 1);

/** 여유 스펙 — 진입 레벨에서 몇 레벨 위를 함께 재는가. 태평양 이후 해역에서 방치 배수가 하한에 닿는 레벨 차다 */
export const SPEC_MARGIN = IDLE_BOOST_STEPS.length - 1;

export type Axis = 'normal' | 'good' | 'perfect' | 'idle';
/** 방치가 기준 축이므로 먼저 둔다 */
export const AXES: readonly Axis[] = ['idle', 'normal', 'good', 'perfect'];
export const AXIS_LABEL: Record<Axis, string> = { normal: '무판정', good: 'GOOD', perfect: 'PERFECT', idle: '방치' };

export interface Row { fish: Fish; prob: number }

/** 추첨 풀 — 낮 풀만, 밤 풀만, 또는 하루 중 시간 비율로 섞은 낮밤 혼합 */
export type Pool = 'day' | 'night' | 'mixed';

export interface RodSpec {
  level: number;
  power: number;
  biteMin: number;
  biteMax: number;
  sweep: number;
  yellow: number;
  red: number;
  idleBoost: number;
  /** 파워 미달 페널티 — 일반 가중치 배수(미달이 아니면 1) */
  gateMult: number;
  /** 파워 미달 페널티 — 입질 대기에 더하는 초(미달이 아니면 0) */
  biteExtra: number;
}

/** 한 번의 캐치에 드는 시간의 구성 — 입질 대기는 [biteMin, biteMax] 균등이고 나머지는 고정 초다 */
export interface Cycle { biteMin: number; biteMax: number; biteExtra: number; reaction: number }

export interface Rates {
  rows: Row[];
  cycle: Cycle;
  catchesPerHour: number;
  goldPerCatch: number;
  famePerCatch: number;
  goldPerHour: number;
  famePerHour: number;
  /** 등급별 출현 비율 */
  rarity: Record<string, number>;
}

export interface MoveGap {
  /** 새 해역의 진입 레벨에서의 방치 시간당 골드 */
  gold: number;
  /** 같은 레벨로 낚을 수 있는 이전 해역 중 방치 시간당 골드가 가장 높은 해역과 그 값. 없으면 undefined */
  from: SpotId | undefined;
  fromGold: number;
  /** 새 해역 ÷ 비교 해역. 비교 해역이 없으면 Infinity */
  ratio: number;
}

/** 낚싯대 파워·방치 배수 평가 함수 집합 — 실험용 규칙 주입에 쓴다 */
export interface RodRuleEvalFns {
  powerOfLevel: (level: number) => number;
  minLevelOfPower: (power: number) => number;
  relativeIdleBoost: (power: number, spot: SpotId) => number;
}

export type HourlyEvAxisKey = 'normal' | 'good' | 'perfect' | 'idleBest' | 'idleWorst';

export interface SpotHourlyEvSummary {
  entryLevel: number;
  plateauLevel: number;
  goldPerHour: Record<HourlyEvAxisKey, number>;
}

const defaultPriceOf = (fish: Fish): number => fish.price;

/** 선택적 규칙 함수를 주입해 통합 EV 계산 엔진을 만든다 */
export function createBalanceEvEngine(rules: Partial<RodRuleEvalFns> = {}) {
  const evalFns: RodRuleEvalFns = {
    powerOfLevel: rules.powerOfLevel ?? powerOfLevel,
    minLevelOfPower: rules.minLevelOfPower ?? minLevelOfPower,
    relativeIdleBoost: rules.relativeIdleBoost ?? relativeIdleBoost,
  };

  function spotOf(spot: SpotId): Spot {
    const found = spotById(spot);
    if (!found) throw new Error(`Unknown spot: ${spot}`);
    return found;
  }

  /** 해역의 개체 확률 — 낮/밤 풀을 하루 중 시간 비율로 섞고 시간대마다 가중치 합으로 정규화한다.
   *  밤 풀은 nightDepth 미지정 시 밤 전체 스텝의 균등 평균으로 집계한다 */
  function mixedRows(spot: SpotId, o: DrawOptions = {}, pool: Pool = 'mixed'): Row[] {
    const p = new Map<string, number>();
    const fishes = new Map<string, Fish>();
    const add = (rows: ReturnType<typeof drawRows>, weight: number) => {
      const total = rows.reduce((s, r) => s + r.fishPct, 0);
      if (total <= 0) return;
      for (const r of rows) {
        fishes.set(r.fish.id, r.fish);
        p.set(r.fish.id, (p.get(r.fish.id) ?? 0) + weight * r.fishPct / total);
      }
    };
    const night = pool === 'day' ? 0 : pool === 'night' ? 1 : NIGHT_SHARE;
    if (1 - night > 0) add(drawRows(spot, { ...o, phase: 'day' }), 1 - night);
    if (night > 0) {
      const hasNight = FISH.some(f => f.spot === spot && f.night);
      if (o.nightDepth !== undefined || !hasNight) {
        add(drawRows(spot, { ...o, phase: 'night' }), night);
      } else {
        for (const [nightDepth, share] of NIGHT_DEPTH_WEIGHTS) {
          add(drawRows(spot, { ...o, phase: 'night', nightDepth }), night * share);
        }
      }
    }
    return [...p].map(([id, prob]) => ({ fish: fishes.get(id)!, prob }));
  }

  const entryLevel = (spot: SpotId): number => evalFns.minLevelOfPower(spotOf(spot).powerReq ?? 0);

  /** 방치 배수가 해역 플래토(하한)에 도달하는 최초 레벨 */
  function plateauLevel(spot: SpotId): number {
    const entry = entryLevel(spot);
    const target = idleDialsOf(spot).plateau;
    const maxLevel = entry + 200;
    for (let lv = entry; lv <= maxLevel; lv++) {
      if (evalFns.relativeIdleBoost(evalFns.powerOfLevel(lv), spot) <= target) {
        return lv;
      }
    }
    return maxLevel;
  }

  /** 해역에서 이 레벨 낚싯대의 스펙 — 입질 대기는 낚싯대 레벨 곡선 그대로다(파워 초과로 줄지 않는다).
   *  파워가 해역 요구에 못 미치면 일반 가중치 배수와 입질 대기 추가 초가 붙는다 */
  function rodSpec(spot: SpotId, level: number): RodSpec {
    const st = rodStats(level);
    const power = evalFns.powerOfLevel(level);
    const entry = spotOf(spot).powerReq ?? 0;
    const z = zonesFor(power, entry);
    return {
      level,
      power,
      biteMin: st.biteMin,
      biteMax: st.biteMax,
      sweep: st.sweep,
      yellow: z.yellow,
      red: z.red,
      idleBoost: evalFns.relativeIdleBoost(power, spot),
      gateMult: z.mult,
      biteExtra: z.biteExtra,
    };
  }

  /** 축이 이 스펙에서 가능한가 — PERFECT는 빨간 존이, GOOD은 노란 존이 있어야 한다 */
  const axisAvailable = (spec: RodSpec, axis: Axis): boolean =>
    axis === 'perfect' ? spec.red > 0 : axis === 'good' ? spec.yellow > 0 : true;

  /** 축의 추첨 다이얼 — 리듀서와 같은 계산(수동 = 판정 배수, 방치 = 해역 요구 파워 대비 방치 배수).
   *  파워 미달 배수는 일반 가중치에 곱해진다. 미달이 아니면 수동 축은 판정 배수만 담는다 */
  function axisOptions(spec: RodSpec, axis: Axis): DrawOptions {
    if (axis === 'idle') return { commonMult: spec.idleBoost * spec.gateMult };
    return spec.gateMult === 1
      ? { rareMult: JUDGMENT_MULT[axis] }
      : { rareMult: JUDGMENT_MULT[axis], commonMult: spec.gateMult };
  }

  /** 낚싯대 스펙과 축의 캐치 주기 — 반응 시간은 방치가 바 끝까지, 수동은 절반이다 */
  function cycleOf(spec: RodSpec, axis: Axis): Cycle {
    return {
      biteMin: spec.biteMin,
      biteMax: spec.biteMax,
      biteExtra: spec.biteExtra,
      reaction: axis === 'idle' ? spec.sweep : spec.sweep / 2,
    };
  }

  /** 캐치 한 번의 평균 시간(초) — 획득 연출을 더한다 */
  const meanCycleSec = (c: Cycle): number => (c.biteMin + c.biteMax) / 2 + c.biteExtra + c.reaction + CATCH_MS / 1000;

  /** 캐치 한 번의 시간(초)을 입질 대기 균등 표본 u(0 이상 1 미만)로 계산한다 */
  const cycleSecAt = (c: Cycle, u: number): number => c.biteMin + u * (c.biteMax - c.biteMin) + c.biteExtra + c.reaction + CATCH_MS / 1000;

  function rates(
    spot: SpotId,
    level: number,
    axis: Axis,
    extra: DrawOptions = {},
    pool: Pool = 'mixed',
    priceOf: (fish: Fish) => number = defaultPriceOf,
  ): Rates {
    const spec = rodSpec(spot, level);
    const cycle = cycleOf(spec, axis);
    const sec = meanCycleSec(cycle);
    const rows = mixedRows(spot, { ...axisOptions(spec, axis), ...extra }, pool);
    const cph = 3600 / sec;
    const rarity: Record<string, number> = {};
    for (const r of rows) rarity[r.fish.rarity] = (rarity[r.fish.rarity] ?? 0) + r.prob;
    const goldPerCatch = rows.reduce((s, r) => s + r.prob * priceOf(r.fish), 0) * VARIANT_EV;
    const famePerCatch = rows.reduce((s, r) => s + r.prob * RARITY[r.fish.rarity].fame, 0);
    return {
      rows,
      cycle,
      catchesPerHour: cph,
      goldPerCatch,
      famePerCatch,
      rarity,
      goldPerHour: goldPerCatch * cph,
      famePerHour: famePerCatch * cph,
    };
  }

  /** 이동 직후 수입 — rateOf를 주면 그 수입 계산으로, 새 해역 진입 레벨에서 그 해역의 방치 시간당 골드를,
   *  같은 레벨로 낚을 수 있는(요구 파워를 채운) 이전 해역 중 가장 높은 값과 비교한다 */
  function moveGap(
    index: number,
    pool: Pool,
    rateOf: (spot: SpotId, level: number, pool: Pool, boat: number) => Rates = (spot, level, p) => rates(spot, level, 'idle', {}, p),
  ): MoveGap & { diff: number } {
    const here = SPOTS[index].id;
    const level = entryLevel(here);
    const power = evalFns.powerOfLevel(level);
    const boat = SPOTS[index].boatTier;
    const gold = rateOf(here, level, pool, boat).goldPerHour;
    let from: SpotId | undefined;
    let fromGold = 0;
    for (const prev of SPOTS.slice(0, index)) {
      if ((prev.powerReq ?? 0) > power) continue;
      const g = rateOf(prev.id, level, pool, boat).goldPerHour;
      if (g > fromGold) {
        from = prev.id;
        fromGold = g;
      }
    }
    return { gold, from, fromGold, ratio: fromGold > 0 ? gold / fromGold : Infinity, diff: gold - fromGold };
  }

  /** 같은 해역, 같은 레벨에서 PERFECT 다이얼의 시간당 골드 ÷ 방치의 시간당 골드(낮밤 혼합) */
  function perfectOverIdle(spot: SpotId, level: number): number {
    return rates(spot, level, 'perfect').goldPerHour / rates(spot, level, 'idle').goldPerHour;
  }

  /** 해역별 5개 축(수동 3축·방치 최저·방치 최고) 시간당 기대 골드 요약 */
  function spotAxisHourlyGold(
    spot: SpotId,
    options: {
      budgets?: Partial<Record<RarityId, number>>;
      fishWeights?: Record<string, number>;
      priceOf?: (fish: Fish) => number;
      pool?: Pool;
    } = {},
  ): SpotHourlyEvSummary {
    const entry = entryLevel(spot);
    const plateau = plateauLevel(spot);
    const extra: DrawOptions = {
      ...(options.budgets !== undefined ? { budgets: options.budgets } : {}),
      ...(options.fishWeights !== undefined ? { fishWeights: options.fishWeights } : {}),
    };
    const pool = options.pool ?? 'mixed';
    const priceOf = options.priceOf;
    return {
      entryLevel: entry,
      plateauLevel: plateau,
      goldPerHour: {
        normal: rates(spot, entry, 'normal', extra, pool, priceOf).goldPerHour,
        good: rates(spot, entry, 'good', extra, pool, priceOf).goldPerHour,
        perfect: rates(spot, entry, 'perfect', extra, pool, priceOf).goldPerHour,
        idleWorst: rates(spot, entry, 'idle', extra, pool, priceOf).goldPerHour,
        idleBest: rates(spot, plateau, 'idle', extra, pool, priceOf).goldPerHour,
      },
    };
  }

  /** 낮 풀 기준 1회 캐치 기대 골드(일반 폼 기준) */
  function goldPerCatchDay(
    spot: SpotId,
    o: DrawOptions = {},
    priceOf: (fish: Fish) => number = defaultPriceOf,
  ): number {
    return mixedRows(spot, o, 'day').reduce((s, r) => s + r.prob * priceOf(r.fish), 0);
  }

  /** 낮 풀 기준 1회 캐치 기대 명성 */
  function famePerCatchDay(spot: SpotId, o: DrawOptions = {}): number {
    return mixedRows(spot, o, 'day').reduce((s, r) => s + r.prob * RARITY[r.fish.rarity].fame, 0);
  }

  return {
    mixedRows,
    spotOf,
    entryLevel,
    plateauLevel,
    rodSpec,
    axisAvailable,
    axisOptions,
    cycleOf,
    meanCycleSec,
    cycleSecAt,
    rates,
    moveGap,
    perfectOverIdle,
    spotAxisHourlyGold,
    goldPerCatchDay,
    famePerCatchDay,
  };
}

const defaultEngine = createBalanceEvEngine();

export const {
  mixedRows,
  spotOf,
  entryLevel,
  plateauLevel,
  rodSpec,
  axisAvailable,
  axisOptions,
  cycleOf,
  meanCycleSec,
  cycleSecAt,
  rates,
  moveGap,
  perfectOverIdle,
  spotAxisHourlyGold,
  goldPerCatchDay,
  famePerCatchDay,
} = defaultEngine;
