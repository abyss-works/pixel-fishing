import type { GuildInfo, GuildLogItem, GuildMemberItem, GuildOp } from '../../../platform/api';
import { GUILD_LEVEL_FLOORS, guildBonusOf, handoverOutcome, removalOutcome } from '../../../game/rules/guild';
import type { GuildBonus } from '../../../game/rules/guild';
import { FISH } from '../../../game/content/fish';
import { bountyById } from '../../../game/content/bounties';
import { namedById } from '../../../game/content/named';

export type { GuildInfo, GuildLogItem, GuildMemberItem, GuildOp };

// 길드 화면 모델 — 길드원 묶음, 길드원별로 열리는 관리 동작, 초대 코드 남은 시간, 거부 안내 문장,
// 레벨 진행·보너스 문장·레벨 사다리, 항해일지 문장.

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

// ── 성장과 항해일지 ──────────────────────────────────────────────

/** 레벨 진행 막대 — 지금 레벨 안에서 채운 비율과 다음 레벨까지 남은 기여. 최고 레벨이면 가득 차고 남은 기여가 없다 */
export function growthBar(growth: GuildInfo['growth']): { ratio: number; remaining: number | null } {
  if (growth.next === null) return { ratio: 1, remaining: null };
  return { ratio: (growth.total - growth.floor) / (growth.next - growth.floor), remaining: growth.next - growth.total };
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** 받는 보너스 문장 — 어종 천장, 일반 의뢰 보상, 네임드 조우 천장 순. 없는 보너스는 빼고 보인다 */
export function bonusLines(bonus: GuildBonus): string[] {
  return [
    bonus.speciesPity > 0 && `처음 보는 어종 천장이 ${pct(bonus.speciesPity)} 빨리 차요`,
    bonus.bountyReward > 0 && `일반 의뢰 보상 +${pct(bonus.bountyReward)}`,
    bonus.namedPity > 0 && `네임드 조우 천장이 ${pct(bonus.namedPity)} 빨리 차요`,
  ].filter((line): line is string => typeof line === 'string');
}

export interface LevelStep {
  level: number;
  /** 이 레벨에 필요한 누적 기여도 */
  floor: number;
  /** 이 레벨에서 새로 열리거나 커지는 보너스 */
  perks: string[];
  state: 'done' | 'current' | 'next' | 'locked';
}

/** 레벨 사다리 — 레벨마다 문턱과 새로 열리는 보너스 */
export function levelSteps(growth: GuildInfo['growth']): LevelStep[] {
  return GUILD_LEVEL_FLOORS.map((floor, i) => {
    const level = i + 1;
    const before = new Set(bonusLines(guildBonusOf(level - 1)));
    const state = level < growth.level ? 'done' : level === growth.level ? 'current' : level === growth.level + 1 ? 'next' : 'locked';
    return { level, floor, perks: bonusLines(guildBonusOf(level)).filter(line => !before.has(line)), state };
  });
}

/** 항해일지 한 줄의 문장 */
export function logLine(log: GuildLogItem): string {
  const who = `${log.nick ?? '이름 없음'} 님`;
  switch (log.kind) {
    case 'join': return `${who}이 길드에 들어왔어요.`;
    case 'leave': return `${who}이 길드를 떠났어요.`;
    case 'kick': return `${who}이 길드에서 내보내졌어요.`;
    case 'legendary': {
      const fish = FISH.find(f => f.id === log.detail);
      return `${who}이 전설 ${fish?.name ?? '어종'} 낚시에 성공했어요!`;
    }
    case 'named': {
      const quest = log.detail ? bountyById(log.detail) : undefined;
      const named = quest?.targetFish ? namedById(quest.targetFish) : undefined;
      return `${who}이 네임드 ${named?.name ?? '어종'} 토벌에 성공했어요!`;
    }
  }
}

/** 항해일지 줄이 남은 뒤 지난 시간 */
export function logAgoText(at: string, nowMs: number): string {
  const mins = Math.max(0, Math.floor((nowMs - Date.parse(at)) / 60_000));
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}
