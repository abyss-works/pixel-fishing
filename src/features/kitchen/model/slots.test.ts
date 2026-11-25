// 슬롯·보너스 통합 칩 모델 — 남은 시간 표기, 지금 효과, 통합 칩 표시 조건(잠금·비어 있음·활성 합산), 툴팁 내역.
import { describe, expect, it } from 'vitest';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { gameDayOf } from '../../../game/rules/time';
import { GUEST_LOCK_DEFAULT_LINES, UNVERIFIED_LOCK_TEXT } from '../../display/model/menuLock';
import { activeSlot, fmtSlotChipTime, fmtSlotTimeLeft, selectBonusChip } from './slots';

const T0 = '2026-11-12T00:00:00.000Z';
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: COOKING_UNLOCK_BOAT, ...over });

describe('슬롯 남은 시간 표기', () => {
  it('칩은 큰 단위 하나만 쓴다. 1시간 이상은 시간을 버리고 1시간 미만은 분을 올린다', () => {
    expect(fmtSlotChipTime(8 * HOUR + 12 * MIN)).toBe('8시간');
    expect(fmtSlotChipTime(9 * HOUR)).toBe('9시간');
    expect(fmtSlotChipTime(HOUR + 59 * MIN)).toBe('1시간');
    expect(fmtSlotChipTime(25 * MIN)).toBe('25분');
    expect(fmtSlotChipTime(24 * MIN + 1)).toBe('25분');
  });

  it('1분 안쪽 남은 시간은 올려서 0분으로 보이지 않고 60분은 1시간이다', () => {
    expect(fmtSlotChipTime(1)).toBe('1분');
    expect(fmtSlotChipTime(30_000)).toBe('1분');
    expect(fmtSlotChipTime(59 * MIN + 30_000)).toBe('1시간');
  });

  it('툴팁 목록은 시간과 분을 모두 쓴다', () => {
    expect(fmtSlotTimeLeft(8 * HOUR + 12 * MIN)).toBe('8시간 12분');
    expect(fmtSlotTimeLeft(9 * HOUR)).toBe('9시간');
    expect(fmtSlotTimeLeft(25 * MIN)).toBe('25분');
    expect(fmtSlotTimeLeft(8 * HOUR + 12 * MIN + 1)).toBe('8시간 13분');
  });

  it('0 이하는 0분이다', () => {
    expect(fmtSlotChipTime(0)).toBe('0분');
    expect(fmtSlotTimeLeft(-5)).toBe('0분');
  });
});

describe('슬롯의 지금 효과', () => {
  it('끝나는 시각 전의 슬롯은 요리, 남은 시간, 효과 줄을 낸다', () => {
    const game = seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(8 * HOUR + 12 * MIN) }, bait: null } });
    const s = activeSlot(game, 'lunch', T0)!;
    expect(s.label).toBe('가루디야');
    expect(s.remainingMs).toBe(8 * HOUR + 12 * MIN);
    expect(s.chipTime).toBe('8시간');
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

describe('보너스 통합 칩 표시 조건과 내역', () => {
  it('해금 전이고 활성화된 다른 효과가 없으면 잠금 칩 하나와 진행 조건 줄을 낸다', () => {
    const chip = selectBonusChip(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, 'account');
    expect(chip).toEqual({
      state: 'locked',
      lines: [
        '인도양 항로가 열리면 도시락과 미끼를 쓸 수 있어요.',
        '인도양 항로는 증기선(5단계)부터 열려요.',
      ],
    });
  });

  it('게스트는 해금 전+활성 효과 없음이면 진행 조건 잠금이고, 해금 뒤+활성 효과 없음이면 게스트 잠금이다', () => {
    expect(selectBonusChip(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, 'guest')).toEqual({
      state: 'locked',
      lines: [
        '인도양 항로가 열리면 도시락과 미끼를 쓸 수 있어요.',
        '인도양 항로는 증기선(5단계)부터 열려요.',
      ],
    });
    expect(selectBonusChip(seed({ boat: COOKING_UNLOCK_BOAT }), T0, 'guest')).toEqual({
      state: 'locked',
      lines: [...GUEST_LOCK_DEFAULT_LINES],
    });
  });

  it('확인 실패 상태이고 활성 효과가 없으면 확인 실패 잠금이 먼저다', () => {
    expect(selectBonusChip(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, 'unverified')).toEqual({
      state: 'locked',
      lines: [UNVERIFIED_LOCK_TEXT],
    });
  });

  it('요리가 열리기 전이나 게스트라도 물약이나 오늘의 운세가 켜져 있으면 통합 활성 칩을 낸다', () => {
    const day = gameDayOf(T0);
    const chip = selectBonusChip(
      seed({
        boat: 0,
        potions: { 'luck-small': day },
        fortune: { day, kind: 'fish', index: 5 },
      }),
      T0,
      'guest',
    );
    expect(chip.state).toBe('active');
    if (chip.state !== 'active') return;
    expect(chip.count).toBe(2);
    expect(chip.items.map(i => [i.id, i.kindLabel, i.title, i.summary, i.durationText])).toEqual([
      ['potion:luck-small', '물약', { name: '작은 행운 물약', grade: 'special' }, '모든 행운 효과 +5%p', '하루 동안'],
      ['fortune', '풍어운', { name: '오늘의 운세', grade: null }, '희귀 이상 출현 확률 +5%p', '하루 동안'],
    ]);
  });

  it('요리가 열린 뒤 활성 효과가 하나도 없으면 빈 통합 칩(empty)을 낸다', () => {
    expect(selectBonusChip(seed(), T0, 'account')).toEqual({ state: 'empty' });
  });

  it('끝난 슬롯과 지난 날짜 물약·운세는 통합 칩에서 빠진다', () => {
    const game = seed({
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null },
      potions: { 'luck-small': '2026-11-11' },
      fortune: { day: '2026-11-11', kind: 'gold', index: 3 },
    });
    expect(selectBonusChip(game, at(HOUR), 'account')).toEqual({ state: 'empty' });
  });

  it('도시락, 다중 미끼(bait, bait2), 물약, 오늘의 운세를 모두 한 통합 목록으로 묶고 slotKey를 구분 유지한다', () => {
    const day = gameDayOf(T0);
    const dual = seed({
      artifacts: ['sargasso-net'],
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR + 42 * MIN) },
        bait: { id: 'cook-bait-rare', endsAt: at(2 * MIN) },
        bait2: { id: 'cook-bait-epic', endsAt: at(3 * MIN) },
      },
      potions: { 'luck-small': day },
      fortune: { day, kind: 'shadow', index: 3 },
    });
    const chip = selectBonusChip(dual, T0, 'account');
    expect(chip.state).toBe('active');
    if (chip.state !== 'active') return;
    expect(chip.count).toBe(5);
    expect(chip.items.map(i => [i.id, i.kind, i.title.name, i.durationText])).toEqual([
      ['lunch', 'lunch', '가루디야', '1시간 42분 남음'],
      ['bait', 'bait', '롱페퍼 미끼', '2분 남음'],
      ['bait2', 'bait', '큐베브 미끼', '3분 남음'],
      ['potion:luck-small', 'potion', '작은 행운 물약', '하루 동안'],
      ['fortune', 'fortune', '오늘의 운세', '하루 동안'],
    ]);

    // bait 만료 후 bait2는 id 'bait2'로 그대로 남는다
    const afterFirst = selectBonusChip(dual, at(2 * MIN), 'account');
    expect(afterFirst.state).toBe('active');
    if (afterFirst.state !== 'active') return;
    expect(afterFirst.items.map(i => i.id)).toEqual(['lunch', 'bait2', 'potion:luck-small', 'fortune']);
  });
});
