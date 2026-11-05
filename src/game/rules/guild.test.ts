// 길드 규칙 — 이름 검사, 인원 상한, 초대 코드 형식, 권한 판정을 확인한다.
import { describe, expect, it } from 'vitest';
import {
  GUILD_INVITE_TTL_MS, GUILD_MAX_MEMBERS, checkGuildName, guildFull, handoverOutcome, inviteCode, inviteExpiresAt,
  normalizeInviteCode, removalOutcome,
  GUILD_DAILY_FAME_CAP, GUILD_MAX_LEVEL, contributionDayOf, contributionFor, guildLevelOf, guildProgress,
  GUILD_BONUS_IDS, NO_GUILD_EFFECTS, applyDonation, bonusEffect, bonusRank, bonusRankCost, donationOutcome, guildBonusLevels,
  guildEffectsOf, validDonationAmount,
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

describe('길드 보너스 — 해금과 단계 상한', () => {
  it('다섯 보너스가 Lv1~5에 하나씩 열리고, 단계 상한은 길드 레벨이다. 열리지 않은 보너스는 상한 0이다', () => {
    expect(GUILD_BONUS_IDS).toEqual(['sell', 'bag', 'named', 'rare', 'mutation']);
    expect(guildBonusLevels(1)).toEqual([
      { id: 'sell', unlock: 1, cap: 1 }, { id: 'bag', unlock: 2, cap: 0 }, { id: 'named', unlock: 3, cap: 0 },
      { id: 'rare', unlock: 4, cap: 0 }, { id: 'mutation', unlock: 5, cap: 0 },
    ]);
    expect(guildBonusLevels(3).map(b => b.cap)).toEqual([3, 3, 3, 0, 0]);
    expect(guildBonusLevels(5).map(b => b.cap)).toEqual([5, 5, 5, 5, 5]);
  });

  it('1단계는 레벨 도달로 비용 없이 열린다. 2~5단계 비용은 15만 · 50만 · 150만 · 500만 골드다', () => {
    expect([2, 3, 4, 5].map(bonusRankCost)).toEqual([150_000, 500_000, 1_500_000, 5_000_000]);
    expect(bonusRankCost(1)).toBeNull();
    expect(bonusRankCost(6)).toBeNull();
  });

  it('지금 단계 — 열린 보너스는 기부가 없어도 1단계다. 열리지 않았으면 0단계다', () => {
    expect(bonusRank('sell', 1, 0)).toBe(1);
    expect(bonusRank('sell', 3, 2)).toBe(2);
    expect(bonusRank('bag', 1, 0)).toBe(0);
    expect(bonusRank('mutation', 5, 0)).toBe(1);
  });
});

describe('길드 보너스 — 기부', () => {
  it('모인 골드가 다음 단계 비용에 닿으면 단계가 오르고 남은 골드는 이어진다', () => {
    expect(applyDonation(0, 1, 5, 100_000)).toEqual({ rank: 1, pool: 100_000, accepted: 100_000 });
    expect(applyDonation(100_000, 1, 5, 100_000)).toEqual({ rank: 2, pool: 50_000, accepted: 100_000 });
  });

  it('한 번에 여러 단계가 오를 수 있다', () => {
    expect(applyDonation(0, 1, 5, 700_000)).toEqual({ rank: 3, pool: 50_000, accepted: 700_000 });
  });

  it('상한을 넘는 골드는 받지 않는다 — 상한 단계까지 필요한 만큼만 받는다', () => {
    expect(applyDonation(50_000, 1, 3, 5_000_000)).toEqual({ rank: 3, pool: 0, accepted: 600_000 });
    expect(applyDonation(0, 3, 3, 1_000)).toEqual({ rank: 3, pool: 0, accepted: 0 });
  });

  it('판정 — 열리지 않았으면 bonus-locked, 상한이면 rank-maxed, 받을 골드보다 가진 골드가 적으면 not-enough-gold', () => {
    expect(donationOutcome('bag', 1, { rank: 0, pool: 0 }, 1e9, 1_000)).toEqual({ ok: false, error: 'bonus-locked' });
    // Lv1 판매가는 비용 없이 1단계이고 상한도 1이라 기부할 곳이 없다
    expect(donationOutcome('sell', 1, { rank: 0, pool: 0 }, 1e9, 1_000)).toEqual({ ok: false, error: 'rank-maxed' });
    expect(donationOutcome('sell', 3, { rank: 0, pool: 0 }, 999, 1_000)).toEqual({ ok: false, error: 'not-enough-gold' });
    // 처음 기부도 1단계 위(2단계 비용)부터 모은다. 상한까지 필요한 골드만 받으므로 요청액보다 적게 가져도 된다
    expect(donationOutcome('sell', 2, { rank: 0, pool: 140_000 }, 10_000, 50_000))
      .toEqual({ ok: true, rank: 2, pool: 0, accepted: 10_000 });
  });

  it('기부액은 1 이상의 정수 골드다', () => {
    expect(validDonationAmount(1)).toBe(true);
    expect(validDonationAmount(100_000)).toBe(true);
    for (const v of [0, -1, 1.5, '100', null, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) expect(validDonationAmount(v)).toBe(false);
  });
});

describe('길드 보너스 — 효과(합연산)', () => {
  it('단계당 효과 — 판매가 +2%, 가방 +4%, 네임드 조우 +5%, 일반 가중치 −2%, 돌연변이 +1%p', () => {
    expect([1, 5].map(r => bonusEffect('sell', r))).toEqual([0.02, 0.1]);
    expect([1, 5].map(r => bonusEffect('bag', r))).toEqual([0.04, 0.2]);
    expect([1, 5].map(r => bonusEffect('named', r))).toEqual([0.05, 0.25]);
    expect([1, 5].map(r => bonusEffect('rare', r))).toEqual([0.02, 0.1]);
    expect([1, 5].map(r => bonusEffect('mutation', r))).toEqual([0.01, 0.05]);
  });

  it('효과는 단계 효과를 더한 값 하나다 — 단계마다 곱하지 않는다', () => {
    expect(bonusEffect('sell', 3)).toBe(0.06);
    expect(bonusEffect('rare', 5)).toBe(0.1); // 0.98^5가 아니다
    expect(NO_GUILD_EFFECTS).toEqual({ sell: 0, bag: 0, named: 0, rare: 0, mutation: 0 });
  });

  it('길드 효과는 레벨로 열린 1단계와 기부로 오른 단계 중 높은 단계로 정한다', () => {
    expect(guildEffectsOf(3, { sell: 3, bag: 2 })).toEqual({ sell: 0.06, bag: 0.08, named: 0.05, rare: 0, mutation: 0 });
    expect(guildEffectsOf(1, {})).toEqual({ sell: 0.02, bag: 0, named: 0, rare: 0, mutation: 0 });
    expect(guildEffectsOf(5, {})).toEqual({ sell: 0.02, bag: 0.04, named: 0.05, rare: 0.02, mutation: 0.01 });
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
