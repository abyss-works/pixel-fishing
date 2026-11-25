import { describe, expect, it } from 'vitest';
import { FISH } from '../../../game/content/fish';
import { NAMED } from '../../../game/content/named';
import { formatRankingValue, pinnedMyRank, RANKING_TABS, rankingTabMeta } from './ranking';

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

describe('RANKING_TABS & formatRankingValue', () => {
  it('상단 5탭 정의가 명세 순서와 라벨을 따른다', () => {
    expect(RANKING_TABS.map(t => [t.key, t.label])).toEqual([
      ['fame', '명성'],
      ['dex', '도감(일반)'],
      ['variant', '도감(돌연변이)'],
      ['named', '도감(네임드)'],
      ['namedClears', '네임드 토벌'],
    ]);
    expect(rankingTabMeta('namedClears').valueLabel).toBe('토벌 횟수');
  });

  it('보드별 점수를 단위에 맞게 포맷한다', () => {
    expect(formatRankingValue('fame', 1200)).toBe('1,200');
    expect(formatRankingValue('dex', 42)).toBe(`42 / ${FISH.length} (${Math.round((42 / FISH.length) * 100)}%)`);
    expect(formatRankingValue('variant', 10)).toBe(`10 / ${FISH.length} (${Math.round((10 / FISH.length) * 100)}%)`);
    expect(formatRankingValue('named', 3)).toBe(`3 / ${NAMED.length} (${Math.round((3 / NAMED.length) * 100)}%)`);
    expect(formatRankingValue('namedClears', 15)).toBe('15회');
  });
});
