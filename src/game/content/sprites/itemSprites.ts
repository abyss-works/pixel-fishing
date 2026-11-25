// 아이템 id → 스프라이트와 색 배열. 도시락·미끼는 생성 격자를, 생명의 기운과 물약은 16×16 등록 격자를 읽는다 (DOM 비의존).
// 원화 격자는 팔레트가 고정 hex라 기준색은 색 해석에 쓰이지 않는다.
import type { CookKind } from '../cooking.js';
import { BAIT_SPRITES_GENERATED } from './baitSprites.generated.js';
import { DISH_SPRITES_GENERATED } from './dishSprites.generated.js';
import { paletteColors } from './types.js';
import type { PixelSprite } from './types.js';

export type ItemSpriteKind = CookKind | 'energy' | 'potion';

export interface ItemSpriteArt { sprite: PixelSprite; colors: readonly string[] }

export const ENERGY_SPRITES: Readonly<Record<string, PixelSprite>> = {
  'energy-common': {
    w: 16, h: 16,
    palette: ['#526478', '#7d91a8', '#b8c2cc', '#eaf2fa'],
    frames: [[
      '................',
      '................',
      '................',
      '................',
      '.......21.......',
      '......2321......',
      '......2331......',
      '.....233210.....',
      '.....222110.....',
      '.....122100.....',
      '.....111000.....',
      '......0000......',
      '................',
      '................',
      '................',
      '................',
    ]],
  },
  'energy-rare': {
    w: 16, h: 16,
    palette: ['#155382', '#2686bd', '#4fc3f7', '#a8e8ff', '#f4fbff'],
    frames: [[
      '................',
      '................',
      '................',
      '......32........',
      '.....3421.......',
      '....344210......',
      '....23321032....',
      '....23421341....',
      '....12321230....',
      '....11210120....',
      '.....1100010....',
      '......00000.....',
      '.......000......',
      '................',
      '................',
      '................',
    ]],
  },
  'energy-epic': {
    w: 16, h: 16,
    palette: ['#4c1e66', '#8032a3', '#ba68c8', '#eb9eff', '#fff2ff'],
    frames: [[
      '................',
      '................',
      '........32......',
      '.......321......',
      '....2.2321......',
      '...22.2342.2....',
      '....223442222...',
      '....123443210...',
      '....12332210....',
      '.....1222110....',
      '.....111100.....',
      '......0100......',
      '.......00.......',
      '................',
      '................',
      '................',
    ]],
  },
  'energy-legendary': {
    w: 16, h: 16,
    palette: ['#8c4e12', '#cf7e19', '#ffd54f', '#ffea85', '#fff7c2', '#ffffff'],
    frames: [[
      '................',
      '................',
      '.......32.......',
      '.......43.......',
      '....2.3542.1....',
      '....23455321....',
      '.....345532.....',
      '..344555543100..',
      '..233455532100..',
      '.....234421.....',
      '....12233210....',
      '....1.1221.0....',
      '.......21.......',
      '.......10.......',
      '................',
      '................',
    ]],
  },
};

export const POTION_SPRITES: Readonly<Record<string, PixelSprite>> = {
  'luck-small': {
    w: 16, h: 16,
    palette: ['#8c5a32', '#c48a52', '#7ca8ba', '#cbe8f5', '#1c6b48', '#2fa86e', '#7ae89a', '#f6ffd6'],
    frames: [[
      '................',
      '................',
      '......1110......',
      '......1100......',
      '.....332222.....',
      '......3222......',
      '.....336654.....',
      '....36655544....',
      '...3765555444...',
      '...3555555444...',
      '...2555554444...',
      '....24444444....',
      '.....224442.....',
      '................',
      '................',
      '................',
    ]],
  },
};

const ART: Readonly<Record<ItemSpriteKind, ReadonlyMap<string, ItemSpriteArt>>> = {
  lunch: toArt(DISH_SPRITES_GENERATED),
  bait: toArt(BAIT_SPRITES_GENERATED),
  energy: toArt(ENERGY_SPRITES),
  potion: toArt(POTION_SPRITES),
};

function toArt(sprites: Readonly<Record<string, PixelSprite>>): Map<string, ItemSpriteArt> {
  return new Map(Object.entries(sprites).map(([id, sprite]) => [id, { sprite, colors: paletteColors(sprite.palette, '#000000') }]));
}

/** 그 종류의 아이템 id가 가진 스프라이트. 다른 종류의 id나 모르는 id는 undefined */
export function itemSprite(kind: ItemSpriteKind, id: string): ItemSpriteArt | undefined {
  return ART[kind].get(id);
}
