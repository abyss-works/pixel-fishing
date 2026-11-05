// 길드 규칙 — 서버와 클라이언트가 공유하는 순수 판정이다. 이름 검사, 인원 상한, 초대 코드, 길드원 권한,
// 성장(기여도·레벨)과 보너스(해금·단계·기부·효과)를 맡는다.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { checkNickname } from './nickname.js';
import type { RuleCheck } from './rules.js';
import { gameDayOf } from './time.js';
import { bountyKindOf } from '../content/bounties.js';
import { bountyDailyCap } from './balance.js';
import type { BountyQuest } from '../content/bounties.js';

export type GuildRole = 'leader' | 'member';

/** 판정에 쓰는 길드원 — 지금 길드에 있는 사람이다 */
export interface GuildActor { uid: string; role: GuildRole }

/** 길드 하나의 최대 인원 */
export const GUILD_MAX_MEMBERS = 10;

/** 초대 코드를 쓸 수 있는 시간. 다시 발급하면 이전 코드는 사라진다 */
export const GUILD_INVITE_TTL_MS = 24 * 3600_000;

// 읽고 옮겨 적기 쉽게 헷갈리는 글자(0 O 1 I L)를 뺀 대문자·숫자
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** 길드 이름 — 닉네임 규칙과 같다(한글 1~8자, 영문 2~16자, 한글·영문·숫자와 - _). 대소문자 무시 중복은 저장소가 막는다 */
export function checkGuildName(v: unknown): RuleCheck {
  return checkNickname(v);
}

/** 지금 길드원 수로 더 들어올 수 없는가 */
export function guildFull(activeCount: number): boolean {
  return activeCount >= GUILD_MAX_MEMBERS;
}

/**
 * 새 초대 코드.
 * @param randomIndex 0 이상 n 미만의 정수를 고르는 난수(서버는 암호학적 난수를 넘긴다)
 */
export function inviteCode(randomIndex: (n: number) => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return code;
}

/** 입력한 초대 코드를 저장 형식으로. 앞뒤 공백과 대소문자를 무시하고, 형식이 틀리면 null이다 */
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** 지금 발급한 초대 코드의 만료 시각 */
export function inviteExpiresAt(nowISO: string): string {
  return new Date(Date.parse(nowISO) + GUILD_INVITE_TTL_MS).toISOString();
}

/**
 * 길드원 한 사람을 길드에서 뺄 때의 결과.
 * 자기 자신이면 떠나기다. 길드장은 다른 길드원이 남아 있으면 먼저 위임해야 하고, 혼자면 떠나며 길드를 없앤다.
 * 다른 사람이면 내보내기이고 길드장만 할 수 있다.
 * @param activeCount 지금 길드원 수(행위자 포함)
 */
export function removalOutcome(actor: GuildActor, target: GuildActor, activeCount: number):
  'leave' | 'dissolve' | 'handover-first' | 'kick' | 'not-leader' {
  if (actor.uid === target.uid) {
    if (actor.role === 'member') return 'leave';
    return activeCount > 1 ? 'handover-first' : 'dissolve';
  }
  return actor.role === 'leader' ? 'kick' : 'not-leader';
}

/** 길드장 위임 — 길드장만, 자기 아닌 길드원에게 넘긴다. 대상이 길드원인지는 저장소가 확인한다 */
export function handoverOutcome(actor: GuildActor, targetUid: string): 'ok' | 'self' | 'not-leader' {
  if (actor.role !== 'leader') return 'not-leader';
  return actor.uid === targetUid ? 'self' : 'ok';
}

// ── 성장 ──────────────────────────────────────────────
// 기여도는 길드원이 얻은 명성(하루 상한)과 의뢰 클리어(상한과 별개)로 쌓이고, 누적 기여도가 레벨을 정한다.
// 떠난 선원의 기여도 길드에 남는다.

/** 항해일지에 남는 사건 — 가입, 떠남, 내보냄, 전설 획득, 네임드 토벌, 보너스 기부, 보너스 단계 상승 */
export type GuildLogKind = 'join' | 'leave' | 'kick' | 'legendary' | 'named' | 'donate' | 'bonus-up';

/** 길드원 한 사람이 하루(게임 날짜)에 명성으로 쌓을 수 있는 기여 */
export const GUILD_DAILY_FAME_CAP = 1_000;
/** 의뢰 클리어 한 번의 기여 — 명성 기여의 하루 상한과 별개다 */
const CLEAR_CONTRIBUTION = { general: 500, named: 1_000 } as const;

/** 길드원 한 사람이 하루에 쌓을 수 있는 기여의 갈래별 상한: 명성, 일반 의뢰 클리어, 네임드 토벌 */
export function guildDailyContributionCaps(): { fame: number; general: number; named: number } {
  return {
    fame: GUILD_DAILY_FAME_CAP,
    general: CLEAR_CONTRIBUTION.general * bountyDailyCap('general'),
    named: CLEAR_CONTRIBUTION.named * bountyDailyCap('named'),
  };
}
/** 레벨마다 필요한 누적 기여도 — 인덱스 0이 Lv1이다 */
export const GUILD_LEVEL_FLOORS = [0, 10_000, 25_000, 50_000, 100_000] as const;
export const GUILD_MAX_LEVEL = GUILD_LEVEL_FLOORS.length;

/** 누적 기여도의 레벨 */
export function guildLevelOf(total: number): number {
  let level = 1;
  while (level < GUILD_MAX_LEVEL && total >= GUILD_LEVEL_FLOORS[level]) level++;
  return level;
}

/** 레벨 진행도 — 지금 레벨이 시작된 문턱과 다음 레벨 문턱. 최대 레벨이면 next가 null이다 */
export function guildProgress(total: number): { level: number; total: number; floor: number; next: number | null } {
  const level = guildLevelOf(total);
  return { level, total, floor: GUILD_LEVEL_FLOORS[level - 1], next: level < GUILD_MAX_LEVEL ? GUILD_LEVEL_FLOORS[level] : null };
}

// ── 보너스 ──────────────────────────────────────────────
// 보너스 다섯이 Lv1~5에 하나씩 열린다. 길드가 그 레벨에 닿으면 그 보너스는 비용 없이 1단계다. 단계 상한은 길드 레벨이다.
// 2단계부터는 길드원 누구나 열린 보너스에 골드를 기부한다. 보너스에 모인 골드가 다음 단계 비용에 닿으면 단계가 오르고
// 남은 골드는 다음 단계로 이어진다. 상한까지 필요한 골드보다 많이 내면 필요한 만큼만 받는다.
// 저장하는 단계는 기부로 오른 단계다(기부가 없으면 0). 지금 단계는 bonusRank가 레벨로 열린 1단계와 합쳐 정한다.
//
// 합연산: 보너스 하나의 효과는 "단계 × 단계당 효과"인 값 하나다(단계마다 곱하지 않는다). 받는 규칙은 그 값을
// 적용 지점 한 곳에서 한 번만 쓴다 — 판매 총액·배의 가방 칸·네임드 조우 가중치·일반 등급 가중치에 (1 ± 효과)를,
// 돌연변이는 유물·해역이 정한 확률 위에 퍼센트포인트를 더한다. 같은 효과를 다른 지점에서 다시 쓰지 않는다.

/** 보너스 — 판매가, 가방 용량, 네임드 조우, 희귀 어종(일반 등급 가중치 감소), 돌연변이. 순서가 해금 순서다 */
export type GuildBonusId = 'sell' | 'bag' | 'named' | 'rare' | 'mutation';
export const GUILD_BONUS_IDS: readonly GuildBonusId[] = ['sell', 'bag', 'named', 'rare', 'mutation'];
export const GUILD_BONUS_MAX_RANK = 5;
/** 단계 2~5에 오르는 비용(골드). 1단계는 레벨 도달로 열려 비용이 없다 */
const RANK_COSTS: Readonly<Record<number, number>> = { 2: 150_000, 3: 500_000, 4: 1_500_000, 5: 5_000_000 };
/** 단계당 효과(만분율) — 판매가 +2%, 가방 칸 +4%, 네임드 조우 가중치 +5%, 일반 등급 가중치 −2%, 돌연변이 확률 +1%p */
const EFFECT_BP_PER_RANK: Record<GuildBonusId, number> = { sell: 200, bag: 400, named: 500, rare: 200, mutation: 100 };

/** 보너스가 열리는 길드 레벨 */
export function bonusUnlockLevel(id: GuildBonusId): number {
  return GUILD_BONUS_IDS.indexOf(id) + 1;
}

/** 그 길드 레벨에서 보너스가 오를 수 있는 단계 상한 — 열리지 않았으면 0 */
function rankCap(id: GuildBonusId, guildLevel: number): number {
  return guildLevel >= bonusUnlockLevel(id) ? Math.min(guildLevel, GUILD_BONUS_MAX_RANK) : 0;
}

/** 길드 레벨의 보너스별 해금 레벨과 단계 상한 */
export function guildBonusLevels(guildLevel: number): { id: GuildBonusId; unlock: number; cap: number }[] {
  return GUILD_BONUS_IDS.map(id => ({ id, unlock: bonusUnlockLevel(id), cap: rankCap(id, guildLevel) }));
}

/** 그 단계(2~5)에 오르는 비용. 1단계(비용 없음)와 범위 밖은 null */
export function bonusRankCost(rank: number): number | null {
  return RANK_COSTS[rank] ?? null;
}

/**
 * 보너스의 지금 단계 — 열렸으면 레벨로 열린 1단계와 기부로 오른 단계 중 높은 쪽, 열리지 않았으면 0.
 * @param donatedRank 저장된 단계(기부로 오른 단계, 없으면 0)
 */
export function bonusRank(id: GuildBonusId, guildLevel: number, donatedRank: number): number {
  return rankCap(id, guildLevel) > 0 ? Math.max(1, donatedRank) : 0;
}

/**
 * 기부 하나를 보너스에 반영한다. 모인 골드(pool)로 오를 수 있는 만큼 단계를 올리고, 상한(cap)까지 필요한 골드만 받는다.
 * @param rank 지금 단계(bonusRank)
 * @returns 새 단계, 새로 모인 골드, 받은 골드(accepted ≤ amount)
 */
export function applyDonation(pool: number, rank: number, cap: number, amount: number): { rank: number; pool: number; accepted: number } {
  let needed = -pool;
  for (let r = rank + 1; r <= cap; r++) needed += bonusRankCost(r) ?? 0;
  const accepted = Math.max(0, Math.min(amount, needed));
  let next = rank;
  let left = pool + accepted;
  while (next < cap && left >= (bonusRankCost(next + 1) ?? Infinity)) {
    left -= bonusRankCost(next + 1)!;
    next++;
  }
  return { rank: next, pool: left, accepted };
}

export type DonationOutcome =
  | { ok: true; rank: number; pool: number; accepted: number }
  | { ok: false; error: 'bonus-locked' | 'rank-maxed' | 'not-enough-gold' };

/**
 * 기부 판정 — 열리지 않은 보너스와 상한에 닿은 보너스에는 기부할 수 없고, 받을 골드만큼 가지고 있어야 한다.
 * @param bonus 저장된 단계(기부로 오른 단계)와 모인 골드
 * @param gold 기부하는 사람이 가진 골드
 */
export function donationOutcome(id: GuildBonusId, guildLevel: number, bonus: { rank: number; pool: number },
  gold: number, amount: number): DonationOutcome {
  const cap = rankCap(id, guildLevel);
  if (cap === 0) return { ok: false, error: 'bonus-locked' };
  const rank = bonusRank(id, guildLevel, bonus.rank);
  if (rank >= cap) return { ok: false, error: 'rank-maxed' };
  const next = applyDonation(bonus.pool, rank, cap, amount);
  if (next.accepted > gold) return { ok: false, error: 'not-enough-gold' };
  return { ok: true, ...next };
}

/** 기부액 형식 — 1 이상의 안전한 정수 골드 */
export function validDonationAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

/**
 * 길드 보너스 효과 — 보너스마다 단계 효과를 더한 값 하나다. 판매가·가방·네임드는 늘어나는 비율, rare는 일반 등급 가중치가
 * 줄어드는 비율, mutation은 돌연변이 확률에 더하는 퍼센트포인트(0.01 = 1%p)다. 서버 액션 경로만 적용한다.
 */
export interface GuildEffects {
  sell: number;
  bag: number;
  named: number;
  rare: number;
  mutation: number;
}

/** 길드가 없을 때 — 모든 규칙이 길드 없이 동작한다 */
export const NO_GUILD_EFFECTS: GuildEffects = { sell: 0, bag: 0, named: 0, rare: 0, mutation: 0 };

/** 보너스 하나의 그 단계 효과 */
export function bonusEffect(id: GuildBonusId, rank: number): number {
  return rank * EFFECT_BP_PER_RANK[id] / 10_000;
}

/**
 * 길드 레벨과 저장된 보너스별 단계(기부로 오른 단계)에서 효과를 모은다. 열린 보너스는 기부가 없어도 1단계다.
 * @param donatedRanks 보너스별 저장된 단계. 없는 보너스는 0이다
 */
export function guildEffectsOf(guildLevel: number, donatedRanks: Partial<Record<GuildBonusId, number>>): GuildEffects {
  const out = { ...NO_GUILD_EFFECTS };
  for (const id of GUILD_BONUS_IDS) out[id] = bonusEffect(id, bonusRank(id, guildLevel, donatedRanks[id] ?? 0));
  return out;
}

/** 기여를 세는 하루 — 의뢰 클리어 한도와 같은 게임 날짜(한국 시간 새벽 4시 경계)다 */
export function contributionDayOf(nowISO: string): string {
  return gameDayOf(nowISO);
}

/**
 * 액션 하나가 쌓는 기여. fame은 그 액션이 더한 명성(줄었으면 0)이고 한 액션에서도 하루 상한을 넘지 않는다.
 * 그날 이미 쌓은 명성 기여와 합친 하루 상한은 저장소가 같은 상한(GUILD_DAILY_FAME_CAP)으로 원자적으로 건다.
 * @param cleared 이번 액션으로 클리어한 의뢰. 없으면 null
 */
export function contributionFor(fameGained: number, cleared: Pick<BountyQuest, 'difficulty'> | null): { fame: number; clears: number } {
  const clears = cleared === null ? 0 : CLEAR_CONTRIBUTION[bountyKindOf(cleared)];
  return { fame: Math.min(Math.max(0, fameGained), GUILD_DAILY_FAME_CAP), clears };
}
