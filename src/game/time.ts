// 낮/밤 시간대 — 순수 파생 모듈 (벽시계 주기)
//
// 사용자 확정(2026-09-06): **하루 = 1시간(실시간)**, 정각 = 게임 24:00(자정). 밤 20분·낮 40분.
// 벽시계에서 파생하므로 **상태 0·마이그레이션 0** — 모든 유저가 같은 시간대를 공유하고,
// 서버(액션)가 판정해 클라가 시각을 주장할 여지가 없다(time-and-artifacts 2절 배관 그대로).
//
// 주기 위치 = 분침(0~59). 정각(분침 0) = 자정 = 밤 시작.
//   [0, NIGHT_MIN)   = 밤  (게임 0~8시 — 자정~새벽)
//   [NIGHT_MIN, 60)  = 낮  (게임 8~24시)
// 분 위치는 타임존과 무관하다(UTC 분 = 로컬 분) — ISO(UTC) 문자열을 그대로 쓴다.

/** 주기 상수 — 값 변경 시 테스트(dayPhase 경계)와 함께 바꾼다 */
export const DAY_CYCLE_MIN = 60;    // 하루 = 실제 60분
export const NIGHT_MIN = 20;        // 밤 = 실제 20분 (게임 8시간)

export type DayPhase = 'day' | 'night';

export function isNight(nowIso: string): boolean {
  const d = new Date(nowIso);
  if (Number.isNaN(d.getTime())) return false; // 손상 시각은 낮으로 — 캐치를 막지 않는다
  return d.getMinutes() < NIGHT_MIN;
}

export function dayPhase(nowIso: string): DayPhase {
  return isNight(nowIso) ? 'night' : 'day';
}

/** 경계 시각 — NIGHT_MIN 분. 테스트가 이 값으로 낮/밤 전환을 검증한다 */
export const NIGHT_START_MIN = 0;
export const DAY_START_MIN = NIGHT_MIN;
