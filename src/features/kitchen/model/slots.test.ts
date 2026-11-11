// 슬롯 칩 모델 — 남은 시간 표기, 칩 표시 조건(해금 전 잠금, 해금 뒤 효과가 든 슬롯만), 칩 툴팁 내용.
import { describe, expect, it } from 'vitest';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { GUEST_LOCK_TEXT } from '../../display/model/menuLock';
import { activeSlot, fmtSlotClock, selectSlotChips } from './slots';

const T0 = '2026-11-12T00:00:00.000Z';
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: COOKING_UNLOCK_BOAT, ...over });

describe('슬롯 남은 시간 표기', () => {
  it('시:분 꼴이고 분은 두 자리다', () => {
    expect(fmtSlotClock(8 * HOUR + 12 * MIN)).toBe('8:12');
    expect(fmtSlotClock(9 * HOUR)).toBe('9:00');
    expect(fmtSlotClock(24 * MIN)).toBe('0:24');
    expect(fmtSlotClock(5 * MIN)).toBe('0:05');
  });

  it('1분 안쪽 남은 시간은 올려서 0:00으로 보이지 않는다', () => {
    expect(fmtSlotClock(1)).toBe('0:01');
    expect(fmtSlotClock(30_000)).toBe('0:01');
    expect(fmtSlotClock(8 * HOUR + 12 * MIN + 1)).toBe('8:13');
  });

  it('0 이하는 0:00이다', () => {
    expect(fmtSlotClock(0)).toBe('0:00');
    expect(fmtSlotClock(-5)).toBe('0:00');
  });
});

describe('슬롯의 지금 효과', () => {
  it('끝나는 시각 전의 슬롯은 요리, 남은 시간, 효과 줄을 낸다', () => {
    const game = seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(8 * HOUR + 12 * MIN) }, bait: null } });
    const s = activeSlot(game, 'lunch', T0)!;
    expect(s.label).toBe('가루디야');
    expect(s.remainingMs).toBe(8 * HOUR + 12 * MIN);
    expect(s.clock).toBe('8:12');
    expect(s.effects).toEqual([{ label: '입질 대기', value: '−10%' }]);
  });

  it('끝나는 시각이 지났거나 같은 슬롯은 효과가 없다', () => {
    const slots = { lunch: { id: 'cook-lunch-bite', endsAt: at(0) }, bait: { id: 'cook-bait-judge', endsAt: at(-1) } };
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
});

describe('슬롯 칩 표시 조건', () => {
  it('해금 전에는 두 슬롯 모두 잠금 칩이고 진행 조건 줄을 낸다', () => {
    const chips = selectSlotChips(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, false);
    expect(chips.map(c => [c.key, c.state])).toEqual([['lunch', 'locked'], ['bait', 'locked']]);
    const lunch = chips[0];
    expect(lunch.state === 'locked' && lunch.lines).toEqual([
      '인도양 항로가 열리면 도시락 슬롯을 쓸 수 있어요.',
      '인도양 항로는 증기선(5단계)부터 열려요.',
    ]);
    const bait = chips[1];
    expect(bait.state === 'locked' && bait.lines[0]).toBe('인도양 항로가 열리면 미끼 슬롯을 쓸 수 있어요.');
  });

  it('게스트는 해금 전이어도 게스트 잠금이 먼저다', () => {
    const chips = selectSlotChips(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), T0, true);
    expect(chips.every(c => c.state === 'locked' && c.lines.join() === GUEST_LOCK_TEXT)).toBe(true);
  });

  it('해금 뒤에는 효과가 든 슬롯의 칩만 낸다. 순서는 도시락, 미끼다', () => {
    const both = seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: { id: 'cook-bait-judge', endsAt: at(MIN) } } });
    expect(selectSlotChips(both, T0, false).map(c => [c.key, c.state])).toEqual([['lunch', 'active'], ['bait', 'active']]);
    const lunchOnly = seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null } });
    expect(selectSlotChips(lunchOnly, T0, false).map(c => c.key)).toEqual(['lunch']);
    const baitOnly = seed({ slots: { lunch: null, bait: { id: 'cook-bait-judge', endsAt: at(HOUR) } } });
    expect(selectSlotChips(baitOnly, T0, false).map(c => c.key)).toEqual(['bait']);
  });

  it('해금 뒤 두 슬롯이 모두 비면 칩이 없다', () => {
    expect(selectSlotChips(seed(), T0, false)).toEqual([]);
  });

  it('끝난 슬롯은 칩에서 사라진다', () => {
    const game = seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null } });
    expect(selectSlotChips(game, at(HOUR), false)).toEqual([]);
  });

  it('지금 효과의 설명은 그 슬롯 종류의 적용 낚시와 지속 안내를 담는다', () => {
    const game = seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: { id: 'cook-bait-judge', endsAt: at(HOUR) } } });
    const [lunch, bait] = selectSlotChips(game, T0, false);
    expect(lunch.state === 'active' && lunch.note).toContain('방치 낚시에만 효과가 있어요.');
    expect(bait.state === 'active' && bait.note).toContain('챔질해서 낚을 때만 효과가 있어요.');
  });
});
