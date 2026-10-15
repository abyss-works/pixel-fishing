// 어군 표현의 순수 계산 — 마커가 어디에 있을지(궤도)와 훅 점프 높이.
// 캔버스에 닿지 않아 테스트 가능하다. 그리기는 overlays.drawSchools·drawHookJump가 맡는다.

export interface OrbitPoint { dx: number; dy: number; faceLeft: boolean }

/** 어군 궤도 — 타원 위를 돈다. bite면 반지름이 줄고 빨라져 찌 쪽으로 몰려든다 */
export function orbit(i: number, t: number, bite: boolean): OrbitPoint {
  const speed = bite ? 4.2 : 1.6, rx = bite ? 3 : 7, ry = bite ? 2 : 5;
  const a = t * speed + i * 2.09;
  return { dx: Math.cos(a) * rx, dy: Math.sin(a) * ry, faceLeft: Math.sin(a) >= 0 };
}

/** 훅 점프 — catch 전이 후 경과 초 → 수면 위 높이(px). 0.6초 안에 올라갔다 떨어지고, 그 뒤 0 */
export const JUMP_S = 0.6;
export const JUMP_PX = 14;
export function jumpHeight(catchT: number): number {
  if (catchT < 0 || catchT >= JUMP_S) return 0;
  return Math.round(Math.sin((catchT / JUMP_S) * Math.PI) * JUMP_PX);
}
