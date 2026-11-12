import { describe, expect, it } from 'vitest';
import { RECIPES } from '../cooking';
import { itemSprite } from './itemSprites';
import { SPRITE_TARGETS, definedLayout } from './targets';

describe('요리 아이템 스프라이트 해석', () => {
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

  it('종류가 다른 대상의 id나 모르는 id는 undefined다', () => {
    expect(itemSprite('bait', 'cook-lunch-bite')).toBeUndefined();
    expect(itemSprite('lunch', 'cook-bait-rare')).toBeUndefined();
    expect(itemSprite('lunch', 'nope')).toBeUndefined();
  });
});
