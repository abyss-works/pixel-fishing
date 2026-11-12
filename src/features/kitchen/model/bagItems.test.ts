// 가방 아이템 섹션 모델 — 기운 격자, 도시락과 미끼 행(보관함 완성분 포함), 해금 전 잠금과 빈 상태, 먹기 계획과 교체 확인.
import { describe, expect, it } from 'vitest';
import { COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS } from '../../../game/content/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { GUEST_LOCK_TEXT } from '../../display/model/menuLock';
import { ITEM_GROUP_HINT, planEat, selectItemSection } from './bagItems';

const T0 = '2026-11-12T00:00:00.000Z';
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: COOKING_UNLOCK_BOAT, ...over });

describe('아이템 섹션: 해금 전과 게스트', () => {
  it('해금 전 계정 사용자는 빈 상태 세 줄과 진행 조건 잠금 줄을 받는다', () => {
    const v = selectItemSection(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, false);
    expect(v.state).toBe('locked');
    if (v.state !== 'locked') return;
    expect(v.empty).toEqual([
      '가진 아이템이 없어요.',
      '인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.',
      '인도양 항로는 증기선(5단계)부터 열려요.',
    ]);
    expect(v.lines).toEqual(['인도양 항로가 열리면 부엌을 쓸 수 있어요.', '인도양 항로는 증기선(5단계)부터 열려요.']);
  });

  it('게스트는 해금 전후 모두 한 줄 빈 상태와 게스트 잠금 줄이다', () => {
    for (const boat of [COOKING_UNLOCK_BOAT - 1, COOKING_UNLOCK_BOAT]) {
      const v = selectItemSection(seed({ boat }), T0, true);
      expect(v.state).toBe('locked');
      if (v.state !== 'locked') continue;
      expect(v.empty).toEqual(['가진 아이템이 없어요.']);
      expect(v.lines).toEqual([GUEST_LOCK_TEXT]);
    }
  });
});

describe('묶음 소제목 툴팁', () => {
  it('생명의 기운 소제목은 기운 얻기를 집 궤짝이나 항구 어시장에서 할 수 있다고 알린다', () => {
    expect(ITEM_GROUP_HINT.energy.split('\n')).toEqual([
      '물고기 한 마리에서 그 등급의 생명의 기운 하나를 얻어요.',
      '기운 얻기는 집 궤짝이나 항구 어시장에서 할 수 있어요.',
    ]);
  });
});

describe('아이템 섹션: 열린 뒤', () => {
  it('기운은 등급 순서로 네 칸이고 이름 뒤 괄호에 등급이 붙는다', () => {
    const game = seed({ items: { [ENERGY_ITEM_IDS.common]: 38, [ENERGY_ITEM_IDS.epic]: 2 } });
    const v = selectItemSection(game, T0, false);
    expect(v.state).toBe('open');
    if (v.state !== 'open') return;
    expect(v.energy.map(e => [e.grade, e.label, e.stored])).toEqual([
      ['common', '생명의 기운(일반)', 38], ['rare', '생명의 기운(희귀)', 0],
      ['epic', '생명의 기운(영웅)', 2], ['legendary', '생명의 기운(전설)', 0],
    ]);
  });

  it('도시락과 미끼 행은 가진 것만 콘텐츠 순서로, 동작 이름과 슬롯을 갖는다', () => {
    const game = seed({ items: { 'cook-lunch-rare': 1, 'cook-lunch-bite': 2, 'cook-bait-epic': 3, 'cook-bait-rare': 4 } });
    const v = selectItemSection(game, T0, false);
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch.map(r => [r.label, r.count, r.verb, r.slot])).toEqual([
      ['가루디야', 2, '먹기', 'lunch'], ['민 몰리', 1, '먹기', 'lunch'],
    ]);
    expect(v.bait.map(r => [r.label, r.count, r.verb, r.slot])).toEqual([
      ['롱페퍼 미끼(희귀)', 4, '쓰기', 'bait'], ['큐베브 미끼(영웅)', 3, '쓰기', 'bait'],
    ]);
  });

  it('행은 이름과 표시 등급을 나눠 갖는다. 괄호만 등급색으로 칠하는 화면이 쓴다', () => {
    const game = seed({ items: { 'cook-lunch-bite': 1, 'cook-bait-epic': 1, 'cook-bait-mutation': 1 } });
    const v = selectItemSection(game, T0, false);
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch[0].title).toEqual({ name: '가루디야', grade: null });
    expect(v.bait.map(r => r.title)).toEqual([
      { name: '사프란 미끼', grade: 'special' }, { name: '큐베브 미끼', grade: 'epic' },
    ]);
  });

  it('행은 이름의 툴팁에 쓸 효과 줄과 적용 낚시 안내를 갖는다', () => {
    const v = selectItemSection(seed({ items: { 'cook-lunch-bite': 1 } }), T0, false);
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch[0].effects).toEqual([{ label: '입질 대기', value: '−10%' }]);
    expect(v.lunch[0].note).toContain('방치로 낚을 때만 효과가 있어요.');
  });

  it('조리가 끝났지만 보관함으로 옮겨지지 않은 완성분도 행에 센다', () => {
    const game = seed({
      items: { 'cook-lunch-bite': 1 },
      cooking: { recipe: 'cook-lunch-bite', count: 3, bonus: [false, false, false], startedAt: T0 },
    });
    // 도시락 대기 60분: 2시간 30분 뒤 2개가 완성되고 1개는 조리 중이다
    const v = selectItemSection(game, at(2 * HOUR + 30 * MIN), false);
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch.map(r => [r.recipe.id, r.count])).toEqual([['cook-lunch-bite', 3]]);
  });

  it('조리 중이고 아직 완성되지 않은 분은 행에 세지 않는다', () => {
    const game = seed({ cooking: { recipe: 'cook-lunch-bite', count: 2, bonus: [false, false], startedAt: T0 } });
    const v = selectItemSection(game, at(30 * MIN), false);
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch).toEqual([]);
  });

  it('가진 것이 하나도 없으면 비어 있다고 알린다', () => {
    const v = selectItemSection(seed(), T0, false);
    expect(v.state === 'open' && v.empty).toBe(true);
    const some = selectItemSection(seed({ items: { [ENERGY_ITEM_IDS.rare]: 1 } }), T0, false);
    expect(some.state === 'open' && some.empty).toBe(false);
  });
});

describe('먹기 계획과 교체 확인', () => {
  const lunch = { id: 'cook-lunch-bite', endsAt: at(8 * HOUR + 12 * MIN) };
  const own = { 'cook-lunch-bite': 1, 'cook-lunch-rare': 1, 'cook-bait-epic': 1 };

  it('슬롯이 비어 있으면 확인 없이 바로 먹는다', () => {
    const plan = planEat(seed({ items: own }), 'cook-lunch-bite', T0);
    expect(plan.slot).toBe('lunch');
    expect(plan.check).toEqual({ ok: true });
    expect(plan.confirm).toBeNull();
  });

  it('효과가 든 슬롯에 다른 것을 넣으면 교체 확인이다. 제목과 두 행과 경고가 있다', () => {
    const plan = planEat(seed({ items: own, slots: { lunch, bait: null } }), 'cook-lunch-rare', T0);
    expect(plan.confirm).toEqual({
      title: '도시락 바꾸기', confirmLabel: '먹기',
      current: { label: '가루디야', minutes: 8 * 60 + 12 },
      next: { label: '민 몰리', minutes: 9 * 60 },
      warning: '지금 효과의 남은 시간은 사라져요.',
    });
  });

  it('같은 것을 다시 넣어도 교체 확인이다', () => {
    const plan = planEat(seed({ items: own, slots: { lunch, bait: null } }), 'cook-lunch-bite', T0);
    expect(plan.confirm?.title).toBe('도시락 바꾸기');
    expect(plan.confirm?.current.label).toBe('가루디야');
    expect(plan.confirm?.next.label).toBe('가루디야');
  });

  it('미끼 슬롯은 미끼 바꾸기이고 쓰기다', () => {
    const bait = { id: 'cook-bait-rare', endsAt: at(24 * MIN) };
    const plan = planEat(seed({ items: own, slots: { lunch: null, bait } }), 'cook-bait-epic', T0);
    expect(plan.slot).toBe('bait');
    expect(plan.confirm).toMatchObject({
      title: '미끼 바꾸기', confirmLabel: '쓰기',
      current: { label: '롱페퍼 미끼(희귀)', minutes: 24 }, next: { label: '큐베브 미끼(영웅)', minutes: 30 },
    });
  });

  it('끝난 슬롯은 잃을 효과가 없어 확인하지 않는다', () => {
    const ended = { id: 'cook-lunch-bite', endsAt: at(-MIN) };
    expect(planEat(seed({ items: own, slots: { lunch: ended, bait: null } }), 'cook-lunch-rare', T0).confirm).toBeNull();
  });

  it('남은 시간은 올림한 분이다', () => {
    const game = seed({ items: own, slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(30_000) }, bait: null } });
    expect(planEat(game, 'cook-lunch-rare', T0).confirm?.current.minutes).toBe(1);
  });

  it('가방에 없는 아이템은 게임 규칙의 거부 사유를 그대로 낸다', () => {
    expect(planEat(seed(), 'cook-lunch-bite', T0).check).toEqual({ ok: false, reason: 'item-not-owned' });
    expect(planEat(seed({ boat: COOKING_UNLOCK_BOAT - 1, items: own }), 'cook-lunch-bite', T0).check)
      .toEqual({ ok: false, reason: 'cooking-locked' });
  });
});
