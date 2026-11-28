// OS 동작 축소 설정 판정 — 스크립트가 읽는 유일한 자리. CSS 애니메이션은 스타일시트의 미디어 질의가 따로 끈다.
const QUERY = '(prefers-reduced-motion: reduce)';

function mediaList(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

export function getReducedMotion(): boolean {
  return mediaList()?.matches ?? false;
}

export function subscribeReducedMotion(listener: () => void): () => void {
  const list = mediaList();
  if (!list) return () => {};
  list.addEventListener('change', listener);
  return () => { list.removeEventListener('change', listener); };
}
