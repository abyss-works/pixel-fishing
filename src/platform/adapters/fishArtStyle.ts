// 물고기 그래픽 선택 — 기기별 표시 설정(localStorage). 진행이 아니라 보는 방식이라
// 세이브·서버 권위 대상이 아니다. 저장값이 없거나 알 수 없으면 기본 스타일을 쓴다.
import { DEFAULT_FISH_ART_STYLE, isFishArtStyle } from '../../game/rendering/pixel/fishArt/index.js';
import type { FishArtStyle } from '../../game/rendering/pixel/fishArt/index.js';

export const FISH_ART_STYLE_KEY = 'pf-fish-art';

/** 저장소에서 다시 읽는다 — 시작 시 한 번, 테스트에서 저장값 해석을 검증할 때 쓴다 */
export function loadFishArtStyle(): FishArtStyle {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FISH_ART_STYLE_KEY) : null;
    return isFishArtStyle(raw) ? raw : DEFAULT_FISH_ART_STYLE;
  } catch {
    return DEFAULT_FISH_ART_STYLE; // 저장소 접근이 막힌 환경
  }
}

let style: FishArtStyle = loadFishArtStyle();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getFishArtStyle(): FishArtStyle {
  return style;
}

export function setFishArtStyle(next: FishArtStyle): void {
  if (style === next) return;
  style = next;
  try { localStorage.setItem(FISH_ART_STYLE_KEY, next); } catch { /* 저장 실패 — 이번 세션에만 적용 */ }
  notify();
}

export function subscribeFishArtStyle(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 테스트 격리용 — 메모리 값을 기본으로 되돌린다(저장소는 건드리지 않는다) */
export function resetFishArtStyle(): void {
  if (style === DEFAULT_FISH_ART_STYLE) return;
  style = DEFAULT_FISH_ART_STYLE;
  notify();
}
