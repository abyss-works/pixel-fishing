import { describe, expect, it } from 'vitest';
import type { GuildInfo, GuildMemberItem } from '../../../platform/api';
import { GUILD_ERROR_TEXT, inviteLeftText, leaveOutcome, memberActions, splitMembers } from './guild';

const member = (uid: string, role: GuildMemberItem['role'], leftAt: string | null = null): GuildMemberItem =>
  ({ uid, nick: uid, role, joinedAt: '2026-11-05T00:00:00.000Z', leftAt, online: false });
const guild = (role: GuildInfo['role'], members: GuildMemberItem[]): GuildInfo =>
  ({ id: 'g', name: '심해', createdAt: '2026-11-05T00:00:00.000Z', role, members, invite: null });

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
