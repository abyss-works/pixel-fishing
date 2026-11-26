// 메뉴 줄 - 항목 순서와 의뢰·길드 줄 배지의 단일 출처. 줄의 모양과 열 창은 표현 계층이 정한다.
import { enhancePoolSummary } from '../../guild/model/guild';
import type { GuildInfo } from '../../guild/model/guild';

export type MenuKey = 'quests' | 'achievements' | 'fortune' | 'guild' | 'friends' | 'mailbox';

/** 메뉴 줄에 오를 항목을 위에서부터 돌려준다. 의뢰, 업적, 운세는 늘 보이고, 나머지는 열 수 있는 입구만 남는다 */
export function menuKeys(open: { guild: boolean; friends: boolean; mailbox: boolean }): MenuKey[] {
  const keys: MenuKey[] = ['quests', 'achievements', 'fortune'];
  if (open.guild) keys.push('guild');
  if (open.friends) keys.push('friends');
  if (open.mailbox) keys.push('mailbox');
  return keys;
}

export type QuestBadgeTone = 'gold' | 'named';
export interface QuestBadge { tone: QuestBadgeTone; count: number }
type ClearsLeft = { general: number; named: number } | null;

/** 의뢰 줄 배지 - 일반 의뢰는 gold, 네임드 토벌은 named. 숫자는 오늘 남은 클리어이고 0이거나 모르면 그 배지는 없다 */
export function questBadges(left: ClearsLeft): QuestBadge[] {
  if (!left) return [];
  const badges: QuestBadge[] = [];
  if (left.general > 0) badges.push({ tone: 'gold', count: left.general });
  if (left.named > 0) badges.push({ tone: 'named', count: left.named });
  return badges;
}

/** 의뢰 줄의 접근성 이름 - 배지로 보이는 남은 클리어를 함께 싣는다 */
export function questMenuLabel(left: ClearsLeft): string {
  const parts: string[] = [];
  if (left && left.general > 0) parts.push(`일반 ${left.general}`);
  if (left && left.named > 0) parts.push(`네임드 ${left.named}`);
  return parts.length ? `의뢰, 오늘 남은 클리어 ${parts.join(' ')}` : '의뢰';
}

export type GuildBadgeTone = 'danger' | 'guild';
export interface GuildBadge { tone: GuildBadgeTone; count: number }

/** 길드 줄 배지 - 길드장의 대기 가입 신청은 danger, Lv.6 이상 남은 개인 강화 포인트는 guild */
export function guildMenuBadges(guild: GuildInfo | null): GuildBadge[] {
  if (!guild) return [];
  const badges: GuildBadge[] = [];
  if (guild.role === 'leader' && guild.requests.length > 0) {
    badges.push({ tone: 'danger', count: guild.requests.length });
  }
  const remaining = enhancePoolSummary(guild).remaining;
  if (remaining > 0) badges.push({ tone: 'guild', count: remaining });
  return badges;
}

/** 길드 줄의 접근성 이름 - 배지로 보이는 대기 신청과 남은 개인 강화 포인트를 함께 싣는다 */
export function guildMenuLabel(guild: GuildInfo | null): string {
  if (!guild) return '길드';
  const parts: string[] = [];
  if (guild.role === 'leader' && guild.requests.length > 0) parts.push(`가입 신청 ${guild.requests.length}건`);
  const remaining = enhancePoolSummary(guild).remaining;
  if (remaining > 0) parts.push(`개인 강화 포인트 ${remaining}개`);
  return parts.length ? `길드, ${parts.join(', ')}` : '길드';
}
