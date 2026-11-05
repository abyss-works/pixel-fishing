import { describe, expect, it } from 'vitest';
import { pinnedMyRank } from './ranking';

const row = (rank: number, me = false) => ({ rank, nickname: `p${rank}`, value: 100 - rank, me });

describe('pinnedMyRank', () => {
  it('내가 상위 목록 밖이면 내 순위를 돌려준다', () => {
    expect(pinnedMyRank({ top: [row(1), row(2)], me: { rank: 57, value: 10 } })).toEqual({ rank: 57, value: 10 });
  });

  it('내가 상위 목록 안에 있거나 순위가 없으면 null이다', () => {
    expect(pinnedMyRank({ top: [row(1), row(2, true)], me: { rank: 2, value: 98 } })).toBeNull();
    expect(pinnedMyRank({ top: [row(1)], me: null })).toBeNull();
  });
});
