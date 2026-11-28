import { describe, expect, it } from 'vitest';
import { NO_GUILD_EFFECTS } from '../../../game/rules/guild';
import type { GuildInfo } from '../../guild/model/guild';
import { menuGroups, menuKeys, menuMarks, menuMarkName } from './menuEntries';
import type { RewardLine } from './rewardsDue';

describe('메뉴 줄 항목 순서 및 그룹', () => {
  it('상태(운세·랭킹), 활동(업적·의뢰), 소통(길드·친구·우편함) 순서이고 운세·업적·의뢰는 늘 있다', () => {
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

const line = (window: RewardLine['window']): RewardLine =>
  ({ key: window, window, windowName: '', text: '', tip: ['', ''], count: 1 });
describe('메뉴 표식', () => {
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

  const base = { lines: [] as RewardLine[], friendRequests: 0, guild: null, accountState: 'account' as const };

  it('알릴 것이 없으면 표식이 없다', () => {
    expect(menuMarks(base)).toEqual({ items: {}, button: null });
  });

  it('받을 보상이 있는 의뢰와 업적 줄은 금색 테두리, 메뉴 버튼은 금색 점이다', () => {
    expect(menuMarks({ ...base, lines: [line('quests')] })).toEqual({ items: { quests: 'reward' }, button: 'accent' });
    expect(menuMarks({ ...base, lines: [line('achievements')] })).toEqual({ items: { achievements: 'reward' }, button: 'accent' });
  });

  it('읽지 않은 우편은 우편함 줄과 메뉴 버튼에 빨간 점이다', () => {
    expect(menuMarks({ ...base, lines: [line('mailbox')] })).toEqual({ items: { mailbox: 'mail' }, button: 'mail' });
  });

  it('금색 점과 빨간 점이 함께 켜질 상태이면 메뉴 버튼은 빨간 점만 보이고 줄 표식은 그대로다', () => {
    expect(menuMarks({ ...base, lines: [line('quests'), line('mailbox')] }))
      .toEqual({ items: { quests: 'reward', mailbox: 'mail' }, button: 'mail' });
  });

  it('받은 친구 요청은 친구 줄과 메뉴 버튼에 금색 점이다', () => {
    expect(menuMarks({ ...base, friendRequests: 2 })).toEqual({ items: { friends: 'accent' }, button: 'accent' });
  });

  it('길드장의 대기 가입 신청은 길드 줄과 메뉴 버튼에 금색 점이다', () => {
    const g = makeGuild({ requests: [{ uid: 'r1', nick: '산호', requestedAt: '2026-11-05T00:00:00.000Z' }] });
    expect(menuMarks({ ...base, guild: g })).toEqual({ items: { guild: 'accent' }, button: 'accent' });
  });

  it('일반 길드원의 대기 신청은 표식이 없다', () => {
    const g = makeGuild({ role: 'member', requests: [{ uid: 'r1', nick: '산호', requestedAt: '2026-11-05T00:00:00.000Z' }] });
    expect(menuMarks({ ...base, guild: g })).toEqual({ items: {}, button: null });
  });

  it('남은 개인 강화 포인트는 길드 줄에만 금색 점이고 메뉴 버튼은 켜지 않는다', () => {
    const g = makeGuild({
      growth: { level: 8, total: 550_000, floor: 550_000, next: 800_000 },
      bonuses: [
        { id: 'sell', unlock: 1, rank: 5, enhanceRank: 1, totalRank: 6, cap: 5, pool: 0, next: null, effect: 0.12, nextEffect: 0.14, mine: 0 },
      ],
    });
    expect(menuMarks({ ...base, guild: g })).toEqual({ items: { guild: 'accent' }, button: null });
  });

  it('잠긴 줄(게스트, 확인 실패)은 친구와 길드 표식을 켜지 않는다', () => {
    const g = makeGuild({ requests: [{ uid: 'r1', nick: '산호', requestedAt: '2026-11-05T00:00:00.000Z' }] });
    expect(menuMarks({ ...base, friendRequests: 1, guild: g, accountState: 'guest' }))
      .toEqual({ items: {}, button: null });
  });

  it('접근성 이름은 표식이 있을 때 줄 이름 뒤에 상태를 싣는다', () => {
    expect(menuMarkName('의뢰', 'reward')).toBe('의뢰, 받을 보상 있음');
    expect(menuMarkName('우편함', 'mail')).toBe('우편함, 읽지 않은 우편 있음');
    expect(menuMarkName('친구', 'accent')).toBe('친구, 새 알림 있음');
    expect(menuMarkName('운세', undefined)).toBe('운세');
  });
});
