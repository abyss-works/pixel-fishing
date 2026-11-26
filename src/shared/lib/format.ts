// 표시용 숫자·크기·골드 포맷 — 클라이언트와 서버가 공유하는 단일 근원.
// 상대 import 없이 순수 JS/TS로 유지해 Node ESM 서버와 브라우저 양쪽에서 쓴다.

/** 천 단위 쉼표를 넣은 한국어 숫자 표기 */
export const fmtNum = (n: number): string => n.toLocaleString('ko-KR');

/** 골드 표기 — 숫자와 단위는 붙여 쓴다(500G, 1,200G) */
export const fmtGold = (n: number): string => `${fmtNum(n)}G`;

/** 물고기 크기(cm 값) — 1m 미만은 cm 소수 한 자리, 1m 이상은 m 소수 두 자리(99.9cm · 3.85m) */
export function fmtSize(cm: number): string {
  return Math.round(cm * 10) / 10 < 100 ? `${cm.toFixed(1)}cm` : `${(cm / 100).toFixed(2)}m`;
}
