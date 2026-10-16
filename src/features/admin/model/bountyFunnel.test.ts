import { describe, expect, it } from 'vitest';
import { selectBountyFunnel } from './bountyFunnel';

const row = (day: string, o: Partial<Record<string, number>> = {}) => ({
  day, named_accepts: 0, tickets: 0, duels_won: 0, duels_lost: 0, named_rewards: 0,
  general_accepts: 0, general_rewards: 0, ...o,
});

describe('바운티 퍼널', () => {
  it('기간 합계와 단계 전환율을 낸다 — 흔적 중 결투까지 간 비율, 결투 승률', () => {
    const f = selectBountyFunnel([
      row('2026-10-17', { named_accepts: 2, tickets: 4, duels_won: 1, duels_lost: 2, named_rewards: 1 }),
      row('2026-10-16', { named_accepts: 1, tickets: 2, duels_won: 1, general_accepts: 3, general_rewards: 2 }),
    ]);
    expect(f.totals).toMatchObject({ named_accepts: 3, tickets: 6, duels_won: 2, duels_lost: 2, named_rewards: 1, general_accepts: 3, general_rewards: 2 });
    expect(f.duelRate).toBeCloseTo(4 / 6);      // 흔적 → 결투
    expect(f.winRate).toBeCloseTo(2 / 4);       // 결투 → 토벌
    expect(f.unresolved).toBe(2);               // 결투 없이 남거나 만료된 흔적
  });

  it('분모가 0이면 비율은 null — 0%로 오해하지 않게', () => {
    const f = selectBountyFunnel([row('2026-10-17')]);
    expect(f.duelRate).toBeNull();
    expect(f.winRate).toBeNull();
    expect(f.unresolved).toBe(0);
  });

  it('뷰 값이 문자열로 와도 숫자로 더한다', () => {
    const f = selectBountyFunnel([{ ...row('2026-10-17'), tickets: '3' as unknown as number }]);
    expect(f.totals.tickets).toBe(3);
  });
});
