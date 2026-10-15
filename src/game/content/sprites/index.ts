// 어종 → 스프라이트·팔레트 해석 (DOM 비의존).
// 해석 순서: 종별 전용 격자(아직 없음) → 형태 격자(fishShapes.generated). 폼은 기준색을 바꾸고,
// 미발견은 전 슬롯을 실루엣 색으로 치환한다 — 실루엣이 같은 데이터에서 파생된다는 계약(R3·R19).
import type { Fish, FormId } from '../fish.js';
import { FISH_SHAPE_SPRITES } from './fishShapes.generated.js';
import { paletteColors } from './types.js';
import type { PixelSprite } from './types.js';

/** 미발견 실루엣 색 — 몸 형태만 보여주고 색은 숨긴다 (도감 스포일러 규칙) */
export const SILHOUETTE = '#22314a';

export function fishSprite(fish: Pick<Fish, 'shape'>): PixelSprite {
  return FISH_SHAPE_SPRITES[fish.shape];
}

/** 폼·발견 여부에 따른 실제 색 배열 — 렌더러는 이 배열로 래스터 캐시 키를 만든다 */
export function fishColors(
  fish: Pick<Fish, 'shape' | 'color' | 'variant'>, form: FormId = 'normal', discovered = true,
): string[] {
  const sprite = fishSprite(fish);
  if (!discovered) return sprite.palette.map(() => SILHOUETTE);
  return paletteColors(sprite.palette, form === 'variant' ? fish.variant.color : fish.color);
}

export { FISH_SHAPE_SPRITES } from './fishShapes.generated.js';
export type { PixelSprite, PaletteSlot } from './types.js';
export { cellIndex, paletteColors, TRANSPARENT } from './types.js';
