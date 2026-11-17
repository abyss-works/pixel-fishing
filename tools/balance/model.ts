// 밸런스 측정 모델 — 제품 규칙(추첨·낚싯대·파워 게이트)을 그대로 불러 해역별 수입과 확률을 계산한다.
//
// 가정(측정치가 아닌 근사):
//   - 낮밤 혼합 — 하루 중 밤 비율(게임 20~4시)만큼 밤 풀로 추첨한다.
//   - 처리량 = 입질 평균 대기(낚싯대 레벨 곡선, 파워 미달이면 추가 초) + 판정 시간(수동은 바의 절반, 방치는 끝까지) + 획득 연출.
//   - 수동 판정은 고른 판정을 늘 성공한다고 본다. 존이 없는 판정(빨간 존이 안 열린 PERFECT)은 측정하지 않는다.
//   - 이동·판매 왕복·가방 한도·미끼·유물은 넣지 않는다(미끼는 경제 지표에서 따로 본다). 돌연변이 기댓값은 넣는다.
import { SPOTS } from '../../src/game/content/spots';
import type { SpotId } from '../../src/game/content/spots';
import { FISH } from '../../src/game/content/fish';
import type { Fish } from '../../src/game/content/fish';
import { RARITY } from '../../src/game/content/rarity';
import { topZoneOfSpot } from '../../src/game/content/zones';
import { drawRows, rodStats } from '../../src/game/rules/logic';
import type { DrawOptions } from '../../src/game/rules/logic';
import { zonesFor } from '../../src/game/rules/stats';
import { minLevelOfPower, powerOfLevel, relativeIdleBoost } from './rodRules';
import { virtualZoneOf } from './virtualSpots';
import { CATCH_MS, JUDGMENT_MULT, VARIANT_PRICE_MULT } from '../../src/game/rules/balance';
import { variantShare } from '../../src/game/rules/logic';
import { DAY_START_MIN, NIGHT_START_MIN } from '../../src/game/rules/time';

export const NIGHT_SHARE = 1 - (NIGHT_START_MIN - DAY_START_MIN) / 60;
export const VARIANT_EV = 1 + variantShare() * (VARIANT_PRICE_MULT - 1);
/** 여유 스펙 — 진입 레벨에서 몇 레벨 위를 함께 재는가. 태평양 이후 해역에서 방치 배수가 하한에 닿는 레벨 차다 */
export const SPEC_MARGIN = 4;

export type Axis = 'normal' | 'good' | 'perfect' | 'idle';
/** 방치가 기준 축이므로 먼저 둔다 */
export const AXES: readonly Axis[] = ['idle', 'normal', 'good', 'perfect'];
export const AXIS_LABEL: Record<Axis, string> = { normal: '무판정', good: 'GOOD', perfect: 'PERFECT', idle: '방치' };

export interface Row { fish: Fish; prob: number }

/** 추첨 풀 — 낮 풀만 또는 하루 중 시간 비율로 섞은 낮밤 혼합 */
export type Pool = 'day' | 'mixed';

/** 해역의 개체 확률 — 낮/밤 풀을 하루 중 시간 비율로 섞고 시간대마다 가중치 합으로 정규화한다 */
export function mixedRows(spot: SpotId, o: DrawOptions = {}, pool: Pool = 'mixed'): Row[] {
  const p = new Map<string, number>();
  const night = pool === 'day' ? 0 : NIGHT_SHARE;
  for (const [phase, w] of [['day', 1 - night], ['night', night]] as const) {
    if (w === 0) continue;
    const rows = drawRows(spot, { ...o, phase });
    const total = rows.reduce((s, r) => s + r.fishPct, 0);
    for (const r of rows) p.set(r.fish.id, (p.get(r.fish.id) ?? 0) + w * r.fishPct / total);
  }
  return [...p].map(([id, prob]) => ({ fish: FISH.find(f => f.id === id)!, prob }));
}

export const entryLevel = (spot: SpotId): number => minLevelOfPower(spotOf(spot).powerReq ?? 0);
export const spotOf = (spot: SpotId) => SPOTS.find(s => s.id === spot)!;

export interface RodSpec {
  level: number; power: number;
  biteMin: number; biteMax: number; sweep: number;
  yellow: number; red: number;
  idleBoost: number;
  /** 파워 미달 페널티 — 일반 가중치 배수(미달이 아니면 1) */
  gateMult: number;
  /** 파워 미달 페널티 — 입질 대기에 더하는 초(미달이 아니면 0) */
  biteExtra: number;
}

/** 해역에서 이 레벨 낚싯대의 스펙 — 입질 대기는 낚싯대 레벨 곡선 그대로다(파워 초과로 줄지 않는다).
 *  파워가 해역 요구에 못 미치면 일반 가중치 배수와 입질 대기 추가 초가 붙는다 */
export function rodSpec(spot: SpotId, level: number): RodSpec {
  const st = rodStats(level);
  const power = powerOfLevel(level);
  const entry = spotOf(spot).powerReq ?? 0;
  const z = zonesFor(power, entry);
  return {
    level, power,
    biteMin: st.biteMin, biteMax: st.biteMax, sweep: st.sweep,
    yellow: z.yellow, red: z.red,
    idleBoost: relativeIdleBoost(power, spot),
    gateMult: z.mult, biteExtra: z.biteExtra,
  };
}

/** 축이 이 스펙에서 가능한가 — PERFECT는 빨간 존이, GOOD은 노란 존이 있어야 한다 */
export const axisAvailable = (spec: RodSpec, axis: Axis): boolean =>
  axis === 'perfect' ? spec.red > 0 : axis === 'good' ? spec.yellow > 0 : true;

/** 축의 추첨 다이얼 — 리듀서와 같은 계산(수동 = 판정 배수, 방치 = 해역 요구 파워 대비 방치 배수).
 *  파워 미달 배수는 일반 가중치에 곱해진다. 미달이 아니면 수동 축은 판정 배수만 담는다 */
export function axisOptions(spec: RodSpec, axis: Axis): DrawOptions {
  if (axis === 'idle') return { commonMult: spec.idleBoost * spec.gateMult };
  return spec.gateMult === 1
    ? { rareMult: JUDGMENT_MULT[axis] }
    : { rareMult: JUDGMENT_MULT[axis], commonMult: spec.gateMult };
}

/** 한 번의 캐치에 드는 시간의 구성 — 입질 대기는 [biteMin, biteMax] 균등이고 나머지는 고정 초다 */
export interface Cycle { biteMin: number; biteMax: number; biteExtra: number; reaction: number }

/** 낚싯대 스펙과 축의 캐치 주기 — 반응 시간은 방치가 바 끝까지, 수동은 절반이다 */
export function cycleOf(spec: RodSpec, axis: Axis): Cycle {
  return {
    biteMin: spec.biteMin, biteMax: spec.biteMax, biteExtra: spec.biteExtra,
    reaction: axis === 'idle' ? spec.sweep : spec.sweep / 2,
  };
}

/** 캐치 한 번의 평균 시간(초) — 획득 연출을 더한다 */
export const meanCycleSec = (c: Cycle): number => (c.biteMin + c.biteMax) / 2 + c.biteExtra + c.reaction + CATCH_MS / 1000;

/** 캐치 한 번의 시간(초)을 입질 대기 균등 표본 u(0 이상 1 미만)로 계산한다 */
export const cycleSecAt = (c: Cycle, u: number): number => c.biteMin + u * (c.biteMax - c.biteMin) + c.biteExtra + c.reaction + CATCH_MS / 1000;

export interface Rates {
  rows: Row[];
  cycle: Cycle;
  catchesPerHour: number; goldPerHour: number; famePerHour: number;
  /** 등급별 출현 비율 */
  rarity: Record<string, number>;
}

export function rates(spot: SpotId, level: number, axis: Axis, extra: DrawOptions = {}, pool: Pool = 'mixed'): Rates {
  const spec = rodSpec(spot, level);
  const cycle = cycleOf(spec, axis);
  const sec = meanCycleSec(cycle);
  const rows = mixedRows(spot, { ...axisOptions(spec, axis), ...extra }, pool);
  const cph = 3600 / sec;
  const rarity: Record<string, number> = {};
  for (const r of rows) rarity[r.fish.rarity] = (rarity[r.fish.rarity] ?? 0) + r.prob;
  return {
    rows, cycle, catchesPerHour: cph, rarity,
    goldPerHour: rows.reduce((s, r) => s + r.prob * r.fish.price, 0) * VARIANT_EV * cph,
    famePerHour: rows.reduce((s, r) => s + r.prob * RARITY[r.fish.rarity].fame, 0) * cph,
  };
}

export interface MoveGap {
  /** 새 해역의 진입 레벨에서의 방치 시간당 골드 */
  gold: number;
  /** 같은 레벨로 낚을 수 있는 이전 해역 중 방치 시간당 골드가 가장 높은 해역과 그 값. 없으면 undefined */
  from: SpotId | undefined; fromGold: number;
  /** 새 해역 ÷ 비교 해역. 비교 해역이 없으면 Infinity */
  ratio: number;
}

/** 이동 직후 수입 — rateOf를 주면 그 수입 계산(효과를 넣은 값 등)으로, 새 해역 진입 레벨에서 그 해역의 방치 시간당 골드를, 같은 레벨로 낚을 수 있는(요구 파워를 채운) 이전 해역 중 가장 높은 값과 비교한다.
 *  `gold`는 새 해역 값, 차는 `gold - fromGold`다(0 이상이어야 한다). */
export function moveGap(
  index: number, pool: Pool,
  rateOf: (spot: SpotId, level: number, pool: Pool, boat: number) => Rates = (spot, level, p) => rates(spot, level, 'idle', {}, p),
): MoveGap & { diff: number } {
  const here = SPOTS[index].id;
  const level = entryLevel(here);
  const power = powerOfLevel(level);
  const boat = SPOTS[index].boatTier;
  const gold = rateOf(here, level, pool, boat).goldPerHour;
  let from: SpotId | undefined, fromGold = 0;
  for (const prev of SPOTS.slice(0, index)) {
    if ((prev.powerReq ?? 0) > power) continue;
    const g = rateOf(prev.id, level, pool, boat).goldPerHour;
    if (g > fromGold) { from = prev.id; fromGold = g; }
  }
  return { gold, from, fromGold, ratio: fromGold > 0 ? gold / fromGold : Infinity, diff: gold - fromGold };
}

/** 같은 해역, 같은 레벨에서 PERFECT 다이얼의 시간당 골드 ÷ 방치의 시간당 골드(낮밤 혼합).
 *  빨간 존이 열렸는지와 관계없이 PERFECT 다이얼을 적용한 값이므로 실제 PERFECT 수입의 상한이다. */
export function perfectOverIdle(spot: SpotId, level: number): number {
  return rates(spot, level, 'perfect').goldPerHour / rates(spot, level, 'idle').goldPerHour;
}

/** 해역의 상위 지역 — 도감·완화 판단의 묶음 단위 */
export const zoneOf = (spot: SpotId): string => topZoneOfSpot(spot) ?? virtualZoneOf(spot) ?? 'unknown';
export const ZONE_ORDER: string[] = [...new Set(SPOTS.map(s => zoneOf(s.id)))];
export const spotsOfZone = (zone: string) => SPOTS.filter(s => zoneOf(s.id) === zone);

/** 시드 고정 난수(mulberry32) — 같은 시드면 같은 결과 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 순서 있는 값의 이웃 역전 — 뒤가 앞보다 작은 쌍 */
export function inversions<T>(items: readonly T[], value: (t: T) => number): { from: T; to: T; drop: number }[] {
  const out: { from: T; to: T; drop: number }[] = [];
  for (let i = 0; i + 1 < items.length; i++) {
    const a = value(items[i]), b = value(items[i + 1]);
    if (b < a) out.push({ from: items[i], to: items[i + 1], drop: b / a - 1 });
  }
  return out;
}

/** 완화 여유 — 다음 항목의 값을 넘지 않고 올릴 수 있는 최대 비율. 이미 역전이면 음수 */
export function headroom(cur: number, next: number): number {
  return next / cur - 1;
}
