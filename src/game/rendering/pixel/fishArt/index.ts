// 물고기 그래픽 어댑터 레지스트리 — 스타일 → 어댑터. 기본은 v1(v2는 실험 단계).
import { fishArtV1 } from './v1.js';
import { fishArtV2 } from './v2.js';
import type { FishArt, FishArtStyle } from './port.js';

export type { FishArt, FishArtDraw, FishArtStyle, FishArtSubject } from './port.js';

const ADAPTERS: Record<FishArtStyle, FishArt> = { v1: fishArtV1, v2: fishArtV2 };

export const FISH_ART_STYLES: readonly FishArtStyle[] = ['v1', 'v2'];
export const DEFAULT_FISH_ART_STYLE: FishArtStyle = 'v1';

export function isFishArtStyle(value: unknown): value is FishArtStyle {
  return typeof value === 'string' && (FISH_ART_STYLES as readonly string[]).includes(value);
}

export function fishArt(style: FishArtStyle): FishArt {
  return ADAPTERS[style];
}
