import { describe, expect, it } from 'vitest';
import type { GuildInfo, GuildMemberItem } from '../../../platform/api';
import { guildBonusOf } from '../../../game/rules/guild';
import {
  GUILD_ERROR_TEXT, bonusLines, growthBar, inviteLeftText, leaveOutcome, levelSteps, logAgoText, logLine, memberActions,
  splitMembers,
} from './guild';

const member = (uid: string, role: GuildMemberItem['role'], leftAt: string | null = null): GuildMemberItem =>
  ({ uid, nick: uid, role, joinedAt: '2026-11-05T00:00:00.000Z', leftAt, online: false, contribution: { total: 0, today: 0 } });
const guild = (role: GuildInfo['role'], members: GuildMemberItem[]): GuildInfo =>
  ({ id: 'g', name: '심해', createdAt: '2026-11-05T00:00:00.000Z', role, members, invite: null,
    growth: { level: 1, total: 0, floor: 0, next: 10_000, bonus: guildBonusOf(1) }, logbook: [] });

describe('길드 화면 모델', () => {
  const members = [member('L', 'leader'), member('A', 'member'), member('B', 'member', '2026-11-05T01:00:00.000Z')];

  it('지금 길드원과 떠난 선원을 나눈다', () => {
    const { active, departed } = splitMembers(members);
    expect(active.map(m => m.uid)).toEqual(['L', 'A']);
    expect(departed.map(m => m.uid)).toEqual(['B']);
  });

  it('길드장에게만 다른 길드원 내보내기·위임이 열리고, 떠나기는 위임이 먼저인지 알려 준다', () => {
    expect(memberActions(guild('leader', members), 'L', members[1])).toEqual({ kick: true, handover: true });
    expect(memberActions(guild('leader', members), 'L', members[0])).toEqual({ kick: false, handover: false });
    expect(memberActions(guild('member', members), 'A', members[0])).toEqual({ kick: false, handover: false });
    expect(leaveOutcome(guild('member', members), 'A')).toBe('leave');
    expect(leaveOutcome(guild('leader', members), 'L')).toBe('handover-first');
    expect(leaveOutcome(guild('leader', [members[0]]), 'L')).toBe('dissolve');
  });

  it('초대 코드가 남은 시간을 시간·분으로 알린다', () => {
    const now = Date.parse('2026-11-05T00:00:00.000Z');
    expect(inviteLeftText('2026-11-06T00:00:00.000Z', now)).toBe('24시간 남음');
    expect(inviteLeftText('2026-11-05T00:30:00.000Z', now)).toBe('30분 남음');
    expect(inviteLeftText('2026-11-04T00:00:00.000Z', now)).toBe('만료됨');
  });

  it('서버 거부 코드마다 안내 문장이 있다', () => {
    for (const code of ['bad-name', 'name-taken', 'already-in-guild', 'bad-code', 'guild-full', 'not-leader', 'handover-first', 'account-only']) {
      expect(GUILD_ERROR_TEXT[code]).toBeTruthy();
    }
  });
});

describe('길드 성장 화면 모델', () => {
  const growth = (level: number, total: number, floor: number, next: number | null) =>
    ({ level, total, floor, next, bonus: guildBonusOf(level) });

  it('진행 막대는 지금 레벨 안에서 채운 비율과 다음 레벨까지 남은 기여다. 최고 레벨은 가득 차고 남은 기여가 없다', () => {
    expect(growthBar(growth(2, 17_500, 10_000, 25_000))).toEqual({ ratio: 0.5, remaining: 7_500 });
    expect(growthBar(growth(5, 150_000, 100_000, null))).toEqual({ ratio: 1, remaining: null });
  });

  it('받는 보너스를 문장으로 보인다. 길드가 Lv1이면 없다', () => {
    expect(bonusLines(guildBonusOf(1))).toEqual([]);
    expect(bonusLines(guildBonusOf(5))).toEqual([
      '처음 보는 어종 천장이 10% 빨리 차요',
      '일반 의뢰 보상 +5%',
      '네임드 조우 천장이 10% 빨리 차요',
    ]);
  });

  it('레벨 사다리는 레벨마다 문턱과 새로 열리는 보너스를 보이고, 지나온·현재·다음·잠긴 레벨을 나눈다', () => {
    const steps = levelSteps(growth(3, 45_000, 25_000, 50_000));
    expect(steps.map(s => [s.level, s.floor, s.state])).toEqual([
      [1, 0, 'done'], [2, 10_000, 'done'], [3, 25_000, 'current'], [4, 50_000, 'next'], [5, 100_000, 'locked'],
    ]);
    expect(steps.map(s => s.perks)).toEqual([
      [],
      ['처음 보는 어종 천장이 5% 빨리 차요'],
      ['일반 의뢰 보상 +5%'],
      ['처음 보는 어종 천장이 10% 빨리 차요'],
      ['네임드 조우 천장이 10% 빨리 차요'],
    ]);
  });

  it('항해일지 한 줄을 문장으로 옮긴다', () => {
    const log = (kind: 'join' | 'leave' | 'kick' | 'legendary' | 'named', detail: string | null = null, nick: string | null = '가람') =>
      ({ id: 1, kind, uid: 'u', nick, detail, at: '2026-11-05T00:00:00.000Z' });
    expect(logLine(log('join'))).toBe('가람 님이 길드에 들어왔어요.');
    expect(logLine(log('leave'))).toBe('가람 님이 길드를 떠났어요.');
    expect(logLine(log('kick', null, null))).toBe('이름 없음 님이 길드에서 내보내졌어요.');
    expect(logLine(log('legendary', 'goldcarp'))).toBe('가람 님이 전설 황금잉어 낚시에 성공했어요!');
    expect(logLine(log('named', 'pacific-named-megalodon'))).toBe('가람 님이 네임드 메갈로돈 토벌에 성공했어요!');
  });
});

describe('항해일지 시각', () => {
  it('지난 시간을 분·시간·일로 보인다', () => {
    const now = Date.parse('2026-11-05T12:00:00Z');
    expect(logAgoText('2026-11-05T11:59:40Z', now)).toBe('방금 전');
    expect(logAgoText('2026-11-05T11:15:00Z', now)).toBe('45분 전');
    expect(logAgoText('2026-11-05T09:00:00Z', now)).toBe('3시간 전');
    expect(logAgoText('2026-11-02T12:00:00Z', now)).toBe('3일 전');
  });
});
