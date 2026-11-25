// 요리 탭 모델 — 레시피 표시, 필요와 보유, 조리 가능 판정, 조리 상태 줄과 대기열.
// 조리 가능 여부와 보관함 수는 게임 규칙(canCook, cookStorageUsed)이 정하고, 이 모듈은 그 판정을 화면용 값으로 옮긴다.
import { describe, expect, it } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { DISPLAY_GRADE } from '../../../game/content/rarity';
import {
  COOK_KIND_RULES, COOK_STORAGE_CAP, ENERGY_ITEM_IDS, RECIPES, recipeById, recipeWaitMs, toStoredEnergy,
} from '../../../game/content/cooking';
import {
  recipeEffectLines, recipeGrade, recipeLabel, recipeTitle, recipesOfKind, selectKitchenStatus, selectRecipeView,
} from './recipes';

const T0 = '2026-11-12T00:00:00.000Z';
const MIN = 60_000;
const RARE_WAIT = recipeById('cook-lunch-rare')!.waitMs; // 3분
const EPIC_WAIT = recipeById('cook-lunch-mutation')!.waitMs; // 5분
const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const home = { kind: 'base', id: 'home' } as const;
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: 5, location: home, ...over });
// 등급별 보유 기운 — 인자는 화면 단위이고 items에는 저장 단위로 넣는다
const energy = (c = 0, r = 0, e = 0, l = 0): Record<string, number> => ({
  [ENERGY_ITEM_IDS.common]: toStoredEnergy(c), [ENERGY_ITEM_IDS.rare]: toStoredEnergy(r),
  [ENERGY_ITEM_IDS.epic]: toStoredEnergy(e), [ENERGY_ITEM_IDS.legendary]: toStoredEnergy(l),
});
const recipe = (id: string) => recipeById(id)!;

describe('종류별 레시피', () => {
  it('도시락 탭과 미끼 탭은 그 종류의 레시피를 등급순으로 낸다', () => {
    expect(recipesOfKind('lunch').map(r => r.id)).toEqual(RECIPES.filter(r => r.kind === 'lunch').map(r => r.id));
    expect(recipesOfKind('bait').every(r => r.kind === 'bait')).toBe(true);
  });

  it('미끼 탭은 등급순으로 두고 특수 등급 미끼를 맨 뒤에 둔다. 순서는 데이터 순서가 아니다', () => {
    expect(recipesOfKind('bait').map(r => r.id)).toEqual(
      ['cook-bait-rare', 'cook-bait-epic', 'cook-bait-legendary', 'cook-bait-mutation', 'cook-bait-night']);
    expect(recipesOfKind('bait')[0].id).toBe('cook-bait-rare'); // 미끼 탭의 기본 선택은 첫째다
  });

  it('두 탭의 레시피를 합하면 모든 레시피다', () => {
    expect(recipesOfKind('lunch').length + recipesOfKind('bait').length).toBe(RECIPES.length);
  });

  it('도시락과 미끼 모두 콘텐츠 정본의 등급을 표시 등급으로 가진다', () => {
    expect(recipeGrade(recipe('cook-lunch-bite'))).toBe('common');
    expect(recipeGrade(recipe('cook-lunch-rare'))).toBe('rare');
    expect(recipeGrade(recipe('cook-lunch-mutation'))).toBe('epic');
    expect(recipeGrade(recipe('cook-lunch-named'))).toBe('epic');
    expect(recipeGrade(recipe('cook-lunch-bundle'))).toBe('legendary');
    expect(recipeGrade(recipe('cook-bait-rare'))).toBe('rare');
    expect(recipeGrade(recipe('cook-bait-epic'))).toBe('epic');
    expect(recipeGrade(recipe('cook-bait-legendary'))).toBe('legendary');
    expect(recipeGrade(recipe('cook-bait-mutation'))).toBe('special');
    expect(recipeGrade(recipe('cook-bait-night'))).toBe('special');
  });
});

describe('효과 줄', () => {
  it('입질 단축 도시락은 입질 대기 감소 한 줄이다', () => {
    expect(recipeEffectLines(recipe('cook-lunch-bite'))).toEqual([{ label: '입질 대기', value: '−10%' }]);
  });

  it('등급 출현은 올라가는 등급마다 한 줄이다', () => {
    expect(recipeEffectLines(recipe('cook-lunch-rare'))).toEqual([
      { label: '희귀 어종 출현', value: '+10%' },
      { label: '영웅 어종 출현', value: '+10%' },
      { label: '전설 어종 출현', value: '+10%' },
    ]);
    expect(recipeEffectLines(recipe('cook-bait-legendary'))).toEqual([{ label: '전설 어종 출현', value: '+80%' }]);
  });

  it('묶음 도시락은 입질 대기와 등급 출현을 모두 낸다', () => {
    expect(recipeEffectLines(recipe('cook-lunch-bundle')).map(l => ('text' in l ? l.text : `${l.label} ${l.value}`))).toEqual([
      '입질 대기 −5%', '희귀 어종 출현 +5%', '영웅 어종 출현 +5%', '전설 어종 출현 +5%',
    ]);
  });

  it('돌연변이와 네임드 만날 확률은 비율로 낸다', () => {
    expect(recipeEffectLines(recipe('cook-lunch-mutation'))).toEqual([{ label: '돌연변이 출현', value: '+50%' }]);
    expect(recipeEffectLines(recipe('cook-lunch-named'))).toEqual([{ label: '네임드 만날 확률', value: '+50%' }]);
    expect(recipeEffectLines(recipe('cook-bait-mutation'))).toEqual([{ label: '돌연변이 출현', value: '+150%' }]);
  });

  it('밤 어종 출현 미끼는 비수치 상세 설명 한 줄이다', () => {
    expect(recipeEffectLines(recipe('cook-bait-night'))).toEqual([{ text: '낮에도 밤 어종이 함께 낚여요.' }]);
  });
});

describe('필요와 보유', () => {
  const R = recipe('cook-lunch-rare'); // 일반 100, 희귀 20 (저장 단위로는 1000, 200)

  it('필요한 등급마다 필요(1개 요구 곱하기 수량)와 보유를 저장 단위로 낸다', () => {
    const v = selectRecipeView(seed({ items: energy(250, 30) }), R, 2, T0);
    expect(v.cost).toEqual([
      { grade: 'common', need: 2000, have: 2500, short: false },
      { grade: 'rare', need: 400, have: 300, short: true },
    ]);
  });

  it('저장 단위 1(화면 단위 0.1)이 모자라도 부족으로 낸다', () => {
    const v = selectRecipeView(seed({ items: energy(99.9, 20) }), R, 1, T0);
    expect(v.cost[0]).toEqual({ grade: 'common', need: 1000, have: 999, short: true });
    expect(v.unitCost[0]).toEqual({ grade: 'common', per: 1000, short: true });
    expect(v.check).toEqual({ ok: false, reason: 'not-enough-energy' });
  });

  it('요구하지 않는 등급은 줄에 넣지 않는다', () => {
    const v = selectRecipeView(seed(), recipe('cook-lunch-named'), 1, T0);
    expect(v.cost.map(c => c.grade)).toEqual(['epic']);
  });

  it('1개를 만드는 데 드는 양을 목록용으로 함께 낸다', () => {
    const v = selectRecipeView(seed({ items: energy(100, 0) }), R, 3, T0);
    expect(v.unitCost).toEqual([{ grade: 'common', per: 1000, short: false }, { grade: 'rare', per: 200, short: true }]);
  });

  it('가진 완성품 수를 함께 낸다', () => {
    const v = selectRecipeView(seed({ items: { [R.id]: 4 } }), R, 1, T0);
    expect(v.owned).toBe(4);
  });

  it('이름과 표시 등급을 나눈 이름을 함께 낸다. 보유 줄과 상세 머리가 같은 이름을 쓴다', () => {
    expect(selectRecipeView(seed(), recipe('cook-lunch-bite'), 1, T0).title).toEqual({ name: '가루디야', grade: 'common' });
    expect(selectRecipeView(seed(), recipe('cook-bait-mutation'), 1, T0).title).toEqual({ name: '사프란 미끼', grade: 'special' });
  });

  it('지속 시간은 그 종류의 슬롯 지속(ms)이며, 사르가소의 그물망이 있으면 미끼 지속이 절반이 된다', () => {
    expect(selectRecipeView(seed(), recipe('cook-lunch-bite'), 1, T0).slotMs).toBe(9 * 60 * MIN);
    expect(selectRecipeView(seed(), recipe('cook-bait-rare'), 1, T0).slotMs).toBe(5 * MIN);
    expect(selectRecipeView(seed({ artifacts: ['sargasso-net'] }), recipe('cook-bait-rare'), 1, T0).slotMs).toBe(2.5 * MIN);
    expect(selectRecipeView(seed({ artifacts: ['sargasso-net'] }), recipe('cook-lunch-bite'), 1, T0).slotMs).toBe(9 * 60 * MIN);
  });
});

describe('조리 가능 판정과 실행 모드', () => {
  const INSTANT = recipe('cook-lunch-bite'); // 일반 600, 0분
  const TIMED = recipe('cook-lunch-rare');   // 일반 100, 희귀 20, 3분

  it('재료가 있고 집에 있으면 게임 규칙이 가능으로 판정한 값을 전한다', () => {
    const instant = selectRecipeView(seed({ items: energy(600) }), INSTANT, 1, T0);
    expect(instant.check).toEqual({ ok: true });
    expect(instant.mode).toBe('instant');

    const start = selectRecipeView(seed({ items: energy(100, 20) }), TIMED, 1, T0);
    expect(start.check).toEqual({ ok: true });
    expect(start.mode).toBe('start');
  });

  it('기운이 모자라면 규칙의 거부 사유를 전한다', () => {
    expect(selectRecipeView(seed({ items: energy(599) }), INSTANT, 1, T0).check).toEqual({ ok: false, reason: 'not-enough-energy' });
  });

  it('이미 조리 중이면 대기 시간 있는 요리는 queue 모드로 추가 가능하고, 즉시 요리는 instant 모드다', () => {
    const game = seed({
      items: energy(1000, 40),
      cooking: { id: 'c1', recipe: TIMED.id, count: 2, bonus: [false, false], startedAt: T0 },
    });
    const queued = selectRecipeView(game, TIMED, 1, at(1 * MIN));
    expect(queued.check).toEqual({ ok: true });
    expect(queued.mode).toBe('queue');

    const instant = selectRecipeView(game, INSTANT, 1, at(1 * MIN));
    expect(instant.check).toEqual({ ok: true });
    expect(instant.mode).toBe('instant');
  });

  it('집 밖이면 거부 사유를 전한다', () => {
    const game = seed({ items: energy(1200), location: { kind: 'region', id: 'village' } });
    expect(selectRecipeView(game, INSTANT, 1, T0).check).toEqual({ ok: false, reason: 'not-at-home' });
  });
});

describe('수량과 보관함', () => {
  const R = recipe('cook-lunch-rare');

  it('고를 수 있는 수량은 보관함 남은 칸까지다', () => {
    const game = seed({ items: { ...energy(2000, 200), [R.id]: 6 } });
    const v = selectRecipeView(game, R, 1, T0);
    expect(v.maxCount).toBe(COOK_STORAGE_CAP - 6);
  });

  it('조리 중인 수량과 대기열 수량도 보관함 칸을 차지한다', () => {
    const game = seed({
      items: energy(2000, 200),
      cooking: { id: 'c1', recipe: R.id, count: 3, bonus: [false, false, false], startedAt: T0 },
      cookingQueue: [{ id: 'q1', recipe: 'cook-lunch-mutation', count: 2, bonus: [false, false] }],
    });
    expect(selectRecipeView(game, R, 1, T0).maxCount).toBe(COOK_STORAGE_CAP - 5);
  });

  it('요청 수량은 남은 칸으로 줄이고 보관함이 가득하면 0이다', () => {
    const open = seed({ items: energy(2000, 200) });
    expect(selectRecipeView(open, R, 99, T0).count).toBe(COOK_STORAGE_CAP);
    const full = seed({ items: { ...energy(2000, 200), [R.id]: COOK_STORAGE_CAP } });
    const v = selectRecipeView(full, R, 3, T0);
    expect(v.maxCount).toBe(0);
    expect(v.count).toBe(0);
    expect(v.check).toEqual({ ok: false, reason: 'storage-full' }); // 수량 0이어도 이유는 보관함이다
  });

  it('완성된 추가분이 상한을 넘겨도 남은 칸은 음수가 아니다', () => {
    const game = seed({
      items: { ...energy(2000, 200), [R.id]: COOK_STORAGE_CAP + 2 },
    });
    expect(selectRecipeView(game, R, 1, T0).maxCount).toBe(0);
  });

  it('레시피별 제작 시간(recipeWaitMs)과 종류별 슬롯 지속을 읽고 조리 시간은 수량을 곱한다', () => {
    const instant = selectRecipeView(seed({ items: energy(2000) }), recipe('cook-lunch-bite'), 2, T0);
    expect(instant.unitWaitMs).toBe(0);
    expect(instant.waitMs).toBe(0);
    expect(instant.slotMs).toBe(COOK_KIND_RULES.lunch.slotMs);

    const lunch = selectRecipeView(seed({ items: energy(2000, 200) }), R, 2, T0);
    expect(lunch.unitWaitMs).toBe(recipeWaitMs(R));
    expect(lunch.waitMs).toBe(2 * RARE_WAIT);
    expect(lunch.slotMs).toBe(COOK_KIND_RULES.lunch.slotMs);

    const bait = selectRecipeView(seed({ items: energy(2000, 2000) }), recipe('cook-bait-mutation'), 3, T0);
    expect(bait.unitWaitMs).toBe(0);
    expect(bait.waitMs).toBe(0);
    expect(bait.slotMs).toBe(COOK_KIND_RULES.bait.slotMs);
  });
});

describe('저울 추가 완성', () => {
  const R = recipe('cook-lunch-bite');

  it('저울이 없으면 0이고 저울을 가지면 그 확률을 낸다', () => {
    expect(selectRecipeView(seed(), R, 1, T0).extraChance).toBe(0);
    expect(selectRecipeView(seed({ artifacts: ['varuna-scale'] }), R, 1, T0).extraChance).toBeGreaterThan(0);
  });
});

describe('조리 상태 줄과 대기열', () => {
  const R = recipe('cook-lunch-rare'); // 3분, 일반 100, 희귀 20
  const M = recipe('cook-lunch-mutation'); // 5분, 희귀 20, 영웅 4

  it('조리 중인 것이 없으면 대기열 0건과 보관함 수만 낸다', () => {
    const s = selectKitchenStatus(seed({ items: { [R.id]: 3 } }), T0);
    expect(s).toEqual({ cooking: null, queue: [], queueCount: 0, stored: 3, cap: COOK_STORAGE_CAP, full: false });
  });

  it('조리 중이면 현재 조리, 대기열 항목, 미완성 수량 100% 환급 기운을 낸다', () => {
    const game = seed({
      cooking: { id: 'c1', recipe: R.id, count: 3, bonus: [false, false, false], startedAt: T0 },
      cookingQueue: [{ id: 'q1', recipe: M.id, count: 2, bonus: [false, false] }],
    });
    const s = selectKitchenStatus(game, at(RARE_WAIT + 1 * MIN));
    expect(s.cooking).toMatchObject({ id: 'c1', recipe: R, completed: 1, count: 3, nextInMin: 2 });
    expect(s.stored).toBe(5); // 현재 3 + 대기열 2
    expect(s.queueCount).toBe(2);
    expect(s.queue[0]).toMatchObject({
      id: 'c1',
      recipe: R,
      completed: 1,
      count: 3,
      pending: 2,
      estimatedMin: 5, // 총 9분 중 4분 경과 -> 남은 5분
      isCurrent: true,
    });
    expect(s.queue[0].refundLines).toEqual([
      { grade: 'common', label: '생명의 기운(일반)', amountText: '200', stored: 2000 },
      { grade: 'rare', label: '생명의 기운(희귀)', amountText: '40', stored: 400 },
    ]);
    expect(s.queue[1]).toMatchObject({
      id: 'q1',
      recipe: M,
      completed: 0,
      count: 2,
      pending: 2,
      estimatedMin: 15, // 앞 작업 남은 5분 + 2×5분
      isCurrent: false,
    });
  });

  it('앞 조리가 모두 끝나면 대기열 첫 항목이 연쇄 정산되어 현재 조리로 오른다', () => {
    const game = seed({
      cooking: { id: 'c1', recipe: R.id, count: 1, bonus: [false], startedAt: T0 }, // 3분 완료
      cookingQueue: [{ id: 'q1', recipe: M.id, count: 2, bonus: [false, false] }],   // 3분~13분
    });
    const promoted = selectKitchenStatus(game, at(RARE_WAIT + 1 * MIN)); // 4분 경과 -> q1 0/2 진행, 다음 완성 4분
    expect(promoted.cooking).toMatchObject({ id: 'q1', recipe: M, completed: 0, count: 2, nextInMin: 4 });
    expect(promoted.queue).toHaveLength(1);
    expect(promoted.queue[0]).toMatchObject({ id: 'q1', isCurrent: true, pending: 2, estimatedMin: 9 });

    const partial = selectKitchenStatus(game, at(RARE_WAIT + EPIC_WAIT + 1 * MIN)); // 9분 경과 -> q1 1개 보관함 반영 후 0/1 진행
    expect(partial.cooking).toMatchObject({ id: 'q1', recipe: M, completed: 0, count: 1, nextInMin: 4 });
    expect(partial.stored).toBe(3);
  });

  it('남은 시간은 올림해서 1분 미만으로 보이지 않게 한다', () => {
    const game = seed({ cooking: { id: 'c1', recipe: R.id, count: 1, bonus: [false], startedAt: T0 } });
    const s = selectKitchenStatus(game, at(RARE_WAIT - 5_000));
    expect(s.cooking?.nextInMin).toBe(1);
  });

  it('모두 완성되면 조리 중이 아니라 보관함에 든 것으로 센다', () => {
    const game = seed({ cooking: { id: 'c1', recipe: R.id, count: 2, bonus: [true, false], startedAt: T0 } });
    const s = selectKitchenStatus(game, at(2 * RARE_WAIT));
    expect(s.cooking).toBeNull();
    expect(s.queue).toEqual([]);
    expect(s.stored).toBe(3); // 넣은 2개와 저울 추가분 1개
  });

  it('보관함이 상한이면 가득이다', () => {
    const s = selectKitchenStatus(seed({ items: { [R.id]: COOK_STORAGE_CAP } }), T0);
    expect(s.full).toBe(true);
  });
});

describe('레시피의 화면 이름', () => {
  it('도시락과 미끼 모두 이름 뒤에 표시 등급을 괄호로 붙인다', () => {
    expect(recipeLabel(recipeById('cook-lunch-bite')!)).toBe('가루디야(일반)');
    expect(recipeLabel(recipeById('cook-lunch-rare')!)).toBe('민 몰리(희귀)');
    expect(recipeLabel(recipeById('cook-lunch-named')!)).toBe('암불 티얄(영웅)');
    expect(recipeLabel(recipeById('cook-lunch-bundle')!)).toBe('생선 탈리(전설)');
    expect(recipeLabel(recipeById('cook-bait-rare')!)).toBe('롱페퍼 미끼(희귀)');
    expect(recipeLabel(recipeById('cook-bait-legendary')!)).toBe('용연향 미끼(전설)');
    expect(recipeLabel(recipeById('cook-bait-mutation')!)).toBe('사프란 미끼(특수)');
    expect(recipeLabel(recipeById('cook-bait-night')!)).toBe('달빛 미끼(특수)');
  });

  it('이름과 표시 등급을 나눠 돌려주고, 합친 문자열은 recipeLabel과 같다', () => {
    expect(recipeTitle(recipeById('cook-bait-epic')!)).toEqual({ name: '큐베브 미끼', grade: 'epic' });
    expect(recipeTitle(recipeById('cook-bait-mutation')!)).toEqual({ name: '사프란 미끼', grade: 'special' });
    expect(recipeTitle(recipeById('cook-lunch-bite')!)).toEqual({ name: '가루디야', grade: 'common' });
    for (const r of RECIPES) {
      const t = recipeTitle(r);
      expect(recipeLabel(r), r.id).toBe(t.grade === null ? t.name : `${t.name}(${DISPLAY_GRADE[t.grade].name})`);
    }
  });
});
