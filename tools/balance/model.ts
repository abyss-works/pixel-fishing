// 밸런스 측정 모델 — 통합 EV 엔진에 도구용 동적 낚싯대 규칙과 지역·통계 보조를 연결한다.
import { SPOTS } from '../../src/game/content/spots';
import type { SpotId } from '../../src/game/content/spots';
import { topZoneOfSpot } from '../../src/game/content/zones';
import {
  AXES, AXIS_LABEL, NIGHT_SHARE, SPEC_MARGIN, VARIANT_EV, createBalanceEvEngine,
} from '../../src/game/rules/balanceEv.js';
import type { Axis, Cycle, MoveGap, Pool, Rates, RodSpec, Row } from '../../src/game/rules/balanceEv.js';
import { minLevelOfPower, powerOfLevel, relativeIdleBoost } from './rodRules';
import { virtualZoneOf } from './virtualSpots';

export { AXES, AXIS_LABEL, NIGHT_SHARE, SPEC_MARGIN, VARIANT_EV };
export type { Axis, Cycle, MoveGap, Pool, Rates, RodSpec, Row };

const engine = createBalanceEvEngine({ powerOfLevel, minLevelOfPower, relativeIdleBoost });

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
} = engine;

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
