import { describe, expect, it } from 'vitest';
import { ARTIFACTS } from './artifacts';
import { ENERGY_ITEM_IDS, ENERGY_UNIT, RECIPES } from './cooking';
import { POTIONS } from './potions';
import { RARITY_ORDER } from './rarity';
import {
  STACKABLE_ITEMS,
  findStackableItem,
  isAttachableItemId,
  isStackableItemId,
  itemDisplayQty,
  itemStorageAmount,
  stackableItemsByKind,
} from './itemCatalog';

describe('공용 스택 아이템 카탈로그', () => {
  it('물약·생명의 기운 4종·레시피 10종·유물 재료 8종을 빠짐없이 통합한다', () => {
    const ids = STACKABLE_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    expect(stackableItemsByKind('potion').map(i => i.id)).toEqual(POTIONS.map(p => p.id));
    expect(stackableItemsByKind('energy').map(i => i.id)).toEqual(RARITY_ORDER.map(r => ENERGY_ITEM_IDS[r]));
    expect(stackableItemsByKind('dish').map(i => i.id)).toEqual(RECIPES.filter(r => r.kind === 'lunch').map(r => r.id));
    expect(stackableItemsByKind('bait').map(i => i.id)).toEqual(RECIPES.filter(r => r.kind === 'bait').map(r => r.id));
    expect(stackableItemsByKind('material').map(i => i.id)).toEqual(ARTIFACTS.map(a => a.materialId));

    expect(STACKABLE_ITEMS).toHaveLength(POTIONS.length + RARITY_ORDER.length + RECIPES.length + ARTIFACTS.length);
    for (const r of RECIPES) {
      expect(findStackableItem(r.id)?.grade, r.id).toBe(r.grade);
    }
  });

  it('생명의 기운 4등급은 rarity와 저장 단위(1개 = 10단위) 변환을 제공한다', () => {
    for (const r of RARITY_ORDER) {
      const id = ENERGY_ITEM_IDS[r];
      const item = findStackableItem(id);
      expect(item).toMatchObject({ id, kind: 'energy', rarity: r, grade: r, unitSize: ENERGY_UNIT, attachable: true });
      expect(itemStorageAmount(id, 1)).toBe(10);
      expect(itemStorageAmount(id, 3)).toBe(30);
      expect(itemStorageAmount(id, 0.5)).toBe(5);
      expect(itemStorageAmount(id, 0.15)).toBe(0);
      expect(itemDisplayQty(id, 10)).toBe(1);
      expect(itemDisplayQty(id, 25)).toBe(2.5);
    }
  });

  it('물약·요리·재료는 표시 개수와 저장 단위가 1:1이며 비정수·무효 수량은 0으로 막는다', () => {
    for (const id of ['luck-small', 'cook-lunch-bite', 'cook-bait-rare', 'mat-abyss-lantern']) {
      expect(isStackableItemId(id)).toBe(true);
      expect(isAttachableItemId(id)).toBe(true);
      expect(findStackableItem(id)?.unitSize).toBe(1);
      expect(itemStorageAmount(id, 2)).toBe(2);
      expect(itemStorageAmount(id, 1.5)).toBe(0);
      expect(itemStorageAmount(id, 0)).toBe(0);
      expect(itemStorageAmount(id, -1)).toBe(0);
      expect(itemDisplayQty(id, 4)).toBe(4);
      expect(itemDisplayQty(id, 0)).toBe(0);
    }
  });

  it('모르는 아이템 id는 조회·첨부 가능 여부·수량 변환 모두 거부한다', () => {
    expect(findStackableItem('nope')).toBeUndefined();
    expect(findStackableItem(null)).toBeUndefined();
    expect(isStackableItemId('nope')).toBe(false);
    expect(isAttachableItemId('nope')).toBe(false);
    expect(itemStorageAmount('nope', 1)).toBe(0);
    expect(itemDisplayQty('nope', 10)).toBe(0);
  });
});
