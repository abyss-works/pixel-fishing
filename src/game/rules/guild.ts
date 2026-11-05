// 길드 규칙 — 서버와 클라이언트가 공유하는 순수 판정이다. 이름 검사, 인원 상한, 초대 코드, 길드원 권한과
// 성장(기여도·레벨·보너스)을 맡는다.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { checkNickname } from './nickname.js';
import type { RuleCheck } from './rules.js';
import { gameDayOf } from './time.js';
import { bountyKindOf } from '../content/bounties.js';
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
// 떠난 선원의 기여도 길드에 남는다. 보너스는 레벨이 오르면 누적되며 지금 길드원 모두에게 같다.

/** 항해일지에 남는 사건 — 가입, 떠남, 내보냄, 전설 획득, 네임드 토벌 */
export type GuildLogKind = 'join' | 'leave' | 'kick' | 'legendary' | 'named';

/** 길드원 한 사람이 하루(게임 날짜)에 명성으로 쌓을 수 있는 기여 */
export const GUILD_DAILY_FAME_CAP = 1_000;
/** 의뢰 클리어 한 번의 기여 — 명성 기여의 하루 상한과 별개다 */
const CLEAR_CONTRIBUTION = { general: 500, named: 1_000 } as const;
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

/**
 * 길드 보너스 — 비율(0.05 = 5%)이다. 받는 규칙이 효과를 정한다.
 * 천장 두 가지는 확정 문턱에 (1 − 비율)을 곱해 그만큼 빨리 찬다(speciesPityCandidates·namedPityCeiling).
 */
export interface GuildBonus {
  /** 미보유 어종 일반 폼 최초 획득 천장이 빨리 차는 비율 */
  speciesPity: number;
  /** 일반 의뢰 보상이 늘어나는 비율. 네임드 토벌 보상에는 붙지 않는다 */
  bountyReward: number;
  /** 네임드 조우 천장이 빨리 차는 비율 */
  namedPity: number;
}

/** 길드가 없을 때(또는 Lv1) — 모든 규칙이 길드 없이 동작한다 */
export const NO_GUILD_BONUS: GuildBonus = { speciesPity: 0, bountyReward: 0, namedPity: 0 };

/** 레벨의 보너스 — Lv2 어종 천장 5% · Lv3 일반 의뢰 보상 +5% · Lv4 어종 천장 10%로 · Lv5 네임드 천장 10% */
export function guildBonusOf(level: number): GuildBonus {
  return {
    speciesPity: level >= 4 ? 0.1 : level >= 2 ? 0.05 : 0,
    bountyReward: level >= 3 ? 0.05 : 0,
    namedPity: level >= 5 ? 0.1 : 0,
  };
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
