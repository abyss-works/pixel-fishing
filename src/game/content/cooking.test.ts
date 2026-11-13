// 요리 콘텐츠 — 레시피 표, 기운 아이템, 등급 미끼 재료, 해금 배 단계의 무결성.
import { describe, it, expect } from 'vitest';
import {
  COOKING_UNLOCK_BOAT, COOK_EFFECT_KEYS, COOK_KIND_RULES, COOK_STORAGE_CAP, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL,
  ENERGY_UNIT, LEGACY_BAIT_REFUND, RECIPES, formatEnergy, isEnergyAmount, recipeById, recipeCostStored, toStoredEnergy,
} from './cooking';
import { ARTIFACTS } from './artifacts';
import { RARITY_ORDER } from './rarity';
import type { RarityId } from './rarity';
import { MAX_BOAT } from './boats';
import { zoneById } from './zones';

const byKind = (kind: 'lunch' | 'bait') => RECIPES.filter(r => r.kind === kind);
const gradeBaits = RECIPES.filter(r => r.kind === 'bait' && r.effects.rarityWeight !== undefined);

describe('레시피 표', () => {
  it('도시락 5종과 미끼 요리 4종이다', () => {
    expect(byKind('lunch')).toHaveLength(5);
    expect(byKind('bait')).toHaveLength(4);
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

  it('기운 요구는 소수 첫째 자리까지 허용하는 양수이고 등급 키가 유효하다', () => {
    for (const r of RECIPES) {
      const entries = Object.entries(r.cost);
      expect(entries.length, r.id).toBeGreaterThan(0);
      for (const [grade, n] of entries) {
        expect(RARITY_ORDER as string[], r.id).toContain(grade);
        expect(isEnergyAmount(n) && n > 0, `${r.id}.${grade}`).toBe(true);
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
    expect(fx('cook-bait-mutation')).toEqual({ mutationWeight: 1 });
    expect(fx('cook-bait-rare')).toEqual({ rarityWeight: { grades: ['rare', 'epic', 'legendary'], bonus: 0.2 } });
    expect(fx('cook-bait-epic')).toEqual({ rarityWeight: { grades: ['epic', 'legendary'], bonus: 0.4 } });
    expect(fx('cook-bait-legendary')).toEqual({ rarityWeight: { grades: ['legendary'], bonus: 0.6 } });
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

describe('기운 단위', () => {
  it('화면 단위 1은 저장 단위 10이고, 개체 하나의 산출은 화면 단위 1이다', () => {
    expect(ENERGY_UNIT).toBe(10);
    expect(ENERGY_PER_INDIVIDUAL).toBe(10);
  });

  it('화면 단위를 저장 단위 정수로 바꾼다 (부동소수 오차 없이)', () => {
    expect(toStoredEnergy(600)).toBe(6000);
    expect(toStoredEnergy(0.5)).toBe(5);
    expect(toStoredEnergy(0.3)).toBe(3);
    expect(toStoredEnergy(1.1)).toBe(11);
    expect(toStoredEnergy(0)).toBe(0);
  });

  it('isEnergyAmount는 소수 첫째 자리까지의 유한한 0 이상만 받는다', () => {
    for (const ok of [0, 1, 0.1, 0.3, 1.1, 2.7, 600, 1234.5]) expect(isEnergyAmount(ok), String(ok)).toBe(true);
    for (const bad of [0.25, 0.05, 1.01, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null, undefined]) {
      expect(isEnergyAmount(bad), String(bad)).toBe(false);
    }
  });

  it('레시피 비용을 저장 단위로 바꿔 돌려준다. 없는 등급은 0이다', () => {
    const bundle = recipeById('cook-lunch-bundle')!;
    expect(recipeCostStored(bundle, 'common')).toBe(500);
    expect(recipeCostStored(bundle, 'legendary')).toBe(10);
    expect(recipeCostStored(recipeById('cook-lunch-bite')!, 'rare')).toBe(0);
  });

  it('formatEnergy: 소수 첫째 자리가 0이면 정수, 아니면 소수 첫째 자리까지, 천 단위 쉼표', () => {
    expect(formatEnergy(0)).toBe('0');
    expect(formatEnergy(5)).toBe('0.5');
    expect(formatEnergy(10)).toBe('1');
    expect(formatEnergy(15)).toBe('1.5');
    expect(formatEnergy(12340)).toBe('1,234');
    expect(formatEnergy(12345)).toBe('1,234.5');
    expect(formatEnergy(10_000_000)).toBe('1,000,000');
  });

  it('formatEnergy: 음수는 부호를 붙이고, 정수가 아닌 입력은 가장 가까운 저장 단위로 반올림하며, 유한하지 않은 수는 0이다', () => {
    expect(formatEnergy(-15)).toBe('-1.5');
    expect(formatEnergy(-5)).toBe('-0.5');
    expect(formatEnergy(-12345)).toBe('-1,234.5');
    expect(formatEnergy(15.5)).toBe('1.6');
    expect(formatEnergy(15.4)).toBe('1.5');
    expect(formatEnergy(9.6)).toBe('1');
    expect(formatEnergy(Number.NaN)).toBe('0');
    expect(formatEnergy(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formatEnergy(Number.NEGATIVE_INFINITY)).toBe('0');
  });
});

describe('요리 설명', () => {
  const DESCRIPTIONS: Record<string, string> = {
    'cook-lunch-bite': '소금물에 끓인 다랑어 국물에서 짠 김이 피어오른다. 그릇을 다 비우기도 전에 찌가 먼저 가라앉는다.',
    'cook-lunch-rare': '코코넛 밀크와 강황으로 끓인 국물에 생선 살이 잠긴다. 귀한 생선을 넣을수록 맛이 깊어진다.',
    'cook-lunch-mutation': '솥을 봉한 반죽을 뜯어내면 향신료 냄새가 한꺼번에 퍼진다. 밝은 빛으로 따로 물들인 밥이 생선과 켜를 이룬다.',
    'cook-lunch-named': '고라카 열매의 신맛이 바짝 졸인 다랑어 살 속까지 밴다. 콜롬보항 뱃사람들은 큰 그림자를 쫓아 오래 나가는 날 이 요리를 싣는다.',
    'cook-lunch-bundle': '밥을 가운데 두고 생선 반찬을 작은 그릇에 나눠 둥근 쟁반에 차린 인도식 한 상이다. 그릇마다 양은 적어도 빠진 맛이 없다.',
    'cook-bait-rare': '롱페퍼 이삭을 말려 빻아 반죽에 섞은 미끼다. 후추보다 이 열매가 비싸게 팔리던 때가 있었다.',
    'cook-bait-epic': '큐베브 열매에는 짧은 꼬리 같은 꼭지가 하나씩 달려 있다. 아린 맛이 오래 남는 열매 가루가 물에 풀리면 덩치 큰 것들이 먼저 줄을 당긴다.',
    'cook-bait-legendary': '해변에 밀려온 용연향 덩어리를 옛 중국 사람들은 용이 흘린 침이 굳은 것으로 여겼다. 이 냄새를 따라 이야기로만 듣던 물고기가 올라오기도 한다.',
    'cook-bait-mutation': '붉은 사프란 암술을 물에 담그면 금빛이 번져 나온다. 이 미끼를 문 물고기는 가끔 비늘 빛부터 남다르다.',
  };

  it('모든 레시피에 설명이 있다', () => {
    for (const r of RECIPES) expect(r.description.trim().length, r.id).toBeGreaterThan(0);
  });

  it('레시피 설명은 정해 둔 문장과 같다', () => {
    expect(Object.fromEntries(RECIPES.map(r => [r.id, r.description]))).toEqual(DESCRIPTIONS);
  });
});
