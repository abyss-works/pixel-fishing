import type { GuildInfo, GuildMemberItem, GuildOp } from '../../../platform/api';
import { handoverOutcome, removalOutcome } from '../../../game/rules/guild';

export type { GuildInfo, GuildMemberItem, GuildOp };

// 길드 화면 모델 — 길드원 묶음, 길드원별로 열리는 관리 동작, 초대 코드 남은 시간, 거부 안내 문장.

/** 지금 길드원과 떠난 선원. 순서는 서버가 정한 그대로다 */
export function splitMembers(members: readonly GuildMemberItem[]): { active: GuildMemberItem[]; departed: GuildMemberItem[] } {
  return { active: members.filter(m => m.leftAt === null), departed: members.filter(m => m.leftAt !== null) };
}

/** 그 길드원에게 내가 할 수 있는 관리 동작 */
export function memberActions(guild: GuildInfo, me: string, target: GuildMemberItem): { kick: boolean; handover: boolean } {
  const actor = { uid: me, role: guild.role };
  const count = splitMembers(guild.members).active.length;
  return {
    kick: removalOutcome(actor, target, count) === 'kick',
    handover: handoverOutcome(actor, target.uid) === 'ok',
  };
}

/** 내가 떠나기를 누르면 어떻게 되는가 — 떠남, 길드 없어짐, 위임 먼저 */
export function leaveOutcome(guild: GuildInfo, me: string): 'leave' | 'dissolve' | 'handover-first' {
  const actor = { uid: me, role: guild.role };
  const outcome = removalOutcome(actor, actor, splitMembers(guild.members).active.length);
  return outcome === 'dissolve' || outcome === 'handover-first' ? outcome : 'leave';
}

/** 초대 코드를 쓸 수 있는 남은 시간 */
export function inviteLeftText(expiresAt: string, nowMs: number): string {
  const mins = Math.floor((Date.parse(expiresAt) - nowMs) / 60_000);
  if (mins <= 0) return '만료됨';
  return mins >= 60 ? `${Math.floor(mins / 60)}시간 남음` : `${mins}분 남음`;
}

/** 요청 실패 코드를 안내 문장으로 */
export const GUILD_ERROR_TEXT: Record<string, string> = {
  'bad-name': '길드 이름은 한글 1~8자 또는 영문 2~16자로, 한글·영문·숫자와 - _만 쓸 수 있어요.',
  'name-taken': '이미 쓰이는 길드 이름이에요.',
  'already-in-guild': '이미 길드에 들어가 있어요. 한 사람은 길드 하나에만 들어갈 수 있어요.',
  'bad-code': '초대 코드를 찾지 못했어요. 코드가 맞는지, 만료되지 않았는지 확인해 주세요.',
  'guild-full': '길드 인원이 가득 찼어요.',
  'not-leader': '길드장만 할 수 있어요.',
  'not-member': '길드원을 찾지 못했어요. 창을 다시 열어 주세요.',
  'handover-first': '다른 길드원이 있으면 길드장을 넘긴 뒤에 떠날 수 있어요.',
  self: '자기 자신에게는 넘길 수 없어요.',
  'account-only': '길드는 계정을 만든 뒤에 쓸 수 있어요.',
};
