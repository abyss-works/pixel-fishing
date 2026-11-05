// 길드 규칙 — 이름 검사, 인원 상한, 초대 코드 형식, 권한 판정을 확인한다.
import { describe, expect, it } from 'vitest';
import {
  GUILD_INVITE_TTL_MS, GUILD_MAX_MEMBERS, checkGuildName, guildFull, handoverOutcome, inviteCode, inviteExpiresAt,
  normalizeInviteCode, removalOutcome,
} from './guild';

describe('길드 이름', () => {
  it('닉네임 규칙과 같다(한글 1~8자, 영문 2~16자, 한글·영문·숫자와 - _)', () => {
    expect(checkGuildName('바다').ok).toBe(true);
    expect(checkGuildName('가').ok).toBe(true);
    expect(checkGuildName('가나다라마바사아').ok).toBe(true);
    expect(checkGuildName('가나다라마바사아자').ok).toBe(false);
    expect(checkGuildName('a').ok).toBe(false);
    expect(checkGuildName('Deep_Sea-16chars').ok).toBe(true);
    expect(checkGuildName('바다 길드').ok).toBe(false);
    expect(checkGuildName(3).ok).toBe(false);
  });
});

describe('인원 상한', () => {
  it('지금 길드원이 10명이면 더 들어올 수 없다', () => {
    expect(GUILD_MAX_MEMBERS).toBe(10);
    expect(guildFull(9)).toBe(false);
    expect(guildFull(10)).toBe(true);
  });
});

describe('초대 코드', () => {
  it('헷갈리는 글자(0 O 1 I L)를 뺀 8자 대문자 코드를 만든다', () => {
    let i = 0;
    const code = inviteCode(n => (i++ * 7) % n);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(inviteCode(() => 0)).toBe('AAAAAAAA');
  });

  it('입력은 앞뒤 공백과 대소문자를 무시하고, 형식이 틀리면 null이다', () => {
    expect(normalizeInviteCode(' abcd2345 ')).toBe('ABCD2345');
    expect(normalizeInviteCode('ABCD234')).toBeNull();
    expect(normalizeInviteCode('ABCD234O')).toBeNull();
    expect(normalizeInviteCode(12345678)).toBeNull();
  });

  it('발급한 때부터 24시간 쓸 수 있다', () => {
    expect(GUILD_INVITE_TTL_MS).toBe(24 * 3600_000);
    expect(inviteExpiresAt('2026-11-05T00:00:00.000Z')).toBe('2026-11-06T00:00:00.000Z');
  });
});

describe('길드원 빼기', () => {
  const leader = { uid: 'L', role: 'leader' as const };
  const member = { uid: 'M', role: 'member' as const };
  const other = { uid: 'N', role: 'member' as const };

  it('길드원은 스스로 떠날 수 있다', () => {
    expect(removalOutcome(member, member, 3)).toBe('leave');
  });

  it('길드장은 다른 길드원이 있으면 먼저 위임해야 하고, 혼자면 떠나며 길드를 없앤다', () => {
    expect(removalOutcome(leader, leader, 2)).toBe('handover-first');
    expect(removalOutcome(leader, leader, 1)).toBe('dissolve');
  });

  it('다른 길드원은 길드장만 내보낼 수 있다', () => {
    expect(removalOutcome(leader, member, 3)).toBe('kick');
    expect(removalOutcome(member, other, 3)).toBe('not-leader');
    expect(removalOutcome(member, leader, 3)).toBe('not-leader');
  });
});

describe('길드장 위임', () => {
  it('길드장만 다른 길드원에게 넘길 수 있다', () => {
    expect(handoverOutcome({ uid: 'L', role: 'leader' }, 'M')).toBe('ok');
    expect(handoverOutcome({ uid: 'L', role: 'leader' }, 'L')).toBe('self');
    expect(handoverOutcome({ uid: 'M', role: 'member' }, 'N')).toBe('not-leader');
  });
});
