// 파워 게이트 스케일링 — 진입 요구 대비 **초과 파워**를 계단식으로 환산하는 단일 모듈.
// "초과 5당 한 칸" 보정이 여러 축에서 반복돼서 계단 산식만 여기서 정의한다.
// 방향·보폭·상한은 각 축의 정책이다:
//   방치 완화 relativeIdleBoost — 일반 가중치 부스트 ×10→×4 (칸당 −1, 감소)
//   수동 보정   manualPowerBonus — 일반 가중치 분모 ×1.0→×2.0 (칸당 +0.1, 증가)
// 미달(파워 < 요구)은 어느 쪽도 여기서 다루지 않는다 — 미달 페널티·존은
// powerZones(stats.ts) 소관이다. 서버 리듀서(api/action)와 UI가 같은 함수를 쓴다.
import { AUTO_COMMON_BOOST } from './balance.js';

/** 초과 파워를 계단 수로 — step당 1칸, 미달(음수)은 0칸 */
const stepsOf = (excessPower: number, step: number): number =>
  Math.max(0, Math.floor(excessPower / step));

/** 계단 산식 공통 — base에서 시작해 칸당 perStep 이동하고 [min,max]로 묶는다 */
export function stepLadder(excessPower: number, o: {
  step: number; perStep: number; base: number; min?: number; max?: number;
}): number {
  const v = o.base + o.perStep * stepsOf(excessPower, o.step);
  return Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, v));
}

// ---------- 방치(auto) 완화 — 진입 대비 상대 계단 (v0.6.3 도입, fishing.ts에서 이주) ----------
// 진입 파워에서 ×10, 초과 5마다 ×1 감소, 하한 ×4. 예: 초과 0=×10 · 25=×5 · 30+=×4.
export function relativeIdleBoost(power: number, entryReq: number): number {
  return stepLadder(power - entryReq, {
    step: 5, perStep: -1, base: AUTO_COMMON_BOOST.from, min: AUTO_COMMON_BOOST.to,
  });
}

// ---------- 수동 보정 — 초과 5당 ×0.1, 최대 ×2.0 (v0.6.4) ----------
// rollFish 산식상 rareMult 배수는 **일반 가중치 나눗셈**과 동치라(rollFish·JUDGMENT_MULT 주석),
// 판정 배수에 이 값을 곱하는 것이 곧 "일반 가중치를 수치만큼 나누는" 수동 어드밴티지다.
// 자동낚시 페널티 완화(relativeIdleBoost)의 거울 축이다. 예: 초과 0=×1.0 · 5=×1.1 · 50+=×2.0.
export const MANUAL_POWER_BONUS = { step: 5, perStep: 0.1, base: 1, max: 2 } as const;

export function manualPowerBonus(power: number, entryReq: number): number {
  return stepLadder(power - entryReq, MANUAL_POWER_BONUS);
}
