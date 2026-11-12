// 요리 id → 스프라이트와 색 배열. 도시락은 요리 대상, 미끼는 미끼 대상의 생성 격자를 읽는다 (DOM 비의존).
// 원화 격자는 팔레트가 고정 hex라 기준색은 색 해석에 쓰이지 않는다.
import type { CookKind } from '../cooking.js';
import { BAIT_SPRITES_GENERATED } from './baitSprites.generated.js';
import { DISH_SPRITES_GENERATED } from './dishSprites.generated.js';
import { paletteColors } from './types.js';
import type { PixelSprite } from './types.js';

export interface ItemSpriteArt { sprite: PixelSprite; colors: readonly string[] }

const ART: Readonly<Record<CookKind, ReadonlyMap<string, ItemSpriteArt>>> = {
  lunch: toArt(DISH_SPRITES_GENERATED),
  bait: toArt(BAIT_SPRITES_GENERATED),
};

function toArt(sprites: Readonly<Record<string, PixelSprite>>): Map<string, ItemSpriteArt> {
  return new Map(Object.entries(sprites).map(([id, sprite]) => [id, { sprite, colors: paletteColors(sprite.palette, '#000000') }]));
}

/** 그 종류의 요리 id가 가진 스프라이트. 다른 종류의 id나 모르는 id는 undefined */
export function itemSprite(kind: CookKind, id: string): ItemSpriteArt | undefined {
  return ART[kind].get(id);
}
