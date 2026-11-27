// 이벤트 구역 출입 전환 — 경과 시간에서 단계와 화면 덮개 농도를 정한다.
// 순서: 어두워짐(fadeOut) → 암전(dark, 이때 구역을 바꾼다) → 밝아짐(fadeIn) → 끝(done).
// 암전은 최소 시간을 채운 뒤 구역 전환 응답 시각과 비교해 늦은 쪽부터 밝아진다.

const FADE_OUT_MS = 260;
const DARK_MS = 320;
const FADE_IN_MS = 320;

/** 구역을 바꾸기 시작하는 시각(완전 암전 시작) */
export const EVENT_ZONE_MOVE_AT_MS = FADE_OUT_MS;

export type EventZonePhase = 'fadeOut' | 'dark' | 'fadeIn' | 'done';

/** veil: 화면 덮개 불투명도(0 투명, 1 완전 암전). settledAt: 구역 전환 응답이 온 경과 시간(아직이면 null) */
export function eventZoneVeilFrame(
  elapsed: number,
  settledAt: number | null,
): { phase: EventZonePhase; veil: number } {
  if (elapsed < EVENT_ZONE_MOVE_AT_MS) {
    return { phase: 'fadeOut', veil: Math.max(0, elapsed) / FADE_OUT_MS };
  }
  if (settledAt === null) return { phase: 'dark', veil: 1 };
  const inAt = Math.max(EVENT_ZONE_MOVE_AT_MS + DARK_MS, settledAt);
  if (elapsed < inAt) return { phase: 'dark', veil: 1 };
  if (elapsed < inAt + FADE_IN_MS) {
    return { phase: 'fadeIn', veil: 1 - (elapsed - inAt) / FADE_IN_MS };
  }
  return { phase: 'done', veil: 0 };
}
