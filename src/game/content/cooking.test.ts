// 요리 콘텐츠 — 레시피 표, 기운 아이템, 등급 미끼 재료, 해금 배 단계의 무결성.
import { describe, it, expect } from 'vitest';
import {
  COOKING_UNLOCK_BOAT, COOK_EFFECT_KEYS, COOK_KIND_RULES, COOK_STORAGE_CAP, ENERGY_ITEM_IDS,
  JUDGE_WIDTH_BONUS, LEGACY_BAIT_REFUND, RECIPES, recipeById,
} from './cooking';
import { ARTIFACTS } from './artifacts';
import { RARITY_ORDER } from './rarity';
import type { RarityId } from './rarity';
import { MAX_BOAT } from './boats';
import { zoneById } from './zones';

const byKind = (kind: 'lunch' | 'bait') => RECIPES.filter(r => r.kind === kind);
const gradeBaits = RECIPES.filter(r => r.kind === 'bait' && r.effects.rarityWeight !== undefined);

describe('레시피 표', () => {
  it('도시락 5종과 미끼 요리 5종이다', () => {
    expect(byKind('lunch')).toHaveLength(5);
    expect(byKind('bait')).toHaveLength(5);
  });

  it('레시피 id는 고유하고 recipeById가 찾아 준다', () => {
    const ids = RECIPES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RECIPES) expect(recipeById(r.id)).toBe(r);
    expect(recipeById('nope')).toBeUndefined();
    expect(recipeById(undefined)).toBeUndefined();
  });

  it('표시 이름은 비어 있지 않고 고유하다', () => {
    const names = RECIPES.map(r => r.name);
    expect(names.every(n => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('효과 키는 정해진 집합 안에 있고 효과가 하나 이상 있다', () => {
    for (const r of RECIPES) {
      const keys = Object.keys(r.effects);
      expect(keys.length, r.id).toBeGreaterThan(0);
      for (const k of keys) expect(COOK_EFFECT_KEYS as readonly string[], `${r.id}.${k}`).toContain(k);
    }
  });

  it('기운 요구는 양의 정수이고 등급 키가 유효하다', () => {
    for (const r of RECIPES) {
      const entries = Object.entries(r.cost);
      expect(entries.length, r.id).toBeGreaterThan(0);
      for (const [grade, n] of entries) {
        expect(RARITY_ORDER as string[], r.id).toContain(grade);
        expect(Number.isInteger(n) && n > 0, `${r.id}.${grade}`).toBe(true);
      }
    }
  });

  it('명세 4.2 표의 기운 요구와 같다', () => {
    const cost = (id: string) => recipeById(id)!.cost;
    expect(cost('cook-lunch-bite')).toEqual({ common: 600 });
    expect(cost('cook-lunch-rare')).toEqual({ common: 100, rare: 20 });
    expect(cost('cook-lunch-mutation')).toEqual({ rare: 20, epic: 4 });
    expect(cost('cook-lunch-named')).toEqual({ epic: 8 });
    expect(cost('cook-lunch-bundle')).toEqual({ common: 50, rare: 5, epic: 1, legendary: 1 });
    expect(cost('cook-bait-judge')).toEqual({ common: 50, rare: 5 });
    expect(cost('cook-bait-mutation')).toEqual({ epic: 4, legendary: 1 });
    expect(cost('cook-bait-rare')).toEqual({ common: 50, rare: 15 });
    expect(cost('cook-bait-epic')).toEqual({ common: 50, epic: 5 });
    expect(cost('cook-bait-legendary')).toEqual({ common: 50, legendary: 3 });
  });

  it('명세 5.2, 5.3 표의 효과 값과 같다', () => {
    const fx = (id: string) => recipeById(id)!.effects;
    expect(fx('cook-lunch-bite')).toEqual({ biteWaitCut: 0.1 });
    expect(fx('cook-lunch-rare')).toEqual({ rarityWeight: { grades: ['rare', 'epic', 'legendary'], bonus: 0.1 } });
    expect(fx('cook-lunch-mutation')).toEqual({ mutationWeight: 0.5 });
    expect(fx('cook-lunch-named')).toEqual({ namedWeight: 0.5 });
    expect(fx('cook-lunch-bundle')).toEqual({
      biteWaitCut: 0.05, rarityWeight: { grades: ['rare', 'epic', 'legendary'], bonus: 0.05 },
    });
    expect(fx('cook-bait-judge')).toEqual({ judgeWidth: JUDGE_WIDTH_BONUS });
    expect(fx('cook-bait-mutation')).toEqual({ mutationWeight: 1 });
    expect(fx('cook-bait-rare')).toEqual({ rarityWeight: { grades: ['rare', 'epic', 'legendary'], bonus: 0.2 } });
    expect(fx('cook-bait-epic')).toEqual({ rarityWeight: { grades: ['epic', 'legendary'], bonus: 0.4 } });
    expect(fx('cook-bait-legendary')).toEqual({ rarityWeight: { grades: ['legendary'], bonus: 0.6 } });
  });

  it('판정 칸 값은 설정값이고 기본은 0이다', () => {
    expect(JUDGE_WIDTH_BONUS).toBe(0);
  });
});

describe('등급 미끼', () => {
  it('세 종류뿐이고 등급이 서로 다르다', () => {
    expect(gradeBaits).toHaveLength(3);
    const lows = gradeBaits.map(r => r.effects.rarityWeight!.grades[0]);
    expect(new Set(lows).size).toBe(3);
  });

  it('재료는 일반 기운과 미끼 등급과 같은 등급의 기운 두 가지다', () => {
    for (const r of gradeBaits) {
      const grade = r.effects.rarityWeight!.grades[0];
      expect(Object.keys(r.cost).sort(), r.id).toEqual(['common', grade].sort());
    }
  });

  it('대상 등급은 미끼 등급부터 전설까지 이어진다', () => {
    for (const r of gradeBaits) {
      const { grades } = r.effects.rarityWeight!;
      expect(grades, r.id).toEqual(RARITY_ORDER.slice(RARITY_ORDER.indexOf(grades[0])));
    }
  });

  it('새 미끼 id는 이전 미끼 id와 겹치지 않는다', () => {
    const legacy = Object.keys(LEGACY_BAIT_REFUND);
    for (const r of RECIPES) expect(legacy, r.id).not.toContain(r.id);
  });
});

describe('기운 아이템', () => {
  it('등급마다 하나이고 id가 고유하다', () => {
    expect(Object.keys(ENERGY_ITEM_IDS).sort()).toEqual([...RARITY_ORDER].sort());
    const ids = Object.values(ENERGY_ITEM_IDS);
    expect(new Set(ids).size).toBe(4);
  });

  it('레시피 id, 이전 미끼 id, 유물 재료 id와 겹치지 않는다', () => {
    const taken = new Set<string>([
      ...RECIPES.map(r => r.id), ...Object.keys(LEGACY_BAIT_REFUND), ...ARTIFACTS.map(a => a.materialId),
    ]);
    for (const grade of RARITY_ORDER as RarityId[]) expect(taken.has(ENERGY_ITEM_IDS[grade])).toBe(false);
  });
});

describe('이전 미끼 환불 정가표', () => {
  it('이전 미끼 4종의 정가다', () => {
    expect(LEGACY_BAIT_REFUND).toEqual({
      'bait-common': 25, 'bait-rare': 200, 'bait-epic': 1000, 'bait-legendary': 2500,
    });
  });
});

describe('해금, 조리 대기, 보관함, 슬롯', () => {
  it('해금 배 단계는 인도양 진입 배 단계와 같고 배 단계 범위 안이다', () => {
    expect(COOKING_UNLOCK_BOAT).toBe(zoneById('indian')!.entryBoat);
    expect(COOKING_UNLOCK_BOAT).toBeGreaterThan(0);
    expect(COOKING_UNLOCK_BOAT).toBeLessThanOrEqual(MAX_BOAT);
  });

  it('명세 4.3, 5.1 표의 값과 같다', () => {
    const MIN = 60_000;
    expect(COOK_KIND_RULES.lunch).toEqual({ waitMs: 60 * MIN, slotMs: 9 * 60 * MIN });
    expect(COOK_KIND_RULES.bait).toEqual({ waitMs: 15 * MIN, slotMs: 30 * MIN });
    expect(COOK_STORAGE_CAP).toBe(10);
  });
});
