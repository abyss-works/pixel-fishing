// 메뉴 줄 - 항목 순서와 줄·버튼 표식의 단일 출처. 줄의 모양과 열 창은 표현 계층이 정한다.
import { enhancePoolSummary } from '../../guild/model/guild';
import type { GuildInfo } from '../../guild/model/guild';
import { guestLock } from './menuLock';
import type { AccountLockState } from './menuLock';
import type { RewardLine } from './rewardsDue';

export type MenuKey = 'fortune' | 'ranking' | 'achievements' | 'quests' | 'guild' | 'friends' | 'mailbox';
export type MenuGroupKey = 'status' | 'activity' | 'social';

export interface MenuGroupDef {
  key: MenuGroupKey;
  label: string;
  keys: MenuKey[];
}

export interface MenuOpenFlags {
  ranking?: boolean;
  guild: boolean;
  friends: boolean;
  mailbox: boolean;
}

/** 메뉴 묶음과 순서를 돌려준다. 상태(운세·랭킹), 활동(업적·의뢰), 소통(길드·친구·우편함) 순이다 */
export function menuGroups(open: MenuOpenFlags): MenuGroupDef[] {
  const statusKeys: MenuKey[] = ['fortune'];
  if (open.ranking) statusKeys.push('ranking');
  const groups: MenuGroupDef[] = [
    { key: 'status', label: '상태', keys: statusKeys },
    { key: 'activity', label: '활동', keys: ['achievements', 'quests'] },
  ];
  const socialKeys: MenuKey[] = [];
  if (open.guild) socialKeys.push('guild');
  if (open.friends) socialKeys.push('friends');
  if (open.mailbox) socialKeys.push('mailbox');
  if (socialKeys.length > 0) {
    groups.push({ key: 'social', label: '소통', keys: socialKeys });
  }
  return groups;
}

/** 메뉴 줄에 오를 항목을 위에서부터 돌려준다. */
export function menuKeys(open: MenuOpenFlags): MenuKey[] {
  return menuGroups(open).flatMap(g => g.keys);
}

/** 메뉴 줄 표식 - reward는 받을 보상(금색 테두리), mail은 읽지 않은 우편(빨간 점), accent는 그 밖에 강조할 것(금색 점) */
export type MenuMark = 'reward' | 'mail' | 'accent';

export interface MenuMarks {
  items: Partial<Record<MenuKey, MenuMark>>;
  /** 접힌 메뉴 버튼의 점 - 금색 점과 빨간 점이 함께 켜질 상태이면 빨간 점만 보인다 */
  button: 'accent' | 'mail' | null;
}

/** 메뉴 줄과 접힌 메뉴 버튼의 표식을 한 곳에서 정한다. 잠긴 줄은 알릴 것이 없다 */
export function menuMarks({ lines, friendRequests, guild, accountState }: {
  lines: readonly Pick<RewardLine, 'window'>[];
  friendRequests: number;
  guild: GuildInfo | null;
  accountState: AccountLockState;
}): MenuMarks {
  const items: MenuMarks['items'] = {};
  if (lines.some(l => l.window === 'quests')) items.quests = 'reward';
  if (lines.some(l => l.window === 'achievements')) items.achievements = 'reward';
  if (lines.some(l => l.window === 'mailbox')) items.mailbox = 'mail';
  if (friendRequests > 0 && !guestLock('friends', accountState)) items.friends = 'accent';
  const guildRequests = guild?.role === 'leader' ? guild.requests.length : 0;
  const guildOpen = !guestLock('guild', accountState);
  if (guild && guildOpen && (guildRequests > 0 || enhancePoolSummary(guild).remaining > 0)) items.guild = 'accent';
  const gold = items.quests || items.achievements || items.friends || (guildOpen && guildRequests > 0);
  return { items, button: items.mailbox ? 'mail' : gold ? 'accent' : null };
}

const MARK_NAME: Record<MenuMark, string> = { reward: '받을 보상 있음', mail: '읽지 않은 우편 있음', accent: '새 알림 있음' };

/** 줄의 접근성 이름 - 눈에 보이는 표식을 이름에도 싣는다 */
export const menuMarkName = (label: string, mark: MenuMark | undefined): string =>
  mark ? `${label}, ${MARK_NAME[mark]}` : label;
