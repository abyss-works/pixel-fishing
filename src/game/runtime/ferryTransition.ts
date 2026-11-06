// 여객선 빠른 이동 전환 — 경과 시간에서 단계와 화면 덮개 농도를 정한다.
// 순서: 앞바다 모습(surface) → 어두워짐(fadeOut) → 암전(dark, 이때 위치를 바꾼다) → 밝아짐(fadeIn) → 끝(done).
// 암전은 위치 변경 응답이 올 때까지 이어지고, 응답 시각과 최소 암전 시간 중 늦은 쪽부터 밝아진다.

const SURFACE_MS = 600;
const FADE_OUT_MS = 300;
const DARK_MS = 200;
const FADE_IN_MS = 300;

/** 위치를 바꾸기 시작하는 시각(완전 암전 시작) */
export const FERRY_MOVE_AT_MS = SURFACE_MS + FADE_OUT_MS;

export type FerryPhase = 'surface' | 'fadeOut' | 'dark' | 'fadeIn' | 'done';

/** veil: 화면 덮개 불투명도(0 투명, 1 완전 암전). settledAt: 위치 변경 응답이 온 경과 시간(아직이면 null) */
export function ferryFrame(elapsed: number, settledAt: number | null): { phase: FerryPhase; veil: number } {
  if (elapsed < SURFACE_MS) return { phase: 'surface', veil: 0 };
  if (elapsed < FERRY_MOVE_AT_MS) return { phase: 'fadeOut', veil: (elapsed - SURFACE_MS) / FADE_OUT_MS };
  if (settledAt === null) return { phase: 'dark', veil: 1 };
  const inAt = Math.max(FERRY_MOVE_AT_MS + DARK_MS, settledAt);
  if (elapsed < inAt) return { phase: 'dark', veil: 1 };
  if (elapsed < inAt + FADE_IN_MS) return { phase: 'fadeIn', veil: 1 - (elapsed - inAt) / FADE_IN_MS };
  return { phase: 'done', veil: 0 };
}
