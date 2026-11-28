import { describe, expect, it } from 'vitest';
import { NO_GUILD_EFFECTS } from '../../../game/rules/guild';
import type { GuildInfo } from '../../guild/model/guild';
import { guildMenuBadges, guildMenuLabel, menuGroups, menuKeys, questBadges, questMenuLabel } from './menuEntries';

describe('메뉴 줄 항목 순서 및 그룹', () => {
  it('상태(운세·랭킹), 활동(업적·의뢰), 소통(길드·소셜·우편함) 순서이고 운세·업적·의뢰는 늘 있다', () => {
    expect(menuKeys({ ranking: true, guild: true, friends: true, mailbox: true }))
      .toEqual(['fortune', 'ranking', 'achievements', 'quests', 'guild', 'friends', 'mailbox']);
    expect(menuKeys({ ranking: false, guild: false, friends: false, mailbox: false }))
      .toEqual(['fortune', 'achievements', 'quests']);
    expect(menuGroups({ ranking: true, guild: true, friends: true, mailbox: true })).toEqual([
      { key: 'status', label: '상태', keys: ['fortune', 'ranking'] },
      { key: 'activity', label: '활동', keys: ['achievements', 'quests'] },
      { key: 'social', label: '소통', keys: ['guild', 'friends', 'mailbox'] },
    ]);
  });

  it('열 수 없는 입구는 빠지고 나머지 순서는 그대로다', () => {
    expect(menuKeys({ guild: false, friends: true, mailbox: true }))
      .toEqual(['fortune', 'achievements', 'quests', 'friends', 'mailbox']);
    expect(menuKeys({ ranking: true, guild: true, friends: false, mailbox: true }))
      .toEqual(['fortune', 'ranking', 'achievements', 'quests', 'guild', 'mailbox']);
  });
});

describe('의뢰 줄 배지', () => {
  it('일반은 노랑(gold), 네임드는 네임드(named)이고 오늘 남은 횟수를 그대로 쓴다', () => {
    expect(questBadges({ general: 3, named: 1 })).toEqual([
      { tone: 'gold', count: 3 }, { tone: 'named', count: 1 },
    ]);
  });

  it('남은 횟수가 0인 종류의 배지는 그리지 않는다', () => {
    expect(questBadges({ general: 0, named: 1 })).toEqual([{ tone: 'named', count: 1 }]);
    expect(questBadges({ general: 2, named: 0 })).toEqual([{ tone: 'gold', count: 2 }]);
    expect(questBadges({ general: 0, named: 0 })).toEqual([]);
  });

  it('남은 횟수를 모르면(불러오는 중, 오프라인) 배지가 없다', () => {
    expect(questBadges(null)).toEqual([]);
  });

  it('접근성 이름은 배지가 있을 때만 남은 클리어를 싣는다', () => {
    expect(questMenuLabel({ general: 3, named: 0 })).toBe('의뢰, 오늘 남은 클리어 일반 3');
    expect(questMenuLabel({ general: 3, named: 1 })).toBe('의뢰, 오늘 남은 클리어 일반 3 네임드 1');
    expect(questMenuLabel({ general: 0, named: 0 })).toBe('의뢰');
    expect(questMenuLabel(null)).toBe('의뢰');
  });
});

describe('길드 줄 배지', () => {
  const makeGuild = (over: Partial<GuildInfo> = {}): GuildInfo => ({
    id: 'g1',
    name: '새벽선단',
    createdAt: '2026-11-05T00:00:00.000Z',
    role: 'leader',
    renamedAt: null,
    code: 'ABCD2345',
    joinMode: 'approval',
    pitch: null,
    requests: [],
    members: [],
    growth: { level: 5, total: 100_000, floor: 100_000, next: 200_000 },
    bonuses: [
      { id: 'sell', unlock: 1, rank: 1, enhanceRank: 0, totalRank: 1, cap: 5, pool: 0, next: 150_000, effect: 0.02, nextEffect: 0.04, mine: 0 },
    ],
    effects: NO_GUILD_EFFECTS,
    enhanceResetCount: 0,
    donors: [],
    logbook: [],
    ...over,
  });

  it('길드 정보 없으면 배지가 없다', () => {
    expect(guildMenuBadges(null)).toEqual([]);
    expect(guildMenuLabel(null)).toBe('길드');
  });

  it('길드장에게 대기 중인 가입 신청이 있으면 danger 배지를 표시한다', () => {
    const g = makeGuild({
      requests: [{ uid: 'r1', nick: '산호', requestedAt: '2026-11-05T00:00:00.000Z' }],
    });
    expect(guildMenuBadges(g)).toEqual([{ tone: 'danger', count: 1 }]);
    expect(guildMenuLabel(g)).toBe('길드, 가입 신청 1건');
  });

  it('일반 길드원은 대기 신청 배지를 보지 않는다', () => {
    const g = makeGuild({
      role: 'member',
      requests: [{ uid: 'r1', nick: '산호', requestedAt: '2026-11-05T00:00:00.000Z' }],
    });
    expect(guildMenuBadges(g)).toEqual([]);
    expect(guildMenuLabel(g)).toBe('길드');
  });

  it('Lv.6 이상에서 남은 개인 강화 포인트가 있으면 guild 배지를 함께 표시한다', () => {
    const g = makeGuild({
      growth: { level: 8, total: 550_000, floor: 550_000, next: 800_000 },
      requests: [
        { uid: 'r1', nick: '산호', requestedAt: '2026-11-05T00:00:00.000Z' },
        { uid: 'r2', nick: '별빛', requestedAt: '2026-11-05T00:00:00.000Z' },
      ],
      bonuses: [
        { id: 'sell', unlock: 1, rank: 5, enhanceRank: 1, totalRank: 6, cap: 5, pool: 0, next: null, effect: 0.12, nextEffect: 0.14, mine: 0 },
      ],
    });
    expect(guildMenuBadges(g)).toEqual([
      { tone: 'danger', count: 2 },
      { tone: 'guild', count: 2 },
    ]);
    expect(guildMenuLabel(g)).toBe('길드, 가입 신청 2건, 개인 강화 포인트 2개');
  });
});
