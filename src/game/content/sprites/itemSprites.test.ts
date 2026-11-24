import { describe, expect, it } from 'vitest';
import { ENERGY_ITEM_IDS, RECIPES } from '../cooking';
import { RARITY_ORDER } from '../rarity';
import { ENERGY_SPRITES, itemSprite } from './itemSprites';
import { SPRITE_TARGETS, definedLayout } from './targets';
import { TRANSPARENT, validateSprite } from './types';

function checkGridRules(rows: readonly string[], margin: number): string[] {
  const h = rows.length, w = rows[0]?.length ?? 0;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== TRANSPARENT;
  const violations: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!op(x, y)) continue;
      if (x < margin || y < margin || x > w - 1 - margin || y > h - 1 - margin) violations.push(`margin(${x},${y})`);
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && op(x + dx, y + dy)) neighbors++;
      if (neighbors === 0) violations.push(`floating(${x},${y})`);
      for (const dy of [1, -1]) {
        if (op(x + 1, y + dy) && !op(x + 1, y) && !op(x, y + dy)) violations.push(`diagonal(${x},${y})`);
      }
    }
  }
  return violations;
}

describe('요리·기운 아이템 스프라이트 해석', () => {
  it('모든 레시피가 자기 종류 대상의 격자와 색 배열을 갖는다', () => {
    for (const recipe of RECIPES) {
      const found = itemSprite(recipe.kind, recipe.id);
      expect(found, recipe.id).toBeDefined();
      const { grid } = definedLayout(SPRITE_TARGETS[recipe.kind === 'lunch' ? 'dish' : 'bait']);
      expect([found!.sprite.w, found!.sprite.h]).toEqual([grid.w, grid.h]);
      expect(found!.colors).toHaveLength(found!.sprite.palette.length);
      for (const c of found!.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('생명의 기운 4종이 모두 등록돼 있고 무결성·공통 규칙을 통과한다', () => {
    const { grid, margin } = definedLayout(SPRITE_TARGETS.dish);
    const expectedIds = RARITY_ORDER.map(r => ENERGY_ITEM_IDS[r]);
    expect(Object.keys(ENERGY_SPRITES).sort()).toEqual([...expectedIds].sort());
    for (const id of expectedIds) {
      const sprite = ENERGY_SPRITES[id];
      expect(sprite, id).toBeDefined();
      expect([sprite.w, sprite.h], id).toEqual([grid.w, grid.h]);
      expect(validateSprite(sprite), id).toEqual([]);
      for (const rows of sprite.frames) expect(checkGridRules(rows, margin), id).toEqual([]);
      const found = itemSprite('energy', id);
      expect(found, id).toBeDefined();
      expect(found!.sprite).toBe(sprite);
      expect(found!.colors).toHaveLength(sprite.palette.length);
      for (const c of found!.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('종류가 다른 대상의 id나 모르는 id는 undefined다', () => {
    expect(itemSprite('bait', 'cook-lunch-bite')).toBeUndefined();
    expect(itemSprite('lunch', 'cook-bait-rare')).toBeUndefined();
    expect(itemSprite('energy', 'cook-lunch-bite')).toBeUndefined();
    expect(itemSprite('lunch', ENERGY_ITEM_IDS.common)).toBeUndefined();
    expect(itemSprite('lunch', 'nope')).toBeUndefined();
  });
});
