// 가방 아이템 섹션 모델 — 기운 격자, 도시락과 미끼 행(보관함 완성분 포함), 해금 전 잠금과 빈 상태, 먹기 계획과 교체 확인.
import { describe, expect, it } from 'vitest';
import { COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS, recipeById } from '../../../game/content/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { GUEST_LOCK_DEFAULT_LINES, UNVERIFIED_LOCK_TEXT } from '../../display/model/menuLock';
import { filterItemSection, ITEM_GROUP_HINT, planEat, selectItemSection } from './bagItems';
import { recipesOfKind } from './recipes';

const T0 = '2026-11-12T00:00:00.000Z';
const MIN = 60_000;
const HOUR = 60 * MIN;
const RARE_WAIT = recipeById('cook-lunch-rare')!.waitMs;
const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: COOKING_UNLOCK_BOAT, ...over });

describe('아이템 섹션: 해금 전과 게스트', () => {
  it('해금 전 계정 사용자는 1줄 해금 전 안내, 빈 상태, 진행 조건 잠금 줄과 함께 미보유 항목은 잠금이고 보유·활성 도시락·미끼만 잠금 없이 연다', () => {
    const emptyLow = selectItemSection(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, 'account');
    expect(emptyLow.state).toBe('locked');
    if (emptyLow.state !== 'locked') return;
    expect(emptyLow.unlockNotice).toBe('인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.');
    expect(emptyLow.empty).toEqual(['가진 아이템이 없어요.']);
    expect(emptyLow.lines).toEqual(['인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.', '인도양 항로는 증기선(5단계)부터 열려요.']);
    expect(emptyLow.lunch).toHaveLength(6);
    expect(emptyLow.bait).toHaveLength(6);
    expect(emptyLow.energy).toHaveLength(4);
    expect(emptyLow.potions).toHaveLength(1);
    expect(emptyLow.lunch.every(r => r.lockLines !== null)).toBe(true);
    expect(emptyLow.bait.every(r => r.lockLines !== null)).toBe(true);
    expect(filterItemSection(emptyLow, true)).toEqual({ lunch: [], bait: [], energy: [], potions: [], empty: true });

    const ownedLow = selectItemSection(seed({
      boat: COOKING_UNLOCK_BOAT - 1,
      items: { 'cook-lunch-bundle': 1 },
      slots: { lunch: null, bait: { id: 'cook-bait-legendary', endsAt: at(MIN) } },
    }), T0, 'account');
    expect(ownedLow.state).toBe('locked');
    if (ownedLow.state !== 'locked') return;
    expect(ownedLow.lunch.find(r => r.recipe.id === 'cook-lunch-bundle')?.lockLines).toBeNull();
    expect(ownedLow.lunch.find(r => r.recipe.id === 'cook-lunch-bite')?.lockLines).toEqual(ownedLow.lines);
    expect(ownedLow.bait.find(r => r.recipe.id === 'cook-bait-legendary')?.lockLines).toBeNull();
    expect(ownedLow.bait.find(r => r.recipe.id === 'cook-bait-rare')?.lockLines).toEqual(ownedLow.lines);
    const filtered = filterItemSection(ownedLow, true);
    expect(filtered.empty).toBe(false);
    expect(filtered.lunch.map(r => r.recipe.id)).toEqual(['cook-lunch-bundle']);
    expect(filtered.bait.map(r => r.recipe.id)).toEqual(['cook-bait-legendary']);
  });

  it('게스트도 보유·활성 도시락·미끼는 잠금 없이 열고, 미보유 항목은 해금 전이면 진행 조건 잠금, 해금 뒤에는 게스트 잠금 줄이다', () => {
    const locked = selectItemSection(seed({
      boat: COOKING_UNLOCK_BOAT - 1,
      items: { 'cook-lunch-bundle': 1 },
      slots: { lunch: null, bait: { id: 'cook-bait-legendary', endsAt: at(MIN) } },
    }), T0, 'guest');
    expect(locked.state).toBe('locked');
    if (locked.state === 'locked') {
      expect(locked.unlockNotice).toBe('인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.');
      expect(locked.empty).toEqual(['가진 아이템이 없어요.']);
      expect(locked.lines).toEqual(['인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.', '인도양 항로는 증기선(5단계)부터 열려요.']);
      expect(locked.lunch.find(r => r.recipe.id === 'cook-lunch-bundle')?.lockLines).toBeNull();
      expect(locked.lunch.find(r => r.recipe.id === 'cook-lunch-bite')?.lockLines).toEqual(locked.lines);
      expect(locked.bait.find(r => r.recipe.id === 'cook-bait-legendary')?.lockLines).toBeNull();
      expect(locked.bait.find(r => r.recipe.id === 'cook-bait-rare')?.lockLines).toEqual(locked.lines);
    }

    const postUnlock = selectItemSection(seed({
      boat: COOKING_UNLOCK_BOAT,
      items: { 'cook-lunch-bundle': 1 },
    }), T0, 'guest');
    expect(postUnlock.state).toBe('locked');
    if (postUnlock.state === 'locked') {
      expect(postUnlock.unlockNotice).toBeNull();
      expect(postUnlock.empty).toEqual(['가진 아이템이 없어요.']);
      expect(postUnlock.lines).toEqual(GUEST_LOCK_DEFAULT_LINES);
      expect(postUnlock.lunch.find(r => r.recipe.id === 'cook-lunch-bundle')?.lockLines).toBeNull();
      expect(postUnlock.lunch.find(r => r.recipe.id === 'cook-lunch-bite')?.lockLines).toEqual(GUEST_LOCK_DEFAULT_LINES);
    }
  });

  it('확인 실패 상태는 해금 전후 모두 확인 실패 잠금 줄이지만 보유·활성 도시락·미끼는 잠금 없이 연다', () => {
    for (const boat of [COOKING_UNLOCK_BOAT - 1, COOKING_UNLOCK_BOAT]) {
      const v = selectItemSection(seed({ boat, items: { 'cook-lunch-bundle': 1 } }), T0, 'unverified');
      expect(v.state).toBe('locked');
      if (v.state !== 'locked') continue;
      expect(v.lines).toEqual([UNVERIFIED_LOCK_TEXT]);
      expect(v.lunch.find(r => r.recipe.id === 'cook-lunch-bundle')?.lockLines).toBeNull();
      expect(v.lunch.find(r => r.recipe.id === 'cook-lunch-bite')?.lockLines).toEqual([UNVERIFIED_LOCK_TEXT]);
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

  it('도시락과 미끼 소제목 툴팁은 전용 낚시 방식과 비접속 지속 두 줄을 담는다', () => {
    expect(ITEM_GROUP_HINT.lunch.split('\n')).toEqual([
      '방치로 낚을 때만 효과가 있어요.',
      '접속하지 않아도 지속 시간이 흘러요.',
    ]);
    expect(ITEM_GROUP_HINT.bait.split('\n')).toEqual([
      '직접 챔질해 낚을 때만 효과가 있어요.',
      '접속하지 않아도 지속 시간이 흘러요.',
    ]);
  });
});

describe('아이템 섹션: 열린 뒤', () => {
  it('기운은 등급 순서로 네 칸이고 이름 뒤 괄호에 등급이 붙는다', () => {
    const game = seed({ items: { [ENERGY_ITEM_IDS.common]: 38, [ENERGY_ITEM_IDS.epic]: 2 } });
    const v = selectItemSection(game, T0, 'account');
    expect(v.state).toBe('open');
    if (v.state !== 'open') return;
    expect(v.energy.map(e => [e.id, e.grade, e.label, e.stored])).toEqual([
      [ENERGY_ITEM_IDS.common, 'common', '생명의 기운(일반)', 38],
      [ENERGY_ITEM_IDS.rare, 'rare', '생명의 기운(희귀)', 0],
      [ENERGY_ITEM_IDS.epic, 'epic', '생명의 기운(영웅)', 2],
      [ENERGY_ITEM_IDS.legendary, 'legendary', '생명의 기운(전설)', 0],
    ]);
  });

  it('도시락과 미끼 행은 총 지속 시간을 가지며 사르가소의 그물망 보유 시 미끼 지속이 절반이다', () => {
    const base = seed({ items: { 'cook-lunch-bite': 1, 'cook-bait-rare': 1 } });
    const v1 = selectItemSection(base, T0, 'account');
    if (v1.state !== 'open') throw new Error('open이어야 해요');
    expect(v1.lunch[0].durationMinutes).toBe(9 * 60);
    expect(v1.bait[0].durationMinutes).toBe(5);

    const net = seed({ artifacts: ['sargasso-net'], items: { 'cook-lunch-bite': 1, 'cook-bait-rare': 1 } });
    const v2 = selectItemSection(net, T0, 'account');
    if (v2.state !== 'open') throw new Error('open이어야 해요');
    expect(v2.lunch[0].durationMinutes).toBe(9 * 60);
    expect(v2.bait[0].durationMinutes).toBe(2.5);
  });

  it('활성 중인 도시락과 미끼 모두 active와 now 기준 남은 시간을 갖는다', () => {
    const game = seed({
      artifacts: ['sargasso-net'],
      items: { 'cook-lunch-bite': 1, 'cook-lunch-rare': 1, 'cook-bait-rare': 1, 'cook-bait-epic': 1 },
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: at(8 * HOUR + 42 * MIN) },
        bait: { id: 'cook-bait-rare', endsAt: at(4 * MIN + 18_000) },
        bait2: { id: 'cook-bait-epic', endsAt: at(-MIN) },
      },
    });
    const v = selectItemSection(game, T0, 'account');
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch.filter(r => r.count > 0).map(r => [r.recipe.id, r.active, r.remainingMinutes])).toEqual([
      ['cook-lunch-bite', true, 8 * 60 + 42],
      ['cook-lunch-rare', false, null],
    ]);
    expect(v.bait.filter(r => r.count > 0).map(r => [r.recipe.id, r.active, r.remainingMinutes])).toEqual([
      ['cook-bait-rare', true, 4.3],
      ['cook-bait-epic', false, null],
    ]);
  });

  it('도시락 6종과 미끼 6종 전체를 부엌 목록 순서로 내고 미보유는 수량 0이며 동작은 사용이다', () => {
    const game = seed({ items: { 'cook-lunch-rare': 1, 'cook-lunch-bite': 2, 'cook-bait-epic': 3, 'cook-bait-rare': 4 } });
    const v = selectItemSection(game, T0, 'account');
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch.map(r => [r.label, r.count, r.verb, r.slot])).toEqual([
      ['가루디야(일반)', 2, '사용', 'lunch'],
      ['민 몰리(희귀)', 1, '사용', 'lunch'],
      ['키리바트(희귀)', 0, '사용', 'lunch'],
      ['생선 비리야니(영웅)', 0, '사용', 'lunch'],
      ['암불 티얄(영웅)', 0, '사용', 'lunch'],
      ['생선 탈리(전설)', 0, '사용', 'lunch'],
    ]);
    expect(v.bait.map(r => [r.label, r.count, r.verb, r.slot])).toEqual([
      ['롱페퍼 미끼(희귀)', 4, '사용', 'bait'],
      ['큐베브 미끼(영웅)', 3, '사용', 'bait'],
      ['용연향 미끼(전설)', 0, '사용', 'bait'],
      ['사프란 미끼(특수)', 0, '사용', 'bait'],
      ['백단향 미끼(특수)', 0, '사용', 'bait'],
      ['달빛 미끼(특수)', 0, '사용', 'bait'],
    ]);
  });

  it('미끼 행은 부엌 미끼 탭과 같은 순서다. 등급순이고 특수는 뒤다', () => {
    const game = seed({ items: { 'cook-bait-night': 1, 'cook-bait-mutation': 1, 'cook-bait-legendary': 1, 'cook-bait-epic': 1, 'cook-bait-rare': 1 } });
    const v = selectItemSection(game, T0, 'account');
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.bait.map(r => r.recipe.id)).toEqual(recipesOfKind('bait').map(r => r.id));
  });

  it('행은 이름과 표시 등급을 나눠 갖는다. 괄호만 등급색으로 칠하는 화면이 쓴다', () => {
    const game = seed({ items: { 'cook-lunch-bite': 1, 'cook-bait-epic': 1, 'cook-bait-mutation': 1 } });
    const v = selectItemSection(game, T0, 'account');
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch[0].title).toEqual({ name: '가루디야', grade: 'common' });
    expect(v.bait.filter(r => r.count > 0).map(r => r.title)).toEqual([
      { name: '큐베브 미끼', grade: 'epic' }, { name: '사프란 미끼', grade: 'special' },
    ]);
  });

  it('행은 효과 툴팁에 쓸 효과 줄과 상세 창 주의사항을 갖는다', () => {
    const v = selectItemSection(seed({ items: { 'cook-lunch-bite': 1, 'cook-bait-rare': 1 } }), T0, 'account');
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch[0].effects).toEqual([{ label: '입질 대기', value: '−10%' }]);
    expect(v.lunch[0].note).toBe(ITEM_GROUP_HINT.lunch);
    expect(v.bait[0].note).toBe(ITEM_GROUP_HINT.bait);
  });

  it('조리가 끝났지만 보관함으로 옮겨지지 않은 완성분도 행에 센다', () => {
    const game = seed({
      items: { 'cook-lunch-rare': 1 },
      cooking: { id: 'c1', recipe: 'cook-lunch-rare', count: 3, bonus: [false, false, false], startedAt: T0 },
    });
    // 대기의 2.5배가 지나면 2개가 완성되고 1개는 조리 중이다
    const v = selectItemSection(game, at(2.5 * RARE_WAIT), 'account');
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch.find(r => r.recipe.id === 'cook-lunch-rare')?.count).toBe(3);
  });

  it('조리 중이고 아직 완성되지 않은 분은 행에 세지 않는다', () => {
    const game = seed({ cooking: { id: 'c1', recipe: 'cook-lunch-rare', count: 2, bonus: [false, false], startedAt: T0 } });
    const v = selectItemSection(game, at(RARE_WAIT / 2), 'account');
    if (v.state !== 'open') throw new Error('open이어야 해요');
    expect(v.lunch.every(r => r.count === 0)).toBe(true);
  });

  it('가진 것이 하나도 없으면 비어 있다고 알리고, 보유 중만 보기 필터는 수량 > 0 또는 적용 중인 것만 남긴다', () => {
    const emptyView = selectItemSection(seed(), T0, 'account');
    if (emptyView.state !== 'open') throw new Error('open이어야 해요');
    expect(emptyView.empty).toBe(true);
    expect(filterItemSection(emptyView, false).empty).toBe(false);
    expect(filterItemSection(emptyView, true)).toEqual({ lunch: [], bait: [], energy: [], potions: [], empty: true });

    const activeZeroOwned = selectItemSection(seed({
      items: { [ENERGY_ITEM_IDS.rare]: 1 },
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null },
    }), T0, 'account');
    if (activeZeroOwned.state !== 'open') throw new Error('open이어야 해요');
    expect(activeZeroOwned.empty).toBe(false);
    const filtered = filterItemSection(activeZeroOwned, true);
    expect(filtered.empty).toBe(false);
    expect(filtered.lunch.map(r => [r.recipe.id, r.count, r.active])).toEqual([['cook-lunch-bite', 0, true]]);
    expect(filtered.bait).toEqual([]);
    expect(filtered.energy.map(e => e.grade)).toEqual(['rare']);
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
      title: '도시락 바꾸기', confirmLabel: '사용',
      current: { label: '가루디야(일반)', title: { name: '가루디야', grade: 'common' }, minutes: 8 * 60 + 12 },
      next: { label: '민 몰리(희귀)', title: { name: '민 몰리', grade: 'rare' }, minutes: 9 * 60 },
      warning: '지금 효과의 남은 시간은 사라져요.',
    });
  });

  it('같은 것을 다시 넣어도 교체 확인이다', () => {
    const plan = planEat(seed({ items: own, slots: { lunch, bait: null } }), 'cook-lunch-bite', T0);
    expect(plan.confirm?.title).toBe('도시락 바꾸기');
    expect(plan.confirm?.current.label).toBe('가루디야(일반)');
    expect(plan.confirm?.next.label).toBe('가루디야(일반)');
  });

  it('미끼 슬롯은 미끼 바꾸기이고 확인 버튼은 사용이다', () => {
    const bait = { id: 'cook-bait-rare', endsAt: at(24 * MIN) };
    const plan = planEat(seed({ items: own, slots: { lunch: null, bait } }), 'cook-bait-epic', T0);
    expect(plan.slot).toBe('bait');
    expect(plan.confirm).toMatchObject({
      title: '미끼 바꾸기', confirmLabel: '사용',
      current: { label: '롱페퍼 미끼(희귀)', minutes: 24 }, next: { label: '큐베브 미끼(영웅)', minutes: 5 },
    });
  });

  it('끝난 슬롯은 잃을 효과가 없어 확인하지 않는다', () => {
    const ended = { id: 'cook-lunch-bite', endsAt: at(-MIN) };
    expect(planEat(seed({ items: own, slots: { lunch: ended, bait: null } }), 'cook-lunch-rare', T0).confirm).toBeNull();
  });

  it('남은 시간은 초 단위를 버리지 않는 실제 분 값이다', () => {
    const game = seed({ items: own, slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(30_000) }, bait: null } });
    expect(planEat(game, 'cook-lunch-rare', T0).confirm?.current.minutes).toBe(0.5);
  });

  it('배 해금 전이라도 보유한 요리는 게스트 여부와 무관하게 허용하고, 미보유는 게임 규칙의 거부 사유를 낸다', () => {
    expect(planEat(seed(), 'cook-lunch-bite', T0).check).toEqual({ ok: false, reason: 'item-not-owned' });
    expect(planEat(seed({ boat: 0, items: own }), 'cook-lunch-bite', T0).check)
      .toEqual({ ok: true });
  });

  it('다중 미끼 유물이 있으면 미끼 0·1칸 사용 중일 때 다른 미끼는 확인 없이 바로 쓰고, 사용 중 여부를 표시한다', () => {
    const items = { 'cook-bait-rare': 1, 'cook-bait-epic': 1, 'cook-bait-legendary': 1 };
    const oneActive = seed({
      artifacts: ['sargasso-net'],
      items,
      slots: { lunch: null, bait: { id: 'cook-bait-rare', endsAt: at(2 * MIN) } },
    });
    expect(planEat(oneActive, 'cook-bait-epic', T0).confirm).toBeNull();

    // 같은 미끼를 다시 쓰면 확인 창이 뜨고 지속 시간은 절반(2.5분)
    const dup = planEat(oneActive, 'cook-bait-rare', T0);
    expect(dup.confirm).toEqual({
      title: '미끼 바꾸기', confirmLabel: '사용',
      current: { label: '롱페퍼 미끼(희귀)', title: { name: '롱페퍼 미끼', grade: 'rare' }, minutes: 2 },
      next: { label: '롱페퍼 미끼(희귀)', title: { name: '롱페퍼 미끼', grade: 'rare' }, minutes: 2.5 },
      warning: '지금 효과의 남은 시간은 사라져요.',
    });

    const sec = selectItemSection(oneActive, T0, 'account');
    if (sec.state !== 'open') throw new Error('open이어야 해요');
    expect(sec.bait.filter(r => r.count > 0).map(r => [r.recipe.id, r.active])).toEqual([
      ['cook-bait-rare', true],
      ['cook-bait-epic', false],
      ['cook-bait-legendary', false],
    ]);
  });

  it('다중 미끼 두 슬롯이 모두 찬 상태에서 세 번째 미끼를 쓰면 교체 슬롯 선택지와 먼저 끝나는 기본 선택을 낸다', () => {
    const items = { 'cook-bait-rare': 1, 'cook-bait-epic': 1, 'cook-bait-legendary': 1 };
    const both = seed({
      artifacts: ['sargasso-net'],
      items,
      slots: {
        lunch: null,
        bait: { id: 'cook-bait-rare', endsAt: at(150_000) },
        bait2: { id: 'cook-bait-epic', endsAt: at(60_000) },
      },
    });
    const plan = planEat(both, 'cook-bait-legendary', T0);
    expect(plan.confirm).toEqual({
      title: '미끼 바꾸기', confirmLabel: '사용',
      current: { label: '큐베브 미끼(영웅)', title: { name: '큐베브 미끼', grade: 'epic' }, minutes: 1 },
      next: { label: '용연향 미끼(전설)', title: { name: '용연향 미끼', grade: 'legendary' }, minutes: 2.5 },
      warning: '지금 효과의 남은 시간은 사라져요.',
      choices: [
        { slotKey: 'bait', label: '롱페퍼 미끼(희귀)', title: { name: '롱페퍼 미끼', grade: 'rare' }, minutes: 2.5 },
        { slotKey: 'bait2', label: '큐베브 미끼(영웅)', title: { name: '큐베브 미끼', grade: 'epic' }, minutes: 1 },
      ],
      defaultChoice: 'bait2',
    });
  });
});

describe('비약 묶음', () => {
  it('계정·게스트·배 단계와 무관하게 비약 잠금이 없고 보유·활성·사용 가능 여부를 돌려준다', () => {
    for (const account of ['account', 'guest', 'unverified'] as const) {
      const lowBoat = selectItemSection(
        seed({ boat: 0, items: { 'luck-small': 2 } }),
        T0,
        account,
      );
      expect(lowBoat.state).toBe('locked');
      expect('potionLock' in lowBoat).toBe(false);
      expect(lowBoat.potions).toHaveLength(1);
      expect(lowBoat.potions[0]).toMatchObject({
        count: 2,
        active: false,
        usable: true,
        effects: [{ label: '모든 행운 효과', value: '×1.05' }],
        note: '하루 동안 이어져요. 하루는 새벽 4시에 새로 시작해요.',
      });

      const unowned = selectItemSection(seed({ boat: 0 }), T0, account);
      expect(unowned.potions[0]).toMatchObject({ count: 0, active: false, usable: false });

      const active = selectItemSection(
        seed({ boat: 0, items: { 'luck-small': 2 }, potions: { 'luck-small': '2026-11-12' } }),
        T0,
        account,
      );
      expect(active.potions[0]).toMatchObject({ count: 2, active: true, usable: false });
    }
  });
});
