// 슬롯·적용 중인 효과 카드 모델 — 남은 시간 표기, 지금 효과, 카드 표시 조건(잠금·비어 있음·활성)과 순서, 막대 비율.
import { describe, expect, it } from 'vitest';
import { COOKING_UNLOCK_BOAT, recipeById } from '../../../game/content/cooking';
import { slotDurationMs } from '../../../game/rules/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { gameDayOf } from '../../../game/rules/time';
import { GUEST_LOCK_DEFAULT_LINES, UNVERIFIED_LOCK_TEXT } from '../../display/model/menuLock';
import {
  activeSlot, DEFAULT_POLL_MS, fmtSlotTimeLeft, selectActiveEffectsView, selectEffectCard, slotPollIntervalMs, SUB_MINUTE_POLL_MS,
} from './slots';

const T0 = '2026-11-12T00:00:00.000Z';
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: COOKING_UNLOCK_BOAT, ...over });

describe('슬롯 남은 시간 표기', () => {
  it('1분 이상은 분까지만 표시하고 초는 버린다', () => {
    expect(fmtSlotTimeLeft(8 * HOUR + 12 * MIN)).toBe('8시간 12분');
    expect(fmtSlotTimeLeft(8 * HOUR + 12 * MIN + 59_000)).toBe('8시간 12분');
    expect(fmtSlotTimeLeft(9 * HOUR)).toBe('9시간');
    expect(fmtSlotTimeLeft(25 * MIN)).toBe('25분');
    expect(fmtSlotTimeLeft(119_000)).toBe('1분');
  });

  it('1분 미만은 초만 표시하고 0 이하는 0초다', () => {
    expect(fmtSlotTimeLeft(54_000)).toBe('54초');
    expect(fmtSlotTimeLeft(999)).toBe('0초');
    expect(fmtSlotTimeLeft(0)).toBe('0초');
    expect(fmtSlotTimeLeft(-5)).toBe('0초');
  });
});

describe('슬롯의 지금 효과', () => {
  it('끝나는 시각 전의 슬롯은 요리, 남은 시간, 효과 줄을 낸다', () => {
    const game = seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(8 * HOUR + 12 * MIN) }, bait: null } });
    const s = activeSlot(game, 'lunch', T0)!;
    expect(s.label).toBe('가루디야(일반)');
    expect(s.remainingMs).toBe(8 * HOUR + 12 * MIN);
    expect(s.timeLeft).toBe('8시간 12분');
    expect(s.rows).toEqual([{ label: '입질 대기', value: '−10%' }, { label: '남은 시간', value: '8시간 12분' }]);
    expect(s.effects).toEqual([{ label: '입질 대기', value: '−10%' }]);
  });

  it('끝나는 시각이 지났거나 같은 슬롯은 효과가 없다', () => {
    const slots = { lunch: { id: 'cook-lunch-bite', endsAt: at(0) }, bait: { id: 'cook-bait-mutation', endsAt: at(-1) } };
    expect(activeSlot(seed({ slots }), 'lunch', T0)).toBeNull();
    expect(activeSlot(seed({ slots }), 'bait', T0)).toBeNull();
  });

  it('비어 있거나 모르는 요리가 든 슬롯은 효과가 없다', () => {
    expect(activeSlot(seed(), 'lunch', T0)).toBeNull();
    expect(activeSlot(seed({ slots: { lunch: { id: 'unknown', endsAt: at(HOUR) }, bait: null } }), 'lunch', T0)).toBeNull();
  });

  it('등급 미끼는 이름 뒤 괄호에 등급이 붙는다', () => {
    const game = seed({ slots: { lunch: null, bait: { id: 'cook-bait-rare', endsAt: at(30 * MIN) } } });
    expect(activeSlot(game, 'bait', T0)!.label).toBe('롱페퍼 미끼(희귀)');
  });

  it('달빛 미끼는 비수치 상세 설명 한 줄과 남은 시간을 함께 낸다', () => {
    const game = seed({ slots: { lunch: null, bait: { id: 'cook-bait-night', endsAt: at(30 * MIN) } } });
    const s = activeSlot(game, 'bait', T0)!;
    expect(s.effects).toEqual([{ text: '낮에도 밤 어종이 함께 낚여요.' }]);
    expect(s.rows).toEqual([
      { text: '낮에도 밤 어종이 함께 낚여요.' },
      { label: '남은 시간', value: '30분' },
    ]);
  });
});

describe('적용 중인 효과 카드 표시 조건과 순서', () => {
  const LOCK_LINES = [
    '인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.',
    '인도양 항로는 증기선(5단계)부터 열려요.',
  ];

  it('해금 전이고 활성화된 다른 효과가 없으면 잠금 카드와 진행 조건 줄을 낸다', () => {
    expect(selectEffectCard(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, 'account')).toEqual({ state: 'locked', lines: LOCK_LINES });
  });

  it('게스트는 해금 전+활성 효과 없음이면 진행 조건 잠금이고, 해금 뒤+활성 효과 없음이면 게스트 잠금이다', () => {
    expect(selectEffectCard(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, 'guest')).toEqual({ state: 'locked', lines: LOCK_LINES });
    expect(selectEffectCard(seed({ boat: COOKING_UNLOCK_BOAT }), T0, 'guest')).toEqual({ state: 'locked', lines: [...GUEST_LOCK_DEFAULT_LINES] });
  });

  it('확인 실패 상태이고 활성 효과가 없으면 확인 실패 잠금이 먼저다', () => {
    expect(selectEffectCard(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, 'unverified')).toEqual({ state: 'locked', lines: [UNVERIFIED_LOCK_TEXT] });
  });

  it('요리가 열리기 전이나 게스트라도 비약이나 오늘의 운세가 켜져 있으면 잠금 없이 활성 카드를 낸다', () => {
    const day = gameDayOf(T0);
    const card = selectEffectCard(
      seed({ boat: 0, potions: { 'luck-small': day }, fortune: { day, kind: 'fish', index: 5 } }), T0, 'guest',
    );
    expect(card).toEqual({
      state: 'active',
      items: [
        { id: 'potion:luck-small', kind: 'potion', name: '작은 바다 영약', ratio: null },
        { id: 'fortune', kind: 'fortune', name: '만선 풍어운', ratio: null },
      ],
    });
  });

  it('요리가 열린 뒤 활성 효과가 하나도 없으면 흐린 카드(empty)를 낸다', () => {
    expect(selectEffectCard(seed(), T0, 'account')).toEqual({ state: 'empty' });
  });

  it('끝난 슬롯과 지난 날짜 비약·운세는 카드에서 빠진다', () => {
    const game = seed({
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null },
      potions: { 'luck-small': '2026-11-11' },
      fortune: { day: '2026-11-11', kind: 'gold', index: 3 },
    });
    expect(selectEffectCard(game, at(HOUR), 'account')).toEqual({ state: 'empty' });
  });

  it('도시락, 미끼(bait, bait2), 비약, 오늘의 운세 순서로 모으고 슬롯 키를 구분 유지한다', () => {
    const day = gameDayOf(T0);
    const dual = seed({
      artifacts: ['sargasso-net'],
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) },
        bait: { id: 'cook-bait-rare', endsAt: at(2 * MIN) },
        bait2: { id: 'cook-bait-epic', endsAt: at(3 * MIN) },
      },
      potions: { 'luck-small': day },
      fortune: { day, kind: 'shadow', index: 3 },
    });
    const card = selectEffectCard(dual, T0, 'account');
    expect(card.state).toBe('active');
    if (card.state !== 'active') return;
    expect(card.items.map(i => [i.id, i.kind])).toEqual([
      ['lunch', 'lunch'], ['bait', 'bait'], ['bait2', 'bait'], ['potion:luck-small', 'potion'], ['fortune', 'fortune'],
    ]);
    const afterFirst = selectEffectCard(dual, at(2 * MIN), 'account');
    if (afterFirst.state !== 'active') throw new Error('active expected');
    expect(afterFirst.items.map(i => i.id)).toEqual(['lunch', 'bait2', 'potion:luck-small', 'fortune']);
  });

  it('도시락과 미끼의 막대 비율은 남은 시간을 규칙의 전체 지속 시간으로 나눈 값이고 비약과 운세는 막대가 없다', () => {
    const lunchMs = slotDurationMs(recipeById('cook-lunch-bite')!);
    const baitMs = slotDurationMs(recipeById('cook-bait-rare')!);
    const day = gameDayOf(T0);
    const card = selectEffectCard(seed({
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(lunchMs / 2) }, bait: { id: 'cook-bait-rare', endsAt: at(baitMs) } },
      potions: { 'luck-small': day }, fortune: { day, kind: 'fish', index: 5 },
    }), T0, 'account');
    if (card.state !== 'active') throw new Error('active expected');
    expect(card.items.map(i => i.ratio)).toEqual([0.5, 1, null, null]);
  });

  it('남은 시간이 전체 지속 시간보다 길면 비율은 1로 자르고, 유물로 줄어든 미끼 지속을 전체로 쓴다', () => {
    const game = seed({
      artifacts: ['sargasso-net'],
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(100 * HOUR) }, bait: { id: 'cook-bait-rare', endsAt: at(slotDurationMs(recipeById('cook-bait-rare')!, seed({ artifacts: ['sargasso-net'] })) / 2) } },
    });
    const card = selectEffectCard(game, T0, 'account');
    if (card.state !== 'active') throw new Error('active expected');
    expect(card.items.map(i => i.ratio)).toEqual([1, 0.5]);
  });
});

describe('적용 중인 효과 창 모델', () => {
  it('selectActiveEffectsView는 비어 있는 상태와 4종 활성 효과(비약·운세 곱연산 배수 포함)를 구획별로 돌려준다', () => {
    expect(selectActiveEffectsView(seed(), T0)).toEqual({
      hasAny: false,
      lunch: [],
      bait: { slots: [], maxSlots: 1 },
      potions: [],
      fortune: null,
    });

    const day = gameDayOf(T0);
    const view = selectActiveEffectsView(seed({
      artifacts: ['sargasso-net'],
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR + 42 * MIN) },
        bait: { id: 'cook-bait-rare', endsAt: at(2 * MIN) },
        bait2: { id: 'cook-bait-epic', endsAt: at(3 * MIN) },
      },
      potions: { 'luck-small': day },
      fortune: { day, kind: 'gold', index: 3 },
    }), T0);

    expect(view.hasAny).toBe(true);
    expect(view.lunch).toHaveLength(1);
    expect(view.lunch[0].durationText).toBe('1시간 42분 남음');
    expect(view.lunch[0].description).toContain('방치');
    expect(view.bait.maxSlots).toBe(2);
    expect(view.bait.slots).toHaveLength(2);
    expect(view.potions).toEqual([{
      id: 'potion:luck-small',
      title: { name: '작은 바다 영약', grade: 'special' },
      durationText: '하루 동안',
      stats: [{ label: '모든 행운 효과', value: '×1.05' }],
    }]);
    expect(view.fortune).toEqual({
      id: 'fortune',
      title: { name: '잔돈 재물운', grade: null },
      durationText: '하루 동안',
      stats: [{ label: '판매가', value: '×1.05' }],
    });

    const grandView = selectActiveEffectsView(seed({ fortune: { day, kind: 'grand-catch', index: 5 } }), T0);
    expect(grandView.fortune).toEqual({
      id: 'fortune',
      title: { name: '만선 대길', grade: null },
      durationText: '하루 동안',
      stats: [
        { label: '희귀 이상 출현 비중', value: '×1.10' },
        { label: '판매가', value: '×1.10' },
        { label: '네임드 조우 확률', value: '×1.10' },
      ],
    });
  });
});

describe('조건부 슬롯 갱신 주기(slotPollIntervalMs)', () => {
  it('1분 미만 활성 슬롯이 있으면 1초, 없으면 5초를 돌려준다', () => {
    expect(slotPollIntervalMs(seed(), T0)).toBe(DEFAULT_POLL_MS);
    expect(slotPollIntervalMs(seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(60_000) }, bait: null } }), T0)).toBe(DEFAULT_POLL_MS);
    expect(slotPollIntervalMs(seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(59_000) }, bait: null } }), T0)).toBe(SUB_MINUTE_POLL_MS);
    expect(slotPollIntervalMs(seed({ slots: { lunch: null, bait: { id: 'cook-bait-rare', endsAt: at(-1) }, bait2: { id: 'cook-bait-epic', endsAt: at(30_000) } } }), T0)).toBe(SUB_MINUTE_POLL_MS);
    expect(slotPollIntervalMs(seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(-1_000) }, bait: null } }), T0)).toBe(DEFAULT_POLL_MS);
  });
});
