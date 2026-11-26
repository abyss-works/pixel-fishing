// 포구 출항 차단 뒤 구글 인증으로 이어질 때, 복귀 완료 후 대양 출항 좌표로 바로 이동하기 위한 세션 표지 관리.
// OAuth 전체 페이지 이동 사이에는 sessionStorage로 의도를 유지하고, 복귀 성공 판정 뒤 이번 부팅에서만 1회 소비한다.

export type GoogleReturnOrigin = 'connect' | 'manage';

export const SAIL_RETURN_KEY = 'pf-sail-return';
export const SAIL_RETURN_TARGET = 'world';
export const GOOGLE_ORIGIN_KEY = 'pf-google-origin';

let readyInMemory = false;

export function setPendingGoogleOrigin(origin: GoogleReturnOrigin): void {
  try {
    sessionStorage.setItem(GOOGLE_ORIGIN_KEY, origin);
  } catch {
    // 저장소 접근 불가 환경에서는 기본 복귀 경로를 쓴다
  }
}

export function clearPendingGoogleOrigin(): void {
  try {
    sessionStorage.removeItem(GOOGLE_ORIGIN_KEY);
  } catch {
    // 무시
  }
}

export function consumeGoogleOrigin(): GoogleReturnOrigin | null {
  try {
    const raw = sessionStorage.getItem(GOOGLE_ORIGIN_KEY);
    sessionStorage.removeItem(GOOGLE_ORIGIN_KEY);
    return raw === 'manage' || raw === 'connect' ? raw : null;
  } catch {
    return null;
  }
}

export function setPendingSailReturn(): void {
  try {
    sessionStorage.setItem(SAIL_RETURN_KEY, SAIL_RETURN_TARGET);
  } catch {
    // 저장소 접근 불가 환경에서는 출항 복귀를 생략한다
  }
}

export function hasPendingSailReturn(): boolean {
  try {
    return sessionStorage.getItem(SAIL_RETURN_KEY) === SAIL_RETURN_TARGET;
  } catch {
    return false;
  }
}

export function clearPendingSailReturn(): void {
  readyInMemory = false;
  try {
    sessionStorage.removeItem(SAIL_RETURN_KEY);
  } catch {
    // 무시
  }
}

/** OAuth 복귀가 성공으로 판정됐을 때 호출한다 — 저장된 출항 대기가 있으면 이번 부팅에서 소비 가능으로 표시한다 */
export function activateSailReturnIfPending(): boolean {
  if (!hasPendingSailReturn()) return false;
  readyInMemory = true;
  return true;
}

export function isSailReturnReady(): boolean {
  return readyInMemory && hasPendingSailReturn();
}

/** 대기 중인 출항 복귀가 있으면 표지를 지우고 true를 돌려준다 */
export function consumeSailReturn(): boolean {
  if (!isSailReturnReady()) return false;
  clearPendingSailReturn();
  return true;
}

export function resetSailReturnForTest(): void {
  clearPendingSailReturn();
  clearPendingGoogleOrigin();
}
