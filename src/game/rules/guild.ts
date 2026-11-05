// 길드 규칙 — 서버와 클라이언트가 공유하는 순수 판정이다. 이름 검사, 인원 상한, 초대 코드, 길드원 권한을 맡는다.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { checkNickname } from './nickname.js';
import type { RuleCheck } from './rules.js';

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
