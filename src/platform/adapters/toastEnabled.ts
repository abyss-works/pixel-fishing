// 플로팅 토스트 표시 여부 — 기기별 표시 설정(localStorage). 진행이 아니라 보는 방식이라
// 세이브·서버 권위 대상이 아니다. 저장값이 없거나 알 수 없으면 보인다(기본값 켜짐).
export const TOAST_ENABLED_KEY = 'pf-toast-enabled';

/** 저장소에서 다시 읽는다 — 시작 시 한 번, 테스트에서 저장값 해석을 검증할 때 쓴다 */
export function loadToastEnabled(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(TOAST_ENABLED_KEY) !== '0';
  } catch {
    return true; // 저장소 접근이 막힌 환경
  }
}

let enabled: boolean = loadToastEnabled();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getToastEnabled(): boolean {
  return enabled;
}

export function setToastEnabled(next: boolean): void {
  if (enabled === next) return;
  enabled = next;
  try { localStorage.setItem(TOAST_ENABLED_KEY, next ? '1' : '0'); } catch { /* 저장 실패 — 이번 세션에만 적용 */ }
  notify();
}

export function subscribeToastEnabled(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 테스트 격리용 — 메모리 값을 기본(켜짐)으로 되돌린다(저장소는 건드리지 않는다) */
export function resetToastEnabled(): void {
  if (enabled) return;
  enabled = true;
  notify();
}
