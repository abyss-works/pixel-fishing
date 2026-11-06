// 미니맵 표시 여부 — 기기별 표시 설정(localStorage). 진행이 아니라 보는 방식이라
// 세이브·서버 권위 대상이 아니다. 저장값이 없거나 알 수 없으면 보인다.
export const MINIMAP_VISIBLE_KEY = 'pf-minimap';

/** 저장소에서 다시 읽는다 — 시작 시 한 번, 테스트에서 저장값 해석을 검증할 때 쓴다 */
export function loadMinimapVisible(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(MINIMAP_VISIBLE_KEY) !== '0';
  } catch {
    return true; // 저장소 접근이 막힌 환경
  }
}

let visible: boolean = loadMinimapVisible();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getMinimapVisible(): boolean {
  return visible;
}

export function setMinimapVisible(next: boolean): void {
  if (visible === next) return;
  visible = next;
  try { localStorage.setItem(MINIMAP_VISIBLE_KEY, next ? '1' : '0'); } catch { /* 저장 실패 — 이번 세션에만 적용 */ }
  notify();
}

export function subscribeMinimapVisible(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 테스트 격리용 — 메모리 값을 기본(보임)으로 되돌린다(저장소는 건드리지 않는다) */
export function resetMinimapVisible(): void {
  if (visible) return;
  visible = true;
  notify();
}
