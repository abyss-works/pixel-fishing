import { describe, expect, it } from 'vitest';
import { FISH } from '../../../game/content/fish';
import { NAMED } from '../../../game/content/named';
import {
  defaultRankingWindow,
  formatRankingValue,
  formatRankingWeekLabel,
  isPeriodRankingBoard,
  pinnedMyRank,
  RANKING_GROUPS,
  RANKING_TABS,
  rankingGroupOf,
  rankingTabMeta,
} from './ranking';

const row = (rank: number, me = false) => ({ rank, nickname: `p${rank}`, value: 100 - rank, me });

describe('pinnedMyRank', () => {
  it('내가 상위 목록 안에 있든 밖에 있든 me가 있으면 항상 돌려준다', () => {
    expect(pinnedMyRank({ top: [row(1), row(2)], me: { rank: 57, value: 10 } })).toEqual({ rank: 57, value: 10 });
    expect(pinnedMyRank({ top: [row(1), row(2, true)], me: { rank: 2, value: 98 } })).toEqual({ rank: 2, value: 98 });
  });

  it('순위가 없으면 null이다', () => {
    expect(pinnedMyRank({ top: [row(1)], me: null })).toBeNull();
  });
});

describe('isPeriodRankingBoard & defaultRankingWindow', () => {
  it('명성·판매골드·네임드 토벌만 주간 기간을 지원하고 기본값은 weekly다', () => {
    expect(isPeriodRankingBoard('fame')).toBe(true);
    expect(isPeriodRankingBoard('sellGold')).toBe(true);
    expect(isPeriodRankingBoard('namedClears')).toBe(true);
    expect(defaultRankingWindow('fame')).toBe('weekly');
    expect(defaultRankingWindow('sellGold')).toBe('weekly');
    expect(defaultRankingWindow('namedClears')).toBe('weekly');

    for (const board of ['dex', 'variant', 'named', 'species'] as const) {
      expect(isPeriodRankingBoard(board)).toBe(false);
      expect(defaultRankingWindow(board)).toBe('all');
    }
  });
});

describe('RANKING_TABS & formatRankingValue & RANKING_GROUPS', () => {
  it('그룹과 세부 보드 정의가 명세 순서와 라벨을 따른다', () => {
    expect(RANKING_GROUPS.map(g => [g.key, g.label, g.boards])).toEqual([
      ['ranking', '랭킹', ['fame', 'sellGold', 'namedClears']],
      ['dex', '도감', ['dex', 'variant', 'named']],
    ]);
    expect(rankingGroupOf('sellGold')).toBe('ranking');
    expect(rankingGroupOf('variant')).toBe('dex');
    expect(RANKING_TABS.map(t => [t.key, t.label])).toEqual([
      ['fame', '명성'],
      ['sellGold', '판매골드'],
      ['namedClears', '네임드 토벌'],
      ['dex', '일반'],
      ['variant', '돌연변이'],
      ['named', '네임드'],
    ]);
    expect(rankingTabMeta('namedClears').valueLabel).toBe('토벌 횟수');
    expect(rankingTabMeta('sellGold').valueLabel).toBe('판매 골드');
  });

  it('보드별 점수와 주간 라벨을 단위에 맞게 포맷한다', () => {
    expect(formatRankingValue('fame', 1200)).toBe('1,200');
    expect(formatRankingValue('sellGold', 1200)).toBe('1,200G');
    expect(formatRankingValue('dex', 42)).toBe(`42 / ${FISH.length} (${Math.round((42 / FISH.length) * 100)}%)`);
    expect(formatRankingValue('variant', 10)).toBe(`10 / ${FISH.length} (${Math.round((10 / FISH.length) * 100)}%)`);
    expect(formatRankingValue('named', 3)).toBe(`3 / ${NAMED.length} (${Math.round((3 / NAMED.length) * 100)}%)`);
    expect(formatRankingValue('namedClears', 15)).toBe('15회');
    expect(formatRankingWeekLabel('2026-11-23', '2026-11-23')).toBe('이번 주 (11월 23일 ~)');
    expect(formatRankingWeekLabel('2026-11-16', '2026-11-23')).toBe('11월 16일 ~ 11월 22일');
  });
});
