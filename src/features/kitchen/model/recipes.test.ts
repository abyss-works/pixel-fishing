// 요리 탭 모델 — 레시피 표시, 필요와 보유, 조리 가능 판정, 조리 상태 줄.
// 조리 가능 여부와 보관함 수는 게임 규칙(canCook, cookStorageUsed)이 정하고, 이 모듈은 그 판정을 화면용 값으로 옮긴다.
import { describe, expect, it } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { COOK_STORAGE_CAP, ENERGY_ITEM_IDS, RECIPES, recipeById } from '../../../game/content/cooking';
import {
  recipeEffectLines, recipeGrade, recipeLabel, recipesOfKind, selectKitchenStatus, selectRecipeView,
} from './recipes';

const T0 = '2026-11-12T00:00:00.000Z';
const MIN = 60_000;
const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const home = { kind: 'base', id: 'home' } as const;
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: 5, location: home, ...over });
const energy = (c = 0, r = 0, e = 0, l = 0): Record<string, number> => ({
  [ENERGY_ITEM_IDS.common]: c, [ENERGY_ITEM_IDS.rare]: r, [ENERGY_ITEM_IDS.epic]: e, [ENERGY_ITEM_IDS.legendary]: l,
});
const recipe = (id: string) => recipeById(id)!;

describe('종류별 레시피', () => {
  it('도시락 탭과 미끼 탭은 그 종류의 레시피를 콘텐츠 순서대로 낸다', () => {
    expect(recipesOfKind('lunch').map(r => r.id)).toEqual(RECIPES.filter(r => r.kind === 'lunch').map(r => r.id));
    expect(recipesOfKind('bait').every(r => r.kind === 'bait')).toBe(true);
  });

  it('두 탭의 레시피를 합하면 모든 레시피다', () => {
    expect(recipesOfKind('lunch').length + recipesOfKind('bait').length).toBe(RECIPES.length);
  });

  it('등급 미끼만 등급이 있고 그 등급은 효과가 가중하는 가장 낮은 등급이다', () => {
    expect(recipeGrade(recipe('cook-bait-rare'))).toBe('rare');
    expect(recipeGrade(recipe('cook-bait-epic'))).toBe('epic');
    expect(recipeGrade(recipe('cook-bait-legendary'))).toBe('legendary');
    expect(recipeGrade(recipe('cook-bait-mutation'))).toBeNull();
    expect(recipeGrade(recipe('cook-lunch-rare'))).toBeNull(); // 도시락은 등급 가중이어도 등급 이름이 붙지 않는다
  });
});

describe('효과 줄', () => {
  it('입질 단축 도시락은 입질 대기 감소 한 줄이다', () => {
    expect(recipeEffectLines(recipe('cook-lunch-bite'))).toEqual([{ label: '입질 대기', value: '−10%' }]);
  });

  it('등급 가중은 가중되는 등급마다 한 줄이다', () => {
    expect(recipeEffectLines(recipe('cook-lunch-rare'))).toEqual([
      { label: '희귀 등급 가중치', value: '+10%' },
      { label: '영웅 등급 가중치', value: '+10%' },
      { label: '전설 등급 가중치', value: '+10%' },
    ]);
    expect(recipeEffectLines(recipe('cook-bait-legendary'))).toEqual([{ label: '전설 등급 가중치', value: '+60%' }]);
  });

  it('묶음 도시락은 입질 대기와 등급 가중을 모두 낸다', () => {
    expect(recipeEffectLines(recipe('cook-lunch-bundle')).map(l => `${l.label} ${l.value}`)).toEqual([
      '입질 대기 −5%', '희귀 등급 가중치 +5%', '영웅 등급 가중치 +5%', '전설 등급 가중치 +5%',
    ]);
  });

  it('돌연변이와 네임드 조우 가중치는 비율로 낸다', () => {
    expect(recipeEffectLines(recipe('cook-lunch-mutation'))).toEqual([{ label: '돌연변이 폼 가중치', value: '+50%' }]);
    expect(recipeEffectLines(recipe('cook-lunch-named'))).toEqual([{ label: '네임드 조우 가중치', value: '+50%' }]);
    expect(recipeEffectLines(recipe('cook-bait-mutation'))).toEqual([{ label: '돌연변이 폼 가중치', value: '+100%' }]);
  });

});

describe('필요와 보유', () => {
  const R = recipe('cook-lunch-rare'); // 일반 100, 희귀 20

  it('필요한 등급마다 필요(1개 요구 곱하기 수량)와 보유를 낸다', () => {
    const v = selectRecipeView(seed({ items: energy(250, 30) }), R, 2, T0);
    expect(v.cost).toEqual([
      { grade: 'common', need: 200, have: 250, short: false },
      { grade: 'rare', need: 40, have: 30, short: true },
    ]);
  });

  it('요구하지 않는 등급은 줄에 넣지 않는다', () => {
    const v = selectRecipeView(seed(), recipe('cook-lunch-named'), 1, T0);
    expect(v.cost.map(c => c.grade)).toEqual(['epic']);
  });

  it('1개를 만드는 데 드는 양을 목록용으로 함께 낸다', () => {
    const v = selectRecipeView(seed({ items: energy(100, 0) }), R, 3, T0);
    expect(v.unitCost).toEqual([{ grade: 'common', per: 100, short: false }, { grade: 'rare', per: 20, short: true }]);
  });

  it('가진 완성품 수를 함께 낸다', () => {
    const v = selectRecipeView(seed({ items: { [R.id]: 4 } }), R, 1, T0);
    expect(v.owned).toBe(4);
  });
});

describe('조리 가능 판정', () => {
  const R = recipe('cook-lunch-bite'); // 일반 600

  it('재료가 있고 집에 있으면 게임 규칙이 가능으로 판정한 값을 전한다', () => {
    expect(selectRecipeView(seed({ items: energy(600) }), R, 1, T0).check).toEqual({ ok: true });
  });

  it('기운이 모자라면 규칙의 거부 사유를 전한다', () => {
    expect(selectRecipeView(seed({ items: energy(599) }), R, 1, T0).check).toEqual({ ok: false, reason: 'not-enough-energy' });
  });

  it('이미 조리 중이면 거부 사유를 전한다', () => {
    const game = seed({ items: energy(1200), cooking: { recipe: R.id, count: 2, bonus: [false, false], startedAt: T0 } });
    expect(selectRecipeView(game, R, 1, at(10 * MIN)).check).toEqual({ ok: false, reason: 'cooking-busy' });
  });

  it('집 밖이면 거부 사유를 전한다', () => {
    const game = seed({ items: energy(1200), location: { kind: 'region', id: 'village' } });
    expect(selectRecipeView(game, R, 1, T0).check).toEqual({ ok: false, reason: 'not-at-home' });
  });
});

describe('수량과 보관함', () => {
  const R = recipe('cook-lunch-bite');

  it('고를 수 있는 수량은 보관함 남은 칸까지다', () => {
    const game = seed({ items: { ...energy(2000), [R.id]: 6 } });
    const v = selectRecipeView(game, R, 1, T0);
    expect(v.maxCount).toBe(COOK_STORAGE_CAP - 6);
  });

  it('조리 중인 수량도 보관함 칸을 차지한다', () => {
    const game = seed({ items: energy(2000), cooking: { recipe: R.id, count: 3, bonus: [false, false, false], startedAt: T0 } });
    expect(selectRecipeView(game, R, 1, T0).maxCount).toBe(COOK_STORAGE_CAP - 3);
  });

  it('요청 수량은 남은 칸으로 줄이고 보관함이 가득하면 0이다', () => {
    const open = seed({ items: energy(2000) });
    expect(selectRecipeView(open, R, 99, T0).count).toBe(COOK_STORAGE_CAP);
    const full = seed({ items: { ...energy(2000), [R.id]: COOK_STORAGE_CAP } });
    const v = selectRecipeView(full, R, 3, T0);
    expect(v.maxCount).toBe(0);
    expect(v.count).toBe(0);
    expect(v.check).toEqual({ ok: false, reason: 'storage-full' }); // 수량 0이어도 이유는 보관함이다
  });

  it('완성된 추가분이 상한을 넘겨도 남은 칸은 음수가 아니다', () => {
    const game = seed({
      items: { ...energy(2000), [R.id]: COOK_STORAGE_CAP + 2 },
    });
    expect(selectRecipeView(game, R, 1, T0).maxCount).toBe(0);
  });

  it('조리 시간과 슬롯 지속은 종류 규칙에서 읽고 조리 시간은 수량을 곱한다', () => {
    const lunch = selectRecipeView(seed({ items: energy(2000) }), R, 2, T0);
    expect(lunch.waitMs).toBe(2 * 60 * MIN);
    expect(lunch.slotMs).toBe(9 * 60 * MIN);
    const bait = selectRecipeView(seed({ items: energy(2000, 2000) }), recipe('cook-bait-mutation'), 3, T0);
    expect(bait.waitMs).toBe(3 * 15 * MIN);
    expect(bait.slotMs).toBe(30 * MIN);
  });
});

describe('저울 추가 완성', () => {
  const R = recipe('cook-lunch-bite');

  it('저울이 없으면 0이고 저울을 가지면 그 확률을 낸다', () => {
    expect(selectRecipeView(seed(), R, 1, T0).extraChance).toBe(0);
    expect(selectRecipeView(seed({ artifacts: ['varuna-scale'] }), R, 1, T0).extraChance).toBeGreaterThan(0);
  });
});

describe('조리 상태 줄', () => {
  const R = recipe('cook-lunch-bite');

  it('조리 중인 것이 없으면 보관함 수만 낸다', () => {
    const s = selectKitchenStatus(seed({ items: { [R.id]: 3 } }), T0);
    expect(s).toEqual({ cooking: null, stored: 3, cap: COOK_STORAGE_CAP, full: false });
  });

  it('조리 중이면 레시피와 완성 수, 다음 완성까지 남은 분을 낸다', () => {
    const game = seed({ cooking: { recipe: R.id, count: 3, bonus: [false, false, false], startedAt: T0 } });
    const s = selectKitchenStatus(game, at(90 * MIN));
    expect(s.cooking).toMatchObject({ recipe: R, completed: 1, count: 3, nextInMin: 30 });
    expect(s.stored).toBe(3); // 완성 1개와 조리 중 2개
  });

  it('남은 시간은 올림해서 1분 미만으로 보이지 않게 한다', () => {
    const game = seed({ cooking: { recipe: R.id, count: 1, bonus: [false], startedAt: T0 } });
    const s = selectKitchenStatus(game, at(60 * MIN - 5_000));
    expect(s.cooking?.nextInMin).toBe(1);
  });

  it('모두 완성되면 조리 중이 아니라 보관함에 든 것으로 센다', () => {
    const game = seed({ cooking: { recipe: R.id, count: 2, bonus: [true, false], startedAt: T0 } });
    const s = selectKitchenStatus(game, at(5 * 60 * MIN));
    expect(s.cooking).toBeNull();
    expect(s.stored).toBe(3); // 넣은 2개와 저울 추가분 1개
  });

  it('보관함이 상한이면 가득이다', () => {
    const s = selectKitchenStatus(seed({ items: { [R.id]: COOK_STORAGE_CAP } }), T0);
    expect(s.full).toBe(true);
  });
});

describe('레시피의 화면 이름', () => {
  it('등급 미끼는 이름 뒤에 등급을 괄호로 붙인다', () => {
    expect(recipeLabel(recipeById('cook-bait-rare')!)).toBe('롱페퍼 미끼(희귀)');
    expect(recipeLabel(recipeById('cook-bait-legendary')!)).toBe('용연향 미끼(전설)');
  });

  it('등급이 없는 도시락과 미끼 요리는 이름 그대로다', () => {
    expect(recipeLabel(recipeById('cook-lunch-bite')!)).toBe('가루디야');
    expect(recipeLabel(recipeById('cook-bait-mutation')!)).toBe('사프란 미끼');
  });
});
