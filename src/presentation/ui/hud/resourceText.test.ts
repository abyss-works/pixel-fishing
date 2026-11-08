import { describe, expect, it } from 'vitest';
import { newState } from '../../../game/rules/logic';
import { resourceText } from './resourceText';

const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
  caughtAt: null, spot: null, judgment: null, locked: false });

describe('자원 바 문구', () => {
  it('칸마다 툴팁 문구는 이름과 정확한 값이다', () => {
    const game = { ...newState(), gold: 1_234_567, fame: 999_999, boat: 2, rod: 7, bag: Array.from({ length: 1000 }, (_, i) => fish(i)) };
    const t = resourceText({ ...game, boat: 3 }, 5);
    expect(t.gold).toBe('골드 1,234,567');
    expect(t.fame).toBe('명성 999,999');
    expect(t.boat).toBe('배 정크선');
    expect(t.rod).toBe('낚싯대 Lv.7');
    expect(t.bag).toBe('가방 1,000 / 3,000 (33%)');
  });

  it('배 칸 값은 이름 대신 낚싯대 칸과 같은 Lv.<티어> 형식이다', () => {
    expect(resourceText({ ...newState(), boat: 3, rod: 12 }).boatValue).toBe('Lv.3');
    expect(resourceText({ ...newState(), boat: 3, rod: 12 }).rodValue).toBe('Lv.12');
    expect(resourceText({ ...newState(), boat: 0 }).boatValue).toBe('Lv.0');
  });

  it('맨발이면 배 툴팁은 배 없음이다', () => {
    expect(resourceText({ ...newState(), boat: 0 }).boat).toBe('배 없음');
  });

  it('접근성 이름 요약은 다섯 칸을 순서대로 싣는다', () => {
    const t = resourceText({ ...newState(), gold: 5, fame: 6, boat: 1, rod: 2 });
    expect(t.summary).toBe('골드 5, 명성 6, 배 조각배, 낚싯대 Lv.2, 가방 0 / 140 (0%)');
  });
});
