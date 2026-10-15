import { useSyncExternalStore } from 'react';
import {
  getFishArtStyle,
  resetFishArtStyle,
  setFishArtStyle,
  subscribeFishArtStyle,
} from '../../../platform/api/fishArtStyle';
import type { FishArtStyle } from '../../../game/rendering/pixel/fishArt';

export { resetFishArtStyle, setFishArtStyle };

/** 사용자가 고른 물고기 그래픽 스타일 — 설정에서 바꾸면 모든 물고기 그림이 즉시 따라 바뀐다 */
export function useFishArtStyle(): FishArtStyle {
  return useSyncExternalStore(subscribeFishArtStyle, getFishArtStyle, getFishArtStyle);
}
