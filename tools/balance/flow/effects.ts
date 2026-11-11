// 요리 효과 지표 — 효과를 넣었을 때 해역별 수입, 도감 완성 시간, 분해 재료 공급이 효과 없음 대비 얼마나 달라지는지 잰다.
// 확률과 가격은 측정 모델(`rates`)과 제품 추첨 규칙(`addGradeEffect`로 거는 등급 가중치 효과, 돌연변이 확률, 네임드 조우 가중치)을 그대로 불러 계산하고, 값을 복제하지 않는다.
// 효과는 여섯 가지 매개변수다. 기본값은 모두 효과 없음이다.
//   bite: 입질 대기 단축 비율(0.1은 10% 단축). 대기 전체(파워 미달 가산 포함)에 (1 - bite)를 곱한다
//   rare: 희귀 이상(희귀, 영웅, 전설) 등급 가중치 증가 비율. 등급마다 (1 + 합)을 한 번 곱하는 제품 규칙의 효과 합산에 더한다
//   variant: 돌연변이 확률 배수. 확률에 곱하고 1에서 멈춘다
//   size: 크기 배수. 판매가와 도감 완성 조건이 크기를 쓰지 않으므로 이 지표들에 영향이 없다
//   move: 이동 속도 증가 비율. 실질 낚시 시간 밖의 이동만 줄이므로 낚시 시간당 수입은 그대로이고, 판매 왕복을 넣은 수입에서만 달라진다
//   named: 네임드 조우 가중치 증가 비율. 수입은 그대로이고 조우까지의 기대 시간만 달라진다
// 가정: 수동 낚시(미끼 슬롯)는 같은 모델의 GOOD 판정 축으로 잰다. 도감 완성은 한 해역에서만 낚을 때의 시간이다.
//   도감 완성 시간은 캐치 단위 몬테카를로이며 캐치 수를 그 조건의 캐치 속도로 시간으로 바꾼다. 시드가 같으면 결과가 같다.
//   어종 천장, 네임드 천장 외의 장치, 가방 한도, 유물은 넣지 않는다. 분해 재료의 등급별 단위는 설계 초안 값이고 바뀔 수 있어 옵션으로 받는다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import type { RarityId } from '../../../src/game/content/rarity';
import { VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { addGradeEffect, namedWeightsOf, variantShare } from '../../../src/game/rules/logic';
import type { DrawOptions } from '../../../src/game/rules/logic';
import { NAMED_PITY_CATCHES } from '../../../src/game/rules/pity';
import { VARIANT_EV, entryLevel, meanCycleSec, rates, rng } from '../model';
import type { Axis, Pool, Rates, Row } from '../model';
import { expectedEncounterCatches } from './bounty';
import { axisOf } from './progress';
import type { FlowAxis } from './progress';
import { summarize } from './sample';
import type { Dist } from './sample';

export interface Effect {
  bite: number; rare: number; variant: number; size: number; move: number; named: number;
}

export const NO_EFFECT: Effect = { bite: 0, rare: 0, variant: 1, size: 1, move: 0, named: 0 };

export const isNoEffect = (e: Effect): boolean => (Object.keys(NO_EFFECT) as (keyof Effect)[]).every(k => e[k] === NO_EFFECT[k]);

/** 효과 매개변수 검사 — 범위를 벗어나면 오류 */
export function checkEffect(e: Effect): void {
  const bad = (msg: string) => { throw new Error(msg); };
  if (!(e.bite >= 0 && e.bite < 1)) bad('입질 대기 단축은 0 이상 100 미만(%)이어야 합니다');
  if (!(e.rare >= 0)) bad('희귀 이상 가중 증가는 0 이상(%)이어야 합니다');
  if (!(e.variant > 0)) bad('돌연변이 확률 배수는 0보다 커야 합니다');
  if (!(e.size > 0)) bad('크기 배수는 0보다 커야 합니다');
  if (!(e.move > -1)) bad('이동 속도 증가는 -100 초과(%)여야 합니다');
  if (!(e.named >= 0)) bad('네임드 조우 증가는 0 이상(%)이어야 합니다');
}

/** 분해 재료의 등급별 단위 — 설계 초안(일반 1, 희귀 5, 영웅 25, 전설 125) */
export const DEFAULT_UNITS: Record<RarityId, number> = { common: 1, rare: 5, epic: 25, legendary: 125 };

const GRADES_RARE_UP: readonly RarityId[] = RARITY_ORDER.filter(r => r !== 'common');
/** 도감 완성 시뮬레이션이 한 시도에서 낚는 최대 캐치 수 — 넘으면 끝내지 못한 시도로 센다 */
export const DEX_CATCH_CAP = 2_000_000;

export interface EffectRates extends Rates { variantShare: number }

const variantEv = (share: number): number => 1 + share * (VARIANT_PRICE_MULT - 1);

/** 효과를 넣은 수입 — 측정 모델의 수입을 바탕으로 입질 대기 단축은 캐치 주기에, 희귀 가중은 추첨 옵션에, 돌연변이 배수는 판매가 기댓값에 반영한다 */
export function effectRates(spot: SpotId, level: number, axis: Axis, e: Effect, pool: Pool = 'mixed'): EffectRates {
  let extra: DrawOptions = {};
  if (e.rare !== 0) for (const g of GRADES_RARE_UP) extra = addGradeEffect(extra, g, e.rare);
  const base = rates(spot, level, axis, extra, pool);
  const cycle = {
    ...base.cycle,
    biteMin: base.cycle.biteMin * (1 - e.bite), biteMax: base.cycle.biteMax * (1 - e.bite), biteExtra: base.cycle.biteExtra * (1 - e.bite),
  };
  const cph = 3600 / meanCycleSec(cycle);
  const share = Math.min(1, variantShare() * e.variant);
  const scale = cph / base.catchesPerHour;
  return {
    ...base, cycle, catchesPerHour: cph, variantShare: share,
    goldPerHour: base.goldPerHour * scale * variantEv(share) / VARIANT_EV,
    famePerHour: base.famePerHour * scale,
  };
}

/** 해역마다 재는 낚싯대 레벨 */
const levelOf = (spot: SpotId, margin: number): number => entryLevel(spot) + margin;

// ── 1. 효과를 넣은 수입 ──

/** 판매 왕복을 넣은 수입 계산에 쓰는 해역별 가방 채움 시간과 왕복 시간(초) */
export interface TripTime { fillSec: number; tripSec: number }

export interface NamedRow {
  /** 조우 확률(캐치당)과 천장을 넣은 기대 조우 시간(시간) */
  shareBase: number; shareWith: number; hoursBase: number; hoursWith: number;
}

export interface IncomeRow {
  spot: SpotId; level: number;
  goldBase: number; goldWith: number; goldChange: number;
  fameBase: number; fameWith: number; fameChange: number;
  /** 판매 왕복을 넣은 시간당 골드 변화. 왕복 시간을 주지 않았으면 null */
  tripChange: number | null;
  named: NamedRow;
}

export interface IncomeOptions {
  axis: FlowAxis; effect: Effect; margin: number;
  /** 해역별 가방 채움과 왕복 시간 — 있으면 이동 속도 효과를 넣은 수입 변화를 함께 낸다 */
  trips?: ReadonlyMap<SpotId, TripTime>;
}

const change = (base: number, now: number): number => (base === 0 ? 0 : now / base - 1);

export function incomeRows(o: IncomeOptions): IncomeRow[] {
  checkEffect(o.effect);
  return SPOTS.map(s => {
    const level = levelOf(s.id, o.margin), axis = axisOf(o.axis, s.id, level);
    const base = effectRates(s.id, level, axis, NO_EFFECT), now = effectRates(s.id, level, axis, o.effect);
    const trip = o.trips?.get(s.id);
    let tripChange: number | null = null;
    if (trip) {
      const fillWith = trip.fillSec * base.catchesPerHour / now.catchesPerHour;
      const tripWith = trip.tripSec / (1 + o.effect.move);
      const kept = (fill: number, t: number) => fill / (fill + t);
      tripChange = change(base.goldPerHour * kept(trip.fillSec, trip.tripSec), now.goldPerHour * kept(fillWith, tripWith));
    }
    const perHour = (r: EffectRates, bonus: number) => {
      const w = namedWeightsOf(s.id, bonus);
      const p = w.named / (w.named + w.none);
      return { share: p, hours: expectedEncounterCatches(p, NAMED_PITY_CATCHES) / r.catchesPerHour };
    };
    const nb = perHour(base, 0), nw = perHour(now, o.effect.named);
    return {
      spot: s.id, level,
      goldBase: base.goldPerHour, goldWith: now.goldPerHour, goldChange: change(base.goldPerHour, now.goldPerHour),
      fameBase: base.famePerHour, fameWith: now.famePerHour, fameChange: change(base.famePerHour, now.famePerHour),
      tripChange,
      named: { shareBase: nb.share, shareWith: nw.share, hoursBase: nb.hours, hoursWith: nw.hours },
    };
  });
}

// ── 2. 도감 완성 시간 ──

export interface DexTimes {
  /** 일반 폼 전부(전설 제외), 일반 폼 전부, 돌연변이 폼 전부를 모으는 실질 낚시 시간(시간)의 분포. 시도가 하나도 끝나지 않으면 null */
  noLegend: Dist | null; all: Dist | null; variant: Dist | null;
}

export interface DexRow {
  spot: SpotId; level: number;
  species: number; legendary: number;
  base: DexTimes; with: DexTimes;
}

export interface DexOptions {
  axis: FlowAxis; effect: Effect; margin: number; trials: number; seed: number;
}

/** 한 해역의 도감 완성 시간 몬테카를로 — 캐치마다 어종과 폼을 뽑아 세 조건의 완성 캐치 수를 센다 */
export function dexTimes(rows: readonly Row[], share: number, catchesPerHour: number, trials: number, rand: () => number): DexTimes {
  const n = rows.length;
  const legend = rows.map(r => r.fish.rarity === 'legendary');
  const needNoLegend = legend.filter(l => !l).length;
  let acc = 0;
  const cum = rows.map(r => (acc += r.prob));
  const total = cum[n - 1] ?? 0;
  const reachable = n > 0 && rows.every(r => r.prob > 0);
  const out = { noLegend: [] as number[], all: [] as number[], variant: [] as number[] };
  if (reachable) {
    for (let t = 0; t < trials; t++) {
      const normal = new Uint8Array(n), variant = new Uint8Array(n);
      let nNormal = 0, nVariant = 0, nNoLegend = 0, catches = 0;
      let tNo = needNoLegend === 0 ? 0 : -1, tAll = -1, tVar = share > 0 ? -1 : Number.POSITIVE_INFINITY;
      while ((tNo < 0 || tAll < 0 || tVar < 0) && catches < DEX_CATCH_CAP) {
        catches++;
        const x = rand() * total;
        let lo = 0, hi = n - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cum[mid]) hi = mid; else lo = mid + 1; }
        if (rand() < share) {
          if (!variant[lo]) { variant[lo] = 1; nVariant++; if (nVariant === n) tVar = catches; }
        } else if (!normal[lo]) {
          normal[lo] = 1; nNormal++;
          if (!legend[lo]) { nNoLegend++; if (nNoLegend === needNoLegend) tNo = catches; }
          if (nNormal === n) tAll = catches;
        }
      }
      const hours = (c: number) => c / catchesPerHour;
      if (tNo >= 0) out.noLegend.push(hours(tNo));
      if (tAll >= 0) out.all.push(hours(tAll));
      if (tVar >= 0 && Number.isFinite(tVar)) out.variant.push(hours(tVar));
    }
  }
  const dist = (v: number[]) => summarize(v, trials - v.length);
  return { noLegend: dist(out.noLegend), all: dist(out.all), variant: dist(out.variant) };
}

export function dexRows(o: DexOptions): DexRow[] {
  checkEffect(o.effect);
  if (!Number.isInteger(o.trials) || o.trials < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
  return SPOTS.map((s, i) => {
    const level = levelOf(s.id, o.margin), axis = axisOf(o.axis, s.id, level);
    const run = (e: Effect): DexTimes => {
      const r = effectRates(s.id, level, axis, e);
      return dexTimes(r.rows, r.variantShare, r.catchesPerHour, o.trials, rng(o.seed + i));
    };
    const rows = effectRates(s.id, level, axis, NO_EFFECT).rows;
    return {
      spot: s.id, level, species: rows.length, legendary: rows.filter(r => r.fish.rarity === 'legendary').length,
      base: run(NO_EFFECT), with: run(o.effect),
    };
  });
}

// ── 3. 재료 공급 ──

export interface SupplyRow {
  spot: SpotId; level: number;
  /** 낚시 1시간에 분해로 모이는 등급별 재료 개수(물고기 한 마리가 재료 한 개) */
  counts: Record<RarityId, number>;
  /** 등급별 단위로 환산한 재료 점수와, 같은 시간 팔았을 때 골드 */
  score: number; gold: number;
  /** 효과를 넣은 점수와 골드 */
  scoreWith: number; goldWith: number;
}

export interface SupplyOptions {
  axis: FlowAxis; effect: Effect; margin: number;
  units: Record<RarityId, number>;
}

export function supplyRows(o: SupplyOptions): SupplyRow[] {
  checkEffect(o.effect);
  const scoreOf = (r: EffectRates) => RARITY_ORDER.reduce((s, g) => s + (r.rarity[g] ?? 0) * r.catchesPerHour * o.units[g], 0);
  return SPOTS.map(s => {
    const level = levelOf(s.id, o.margin), axis = axisOf(o.axis, s.id, level);
    const base = effectRates(s.id, level, axis, NO_EFFECT), now = effectRates(s.id, level, axis, o.effect);
    const counts = Object.fromEntries(RARITY_ORDER.map(g => [g, (base.rarity[g] ?? 0) * base.catchesPerHour])) as Record<RarityId, number>;
    return {
      spot: s.id, level, counts, score: scoreOf(base), gold: base.goldPerHour,
      scoreWith: scoreOf(now), goldWith: now.goldPerHour,
    };
  });
}

export interface EffectsReport {
  effect: Effect; units: Record<RarityId, number>; margin: number; trials: number; seed: number;
  income: IncomeRow[]; dex: DexRow[]; supply: SupplyRow[];
}
