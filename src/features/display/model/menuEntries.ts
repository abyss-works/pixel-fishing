// 메뉴 줄 - 항목 순서와 의뢰 줄 배지의 단일 출처. 줄의 모양과 열 창은 표현 계층이 정한다.

export type MenuKey = 'quests' | 'guild' | 'friends' | 'mailbox';

/** 메뉴 줄에 오를 항목을 위에서부터 돌려준다. 의뢰는 늘 맨 위에 있고, 나머지는 열 수 있는 입구만 남는다 */
export function menuKeys(open: { guild: boolean; friends: boolean; mailbox: boolean }): MenuKey[] {
  const keys: MenuKey[] = ['quests'];
  if (open.guild) keys.push('guild');
  if (open.friends) keys.push('friends');
  if (open.mailbox) keys.push('mailbox');
  return keys;
}

export type QuestBadgeTone = 'gold' | 'epic';
export interface QuestBadge { tone: QuestBadgeTone; count: number }
type ClearsLeft = { general: number; named: number } | null;

/** 의뢰 줄 배지 - 일반 의뢰는 gold, 네임드 토벌은 epic. 숫자는 오늘 남은 클리어이고 0이거나 모르면 그 배지는 없다 */
export function questBadges(left: ClearsLeft): QuestBadge[] {
  if (!left) return [];
  const badges: QuestBadge[] = [];
  if (left.general > 0) badges.push({ tone: 'gold', count: left.general });
  if (left.named > 0) badges.push({ tone: 'epic', count: left.named });
  return badges;
}

/** 의뢰 줄의 접근성 이름 - 배지로 보이는 남은 클리어를 함께 싣는다 */
export function questMenuLabel(left: ClearsLeft): string {
  const parts: string[] = [];
  if (left && left.general > 0) parts.push(`일반 ${left.general}`);
  if (left && left.named > 0) parts.push(`네임드 ${left.named}`);
  return parts.length ? `의뢰, 오늘 남은 클리어 ${parts.join(' ')}` : '의뢰';
}
