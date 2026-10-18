// 밸런스 측정 모델 — 제품 규칙(추첨·낚싯대·파워 게이트)을 그대로 불러 해역별 수입과 확률을 계산한다.
//
// 가정(측정치가 아닌 근사):
//   - 낮밤 혼합 — 하루 중 밤 비율(게임 20~4시)만큼 밤 풀로 추첨한다.
//   - 처리량 = 입질 평균 대기(파워 초과 보정 포함) + 판정 시간(수동은 바의 절반, 방치는 끝까지) + 획득 연출.
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
import { minLevelOfPower, powerOfLevel, zonesFor } from '../../src/game/rules/stats';
import { manualPowerBonus, relativeIdleBoost } from '../../src/game/rules/power';
import { CATCH_MS, JUDGMENT_MULT, MUTATION_RATE, VARIANT_PRICE_MULT } from '../../src/game/rules/balance';
import { DAY_START_MIN, NIGHT_START_MIN } from '../../src/game/rules/time';

export const NIGHT_SHARE = 1 - (NIGHT_START_MIN - DAY_START_MIN) / 60;
export const VARIANT_EV = 1 + MUTATION_RATE * (VARIANT_PRICE_MULT - 1);
/** 여유 스펙 — 진입 레벨에서 몇 레벨 위를 함께 재는가 */
export const SPEC_MARGIN = 6;

export type Axis = 'normal' | 'good' | 'perfect' | 'idle';
/** 방치가 기준 축이므로 먼저 둔다 */
export const AXES: readonly Axis[] = ['idle', 'normal', 'good', 'perfect'];
export const AXIS_LABEL: Record<Axis, string> = { normal: '무판정', good: 'GOOD', perfect: 'PERFECT', idle: '방치' };

export interface Row { fish: Fish; prob: number }

/** 해역의 개체 확률 — 낮/밤 풀을 하루 중 시간 비율로 섞고 시간대마다 가중치 합으로 정규화한다 */
export function mixedRows(spot: SpotId, o: DrawOptions = {}): Row[] {
  const p = new Map<string, number>();
  for (const [phase, w] of [['day', 1 - NIGHT_SHARE], ['night', NIGHT_SHARE]] as const) {
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
  manualBonus: number; idleBoost: number;
}

/** 해역에서 이 레벨 낚싯대의 스펙 — 입질은 파워 초과 보정(진입에서 0, 진입 10배에서 30% 단축)을 넣는다 */
export function rodSpec(spot: SpotId, level: number): RodSpec {
  const st = rodStats(level);
  const power = powerOfLevel(level);
  const entry = spotOf(spot).powerReq ?? 0;
  const t = entry > 0 && power >= entry ? Math.min(1, (power - entry) / (entry * 9)) : 0;
  const factor = 1 - 0.3 * t;
  const z = zonesFor(power, entry);
  return {
    level, power,
    biteMin: st.biteMin * factor, biteMax: st.biteMax * factor, sweep: st.sweep,
    yellow: z.yellow, red: z.red,
    manualBonus: manualPowerBonus(power, entry),
    idleBoost: entry > 0 ? relativeIdleBoost(power, entry) : 10,
  };
}

/** 축이 이 스펙에서 가능한가 — PERFECT는 빨간 존이, GOOD은 노란 존이 있어야 한다 */
export const axisAvailable = (spec: RodSpec, axis: Axis): boolean =>
  axis === 'perfect' ? spec.red > 0 : axis === 'good' ? spec.yellow > 0 : true;

/** 축의 추첨 다이얼 — 리듀서와 같은 계산(수동 = 판정 배수 × 파워 보정, 방치 = 상대 페널티) */
export function axisOptions(spec: RodSpec, axis: Axis): DrawOptions {
  if (axis === 'idle') return { commonMult: spec.idleBoost };
  return { rareMult: JUDGMENT_MULT[axis] * spec.manualBonus };
}

export interface Rates {
  rows: Row[];
  catchesPerHour: number; goldPerHour: number; famePerHour: number;
  /** 등급별 출현 비율 */
  rarity: Record<string, number>;
}

export function rates(spot: SpotId, level: number, axis: Axis, extra: DrawOptions = {}): Rates {
  const spec = rodSpec(spot, level);
  const reaction = axis === 'idle' ? spec.sweep : spec.sweep / 2;
  const sec = (spec.biteMin + spec.biteMax) / 2 + reaction + CATCH_MS / 1000;
  const rows = mixedRows(spot, { ...axisOptions(spec, axis), ...extra });
  const cph = 3600 / sec;
  const rarity: Record<string, number> = {};
  for (const r of rows) rarity[r.fish.rarity] = (rarity[r.fish.rarity] ?? 0) + r.prob;
  return {
    rows, catchesPerHour: cph, rarity,
    goldPerHour: rows.reduce((s, r) => s + r.prob * r.fish.price, 0) * VARIANT_EV * cph,
    famePerHour: rows.reduce((s, r) => s + r.prob * RARITY[r.fish.rarity].fame, 0) * cph,
  };
}

/** 해역의 상위 지역 — 도감·완화 판단의 묶음 단위 */
export const zoneOf = (spot: SpotId): string => topZoneOfSpot(spot) ?? 'unknown';
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
