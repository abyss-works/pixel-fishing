// 방치(auto) 배수 — 해역 요구 파워 대비 낚싯대 레벨 차에 따른 일반 등급 가중치 배수.
// 레벨 차는 요구 파워를 넘은 만큼의 파워를 5로 나눈 몫이다(레벨당 파워 +5). 미달은 레벨 차 0으로 본다.
// 미달 페널티와 존은 stats.powerZones가 판정한다. 서버 리듀서와 UI는 같은 함수를 쓴다.
import { topZoneOfSpot } from '../content/zones.js';
import { powerReqOf } from '../content/spots.js';
import type { SpotId } from '../content/spots.js';

/** 요구 파워 대비 레벨 차 1단계에 해당하는 파워 */
const POWER_PER_LEVEL = 5;

/** 레벨 차 0, 1, 2, ...에 대한 배수. 마지막 값이 하한이다 */
export const IDLE_BOOST_STEPS = {
  /** 마을 해역(최상위 구역이 마을) */
  village: [10, 9, 8, 7, 6, 5, 4],
  /** 태평양 이후 해역 */
  world: [5, 5, 4, 4, 3],
} as const;

export function relativeIdleBoost(power: number, spot: SpotId): number {
  const steps = topZoneOfSpot(spot) === 'village' ? IDLE_BOOST_STEPS.village : IDLE_BOOST_STEPS.world;
  const levels = Math.max(0, Math.floor((power - powerReqOf(spot)) / POWER_PER_LEVEL));
  return steps[Math.min(levels, steps.length - 1)];
}
