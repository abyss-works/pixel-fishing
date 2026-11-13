// 방치(auto) 배수 — 해역 요구 파워 대비 낚싯대 레벨 차에 따른 일반 등급 가중치 배수.
// 레벨 차는 요구 파워를 넘은 만큼의 파워를 5로 나눈 몫이다(레벨당 파워 +5). 미달은 레벨 차 0으로 본다.
// 미달 페널티와 존은 stats.powerZones가 판정한다. 서버 리듀서와 UI는 같은 함수를 쓴다.
import { powerReqOf } from '../content/spots.js';
import type { SpotId } from '../content/spots.js';

/** 요구 파워 대비 레벨 차 1단계에 해당하는 파워 */
const POWER_PER_LEVEL = 5;

/** 레벨 차 0, 1, 2, ...에 대한 배수. 마지막 값이 하한이다. 모든 해역이 같은 표를 쓴다 */
export const IDLE_BOOST_STEPS: readonly number[] = [5, 5, 4, 4, 3];

/** 방치 두 축의 배수 — 진입(레벨 차 0)과 플래토(하한). 측정과 관리자 화면의 고정 다이얼이 쓴다 */
export function idleDialsOf(_spot: SpotId): { entry: number; plateau: number } {
  return { entry: IDLE_BOOST_STEPS[0], plateau: IDLE_BOOST_STEPS[IDLE_BOOST_STEPS.length - 1] };
}

export function relativeIdleBoost(power: number, spot: SpotId): number {
  const levels = Math.max(0, Math.floor((power - powerReqOf(spot)) / POWER_PER_LEVEL));
  return IDLE_BOOST_STEPS[Math.min(levels, IDLE_BOOST_STEPS.length - 1)];
}
