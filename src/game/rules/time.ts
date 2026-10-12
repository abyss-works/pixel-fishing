// 낮/밤 시간대 — 순수 파생 모듈 (벽시계 주기)
//
// 사용자 확정(2026-09-06): **하루 = 1시간(실시간)**, 정각 = 게임 24:00(자정).
//   낮 = 게임 04:00~20:00 · 밤 = 게임 20:00~다음날 04:00
// 벽시계에서 파생하므로 **상태 0·마이그레이션 0** — 모든 유저가 같은 시간대를 공유하고,
// 서버(액션)가 판정해 클라가 시각을 주장할 여지가 없다(time-and-artifacts 2절 배관 그대로).
//
// 주기 위치 = 분침(0~59). 정각(분침 0) = 자정.
//   1실제분 = 0.4게임시 (60실제분 = 게임 24시간):
//     분 10 = 게임 04:00 (해 뜸 — 낮 시작)
//     분 50 = 게임 20:00 (해 짐 — 밤 시작)
//   낮 = 분 [10, 50) · 밤 = 분 [50, 60) ∪ [0, 10)   (밤이 자정을 감싸는 순환 구간)
// 분 위치는 타임존과 무관하다(UTC 분 = 로컬 분) — ISO(UTC) 문자열을 그대로 쓴다.

/** 주기 상수 — 값 변경 시 테스트(dayPhase 경계)와 함께 바꾼다 */
export const DAY_CYCLE_MIN = 60;    // 하루 = 실제 60분

/** 해 뜨는 시각(실제 분) = 게임 04:00 — 이 순간부터 낮 */
export const DAY_START_MIN = 10;
/** 해 지는 시각(실제 분) = 게임 20:00 — 이 순간부터 밤 */
export const NIGHT_START_MIN = 50;

export type DayPhase = 'day' | 'night';

export function isNight(nowIso: string): boolean {
  const m = cycleMinute(nowIso);
  if (m === null) return false; // 손상 시각은 낮으로 — 캐치를 막지 않는다
  return m >= NIGHT_START_MIN || m < DAY_START_MIN; // 밤 = 20시~4시 (자정 감쌈)
}

export function dayPhase(nowIso: string): DayPhase {
  return isNight(nowIso) ? 'night' : 'day';
}

/** 주기 내 위치(분 0~59). null = 손상 시각. UI 어둠·게임시각 파생의 입력 */
export function cycleMinute(nowIso: string): number | null {
  const d = new Date(nowIso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getMinutes();
}

/** 게임 시각(0~24시, 소수) — 1실제분 = 0.4게임시(하루 60분=게임 24시간).
 *  분 10 = 게임 4시(낮 시작) · 분 50 = 게임 20시(밤 시작). */
export function gameHour(nowIso: string): number | null {
  const m = cycleMinute(nowIso);
  return m === null ? null : m * (24 / DAY_CYCLE_MIN);
}

/** 게임 시각을 HH:MM으로 (예: 게임 3.2시 → "03:12"). 1게임시 = 실제 2.5분. */
export function formatGameClock(nowIso: string): string {
  const h = gameHour(nowIso);
  if (h === null) return '--:--';
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60); // 0.4게임시 = 24게임분 → 0~59
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 어둠 강도 0~1 — **경계에서 급격히 튀지 않고 서서히 변한다** (UI 연출용).
 *
 *  주기 60분(하루), 게임 1일 = 실제 1시간.
 *  낮(분 10~50)은 0. 해는 20시(분 50)부터 서서히 지고 자정(분 0)에 최대 어둠,
 *  새벽으로 갈수록 밝아져 4시(분 10)에 해가 뜬다. 분 59→0(자정)은 0.9→1로
 *  1분 계단일 뿐 체감상 연속이다. 캐치 판정(day/night)과 무관 — 순수 표시용. */
export function darkness(nowIso: string): number {
  const m = cycleMinute(nowIso);
  if (m === null) return 0;
  // 해 뜸~해 짐 사이(낮): 밝음
  if (m >= DAY_START_MIN && m < NIGHT_START_MIN) return 0;
  // 저녁~자정 (분 50~59): 0 → 자정 직전 ~0.9로 어두워짐
  if (m >= NIGHT_START_MIN) return (m - NIGHT_START_MIN) / (DAY_CYCLE_MIN - NIGHT_START_MIN);
  // 자정~새벽 (분 0~9): 0.9 → 0으로 밝아짐 (분 10에서 해 뜸)
  return (DAY_START_MIN - m) / DAY_START_MIN;
}
