// 낮/밤 시간대 — 순수 파생 모듈 (벽시계 주기)
//
// **하루 = 1시간(3,600초, 실시간)**, 정각 = 게임 00:00(자정).
//   낮 = 게임 06:00~22:00 · 밤 = 게임 22:00~다음날 06:00 (실제 25초 = 게임 10분, 시간당 144스텝)
// 벽시계에서 파생하므로 **상태 0·마이그레이션 0** — 모든 유저가 같은 시간대를 공유하고,
// 서버(액션)가 판정해 클라가 시각을 주장할 여지가 없다.
//
// 주기 위치 = 25초 단위 스텝(0~143). 정각(스텝 0) = 00:00(자정).
//     분 05 (스텝 12)  = 게임 02:00 (밤 깊이·어둠 정점)
//     분 15 (스텝 36)  = 게임 06:00 (해 뜸 — 낮 시작)
//     분 55 (스텝 132) = 게임 22:00 (해 짐 — 밤 시작)
//   낮 = 스텝 [36, 132) · 밤 = 스텝 [132, 144) ∪ [0, 36)   (밤이 자정을 감싸는 순환 구간)
// UTC 분·초를 사용하므로 타임존과 무관하다.

/** 주기 상수 — 값 변경 시 경계 테스트와 함께 바꾼다 */
export const DAY_CYCLE_MIN = 60;      // 하루 = 실제 60분
export const DAY_CYCLE_SEC = 3600;    // 하루 = 실제 3,600초
export const CLOCK_STEP_SEC = 25;     // 1스텝 = 실제 25초 (게임 10분)

/** 해 뜨는 시각(실제 분) = 게임 06:00 — 이 순간부터 낮 */
export const DAY_START_MIN = 15;
/** 해 지는 시각(실제 분) = 게임 22:00 — 이 순간부터 밤 */
export const NIGHT_START_MIN = 55;
/** 밤 깊이 정점 시각(실제 분) = 게임 02:00 */
export const NIGHT_PEAK_MIN = 5;
/** 밤 반주기 스텝 수 (22:00→02:00, 02:00→06:00 각각 24스텝) */
export const NIGHT_HALF_STEPS = 24;
/** 밤 전체 스텝 수 (22:00~06:00 총 48스텝) */
export const NIGHT_TOTAL_STEPS = 48;

const DAY_START_STEP = (DAY_START_MIN * 60) / CLOCK_STEP_SEC;     // 36 (06:00)
const NIGHT_START_STEP = (NIGHT_START_MIN * 60) / CLOCK_STEP_SEC; // 132 (22:00)
const NIGHT_OFFSET_STEPS = NIGHT_HALF_STEPS - (NIGHT_PEAK_MIN * 60) / CLOCK_STEP_SEC; // 12 (22:00→00:00 스텝)

export type DayPhase = 'day' | 'night';

/** 주기 내 25초 스텝(0~143). null = 손상 시각 */
export function cycleStep(nowIso: string): number | null {
  const d = new Date(nowIso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getUTCMinutes() * 60 + d.getUTCSeconds()) / CLOCK_STEP_SEC);
}

/** 주기 내 위치(분 환산, 0~60 미만). null = 손상 시각 */
export function cycleMinute(nowIso: string): number | null {
  const step = cycleStep(nowIso);
  return step === null ? null : (step * CLOCK_STEP_SEC) / 60;
}

export function isNight(nowIso: string): boolean {
  const step = cycleStep(nowIso);
  if (step === null) return false; // 손상 시각은 낮으로 — 캐치를 막지 않는다
  return step >= NIGHT_START_STEP || step < DAY_START_STEP; // 밤 = 22:00~06:00 (자정 감쌈)
}

export function dayPhase(nowIso: string): DayPhase {
  return isNight(nowIso) ? 'night' : 'day';
}

/** 게임 시각(0~24시 미만, 소수) — 스텝당 10게임분(하루 144스텝 = 게임 24시간).
 *  분 15 = 게임 6시(낮 시작) · 분 55 = 게임 22시(밤 시작) · 분 5 = 게임 2시(정점). */
export function gameHour(nowIso: string): number | null {
  const step = cycleStep(nowIso);
  return step === null ? null : (step * 10) / 60;
}

/** 게임 시각을 10분 단위 HH:MM으로 (00:00, 00:10, ..., 23:50). 10게임분 = 실제 25초. */
export function formatGameClock(nowIso: string): string {
  const step = cycleStep(nowIso);
  if (step === null) return '--:--';
  const totalMin = step * 10;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ---------- 게임 날짜 — 벽시계 날짜 주기(KST 04:00 경계) ----------
// 낮/밤(1시간 주기)과 별개로, 실제 하루에 한 번 바뀌는 것은 모두 같은 경계를 쓴다 — 대양 어군 배치,
// 바운티 헌팅의 의뢰 만료·하루 클리어 횟수·일일 의뢰. 00:00~04:00 정산 구간 뒤에 리셋한다는
// 운영 관례를 따라 경계는 KST 04:00이고, 그 전은 전날로 센다. 시각은 서버가 정하므로 모든
// 사용자가 같은 날짜를 본다.

/** 게임 날짜가 바뀌는 KST 시각 */
export const GAME_DAY_RESET_HOUR_KST = 4;
/** 안내 문장에 쓰는 일일 기준 시각 */
export const GAME_DAY_RESET_TEXT = `새벽 ${GAME_DAY_RESET_HOUR_KST}시`;
const KST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;
/** UTC 시각에 더하면 UTC 날짜가 곧 게임 날짜가 되는 이동량 — KST로 옮긴 뒤 경계 시각만큼 되돌린다 */
const GAME_DAY_SHIFT_MS = KST_OFFSET_MS - GAME_DAY_RESET_HOUR_KST * 3600_000;

/** 게임 날짜(YYYY-MM-DD) — KST 04:00 경계. 04:00 이전은 전날이다 */
export function gameDayOf(nowIso: string): string {
  return new Date(Date.parse(nowIso) + GAME_DAY_SHIFT_MS).toISOString().slice(0, 10);
}

/** 그 시각이 속한 게임 날짜가 시작된 순간(UTC ISO) — 그날의 KST 04:00. 하루 단위 집계와 만료의 경계다 */
export function gameDayStartISO(nowIso: string): string {
  const shifted = Date.parse(nowIso) + GAME_DAY_SHIFT_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - GAME_DAY_SHIFT_MS).toISOString();
}

/** 직전 게임 날짜에 속하는 대표 시각(오늘 게임 날짜 시작 1분 전, UTC ISO). 오늘 일일 한도를 소모하지 않는 기록에 쓴다 */
export function previousGameDayISO(nowIso: string): string {
  return new Date(Date.parse(gameDayStartISO(nowIso)) - 60_000).toISOString();
}

/** 밤 구간 내 스텝(0~47)의 밤 깊이(0~1). 24스텝(02:00)이 정점 1이고, 범위 밖은 0~1로 안전 처리한다 */
export function nightDepthOfStep(k: number): number {
  if (!Number.isFinite(k) || k <= 0 || k >= NIGHT_TOTAL_STEPS) return 0;
  const raw = k <= NIGHT_HALF_STEPS
    ? k / NIGHT_HALF_STEPS
    : (NIGHT_TOTAL_STEPS - k) / NIGHT_HALF_STEPS;
  return Math.max(0, Math.min(1, raw));
}

/** 밤 깊이 0~1 — 낮·손상 시각은 0, 밤 22:00(0) → 00:00(0.5) → 02:00(1.0) → 04:00(0.5) → 05:50(1/24) 대칭 */
export function nightDepth(nowIso: string): number {
  const step = cycleStep(nowIso);
  if (step === null) return 0;
  if (step >= DAY_START_STEP && step < NIGHT_START_STEP) return 0;
  const k = step >= NIGHT_START_STEP ? step - NIGHT_START_STEP : step + NIGHT_OFFSET_STEPS;
  return nightDepthOfStep(k);
}

/** 어둠 강도 0~1 — 밤 깊이(nightDepth)와 연동되는 UI 연출용 지표 */
export function darkness(nowIso: string): number {
  return nightDepth(nowIso);
}
