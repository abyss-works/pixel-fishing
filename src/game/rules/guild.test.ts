// 길드 규칙 — 이름 검사, 인원 상한, 초대 코드 형식, 권한 판정을 확인한다.
import { describe, expect, it } from 'vitest';
import {
  GUILD_INVITE_TTL_MS, GUILD_MAX_MEMBERS, checkGuildName, guildFull, handoverOutcome, inviteCode, inviteExpiresAt,
  normalizeInviteCode, removalOutcome,
  GUILD_DAILY_FAME_CAP, GUILD_MAX_LEVEL, NO_GUILD_BONUS, contributionDayOf, contributionFor, guildBonusOf, guildLevelOf,
  guildProgress,
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

describe('길드 성장 — 레벨', () => {
  it('누적 기여도 10,000·25,000·50,000·100,000에서 Lv2~5가 되고 Lv5가 끝이다', () => {
    expect(GUILD_MAX_LEVEL).toBe(5);
    expect(guildLevelOf(0)).toBe(1);
    expect(guildLevelOf(9_999)).toBe(1);
    expect(guildLevelOf(10_000)).toBe(2);
    expect(guildLevelOf(24_999)).toBe(2);
    expect(guildLevelOf(25_000)).toBe(3);
    expect(guildLevelOf(50_000)).toBe(4);
    expect(guildLevelOf(99_999)).toBe(4);
    expect(guildLevelOf(100_000)).toBe(5);
    expect(guildLevelOf(9_000_000)).toBe(5);
  });

  it('진행도는 지금 레벨의 시작 문턱과 다음 레벨 문턱을 준다. 최대 레벨은 다음 문턱이 없다', () => {
    expect(guildProgress(0)).toEqual({ level: 1, total: 0, floor: 0, next: 10_000 });
    expect(guildProgress(45_000)).toEqual({ level: 3, total: 45_000, floor: 25_000, next: 50_000 });
    expect(guildProgress(200_000)).toEqual({ level: 5, total: 200_000, floor: 100_000, next: null });
  });
});

describe('길드 성장 — 보너스', () => {
  it('레벨이 오르면 누적된다. Lv4는 어종 천장을 10%로 바꾸고, Lv5는 네임드 천장을 더한다', () => {
    expect(guildBonusOf(1)).toEqual(NO_GUILD_BONUS);
    expect(NO_GUILD_BONUS).toEqual({ speciesPity: 0, bountyReward: 0, namedPity: 0 });
    expect(guildBonusOf(2)).toEqual({ speciesPity: 0.05, bountyReward: 0, namedPity: 0 });
    expect(guildBonusOf(3)).toEqual({ speciesPity: 0.05, bountyReward: 0.05, namedPity: 0 });
    expect(guildBonusOf(4)).toEqual({ speciesPity: 0.1, bountyReward: 0.05, namedPity: 0 });
    expect(guildBonusOf(5)).toEqual({ speciesPity: 0.1, bountyReward: 0.05, namedPity: 0.1 });
  });
});

describe('길드 성장 — 기여', () => {
  const general = { difficulty: 'easy' } as const;
  const named = { difficulty: 'named' } as const;

  it('얻은 명성만큼 쌓고, 의뢰 클리어는 일반 500·네임드 1,000을 따로 쌓는다', () => {
    expect(contributionFor(15, null)).toEqual({ fame: 15, clears: 0 });
    expect(contributionFor(0, general)).toEqual({ fame: 0, clears: 500 });
    expect(contributionFor(0, named)).toEqual({ fame: 0, clears: 1_000 });
  });

  it('명성이 줄어든 액션은 기여를 깎지 않는다', () => {
    expect(contributionFor(-50, null)).toEqual({ fame: 0, clears: 0 });
  });

  it('명성 기여의 하루 상한은 1,000이고 클리어 기여는 상한과 별개다', () => {
    expect(GUILD_DAILY_FAME_CAP).toBe(1_000);
    expect(contributionFor(5_000, named)).toEqual({ fame: 1_000, clears: 1_000 });
  });

  it('기여의 하루는 게임 날짜다(한국 시간 새벽 4시 경계)', () => {
    expect(contributionDayOf('2026-11-05T18:59:59Z')).toBe('2026-11-05'); // KST 03:59
    expect(contributionDayOf('2026-11-05T19:00:00Z')).toBe('2026-11-06'); // KST 04:00
  });
});
