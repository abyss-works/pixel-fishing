// 길드 규칙 — 이름 검사, 인원 상한, 초대 코드 형식, 권한 판정을 확인한다.
import { describe, expect, it } from 'vitest';
import {
  guildDailyContributionCaps,
  DEFAULT_GUILD_PITCH, GUILD_JOIN_REQUEST_TTL_MS, GUILD_MAX_MEMBERS, GUILD_PITCH_MAX, checkGuildName, guildCode, guildFull,
  guildLinkPath, handoverOutcome, joinOutcome, joinRequestActive, joinRequestDaysLeft, normalizeGuildCode, normalizeGuildPitch,
  parseJoinMode, removalOutcome,
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

describe('길드 고유 코드', () => {
  it('헷갈리는 글자(0 O 1 I L)를 뺀 8자 대문자 코드를 만든다', () => {
    let i = 0;
    const code = guildCode(n => (i++ * 7) % n);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(guildCode(() => 0)).toBe('AAAAAAAA');
  });

  it('입력은 앞뒤 공백과 대소문자를 무시하고, 형식이 틀리면 null이다', () => {
    expect(normalizeGuildCode(' abcd2345 ')).toBe('ABCD2345');
    expect(normalizeGuildCode('ABCD234')).toBeNull();
    expect(normalizeGuildCode('ABCD234O')).toBeNull();
    expect(normalizeGuildCode(12345678)).toBeNull();
  });

  it('초대 링크 경로는 /g/ 뒤에 코드를 붙인다', () => {
    expect(guildLinkPath('ABCD2345')).toBe('/g/ABCD2345');
  });
});

describe('가입 방식', () => {
  it('자유 가입은 바로 들어오고, 승인 가입은 신청이 되며, 닫힘은 받지 않는다', () => {
    expect(joinOutcome('open', 3)).toBe('join');
    expect(joinOutcome('approval', 3)).toBe('request');
    expect(joinOutcome('closed', 3)).toBe('closed');
  });

  it('인원이 가득 차면 자유 가입과 승인 가입 모두 받지 않는다. 닫힘은 닫힘이 먼저다', () => {
    expect(joinOutcome('open', GUILD_MAX_MEMBERS)).toBe('guild-full');
    expect(joinOutcome('approval', GUILD_MAX_MEMBERS)).toBe('guild-full');
    expect(joinOutcome('closed', GUILD_MAX_MEMBERS)).toBe('closed');
  });

  it('가입 방식 입력은 셋 가운데 하나만 받는다', () => {
    expect(parseJoinMode('open')).toBe('open');
    expect(parseJoinMode('approval')).toBe('approval');
    expect(parseJoinMode('closed')).toBe('closed');
    expect(parseJoinMode('free')).toBeNull();
    expect(parseJoinMode(1)).toBeNull();
  });
});

describe('가입 신청', () => {
  const at = '2026-11-05T00:00:00.000Z';
  it('신청한 때부터 7일 동안 남는다', () => {
    expect(GUILD_JOIN_REQUEST_TTL_MS).toBe(7 * 86_400_000);
    expect(joinRequestActive(at, '2026-11-11T23:59:59.000Z')).toBe(true);
    expect(joinRequestActive(at, '2026-11-12T00:00:00.000Z')).toBe(false);
  });

  it('남은 기간은 올림한 날 수다', () => {
    expect(joinRequestDaysLeft(at, at)).toBe(7);
    expect(joinRequestDaysLeft(at, '2026-11-05T01:00:00.000Z')).toBe(7);
    expect(joinRequestDaysLeft(at, '2026-11-11T12:00:00.000Z')).toBe(1);
    expect(joinRequestDaysLeft(at, '2026-11-12T00:00:00.000Z')).toBe(0);
  });
});

describe('권유 문구', () => {
  it('앞뒤 공백을 다듬고, 비면 기본 문구를 쓰라는 뜻으로 null이다', () => {
    expect(normalizeGuildPitch('  같이 낚시해요  ')).toEqual({ ok: true, pitch: '같이 낚시해요' });
    expect(normalizeGuildPitch('   ')).toEqual({ ok: true, pitch: null });
    expect(normalizeGuildPitch(null)).toEqual({ ok: true, pitch: null });
  });

  it('상한을 넘거나 문자열이 아니면 거부한다', () => {
    expect(normalizeGuildPitch('가'.repeat(GUILD_PITCH_MAX))).toEqual({ ok: true, pitch: '가'.repeat(GUILD_PITCH_MAX) });
    expect(normalizeGuildPitch('가'.repeat(GUILD_PITCH_MAX + 1))).toEqual({ ok: false });
    expect(normalizeGuildPitch(3)).toEqual({ ok: false });
  });

  it('기본 문구는 부드러운 권유다', () => {
    expect(DEFAULT_GUILD_PITCH).toBe('나랑 같이 낚시하자!');
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

describe('하루 기여 상한', () => {
  it('명성 기여 상한과, 의뢰 갈래마다 하루 클리어 횟수만큼의 클리어 기여', () => {
    expect(guildDailyContributionCaps()).toEqual({ fame: 2_000, general: 500, named: 1_000 });
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

  it('명성 기여의 하루 상한은 2,000이고 클리어 기여는 상한과 별개다', () => {
    expect(GUILD_DAILY_FAME_CAP).toBe(2_000);
    expect(contributionFor(5_000, named)).toEqual({ fame: 2_000, clears: 1_000 });
  });

  it('기여의 하루는 게임 날짜다(한국 시간 새벽 4시 경계)', () => {
    expect(contributionDayOf('2026-11-05T18:59:59Z')).toBe('2026-11-05'); // KST 03:59
    expect(contributionDayOf('2026-11-05T19:00:00Z')).toBe('2026-11-06'); // KST 04:00
  });
});
