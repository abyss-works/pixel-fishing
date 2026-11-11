import type { FriendItem } from '../../../platform/api';
import { zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';

export type { FriendItem };

// 친구 목록을 화면 묶음으로 나누고 접속 표시 문장을 만든다.

export interface FriendGroups {
  /** 접속 중인 친구가 먼저, 그다음 마지막 행동이 최근인 순 */
  friends: FriendItem[];
  incoming: FriendItem[];
  outgoing: FriendItem[];
}

const lastMs = (f: FriendItem) => (f.lastActiveAt ? Date.parse(f.lastActiveAt) : 0);

export function groupFriends(list: readonly FriendItem[]): FriendGroups {
  const friends = list.filter(f => f.state === 'friend')
    .sort((a, b) => Number(b.online) - Number(a.online) || lastMs(b) - lastMs(a));
  return {
    friends,
    incoming: list.filter(f => f.state === 'incoming'),
    outgoing: list.filter(f => f.state === 'outgoing'),
  };
}

/** 그 사람과의 관계 — 친구, 받은 요청, 보낸 요청. 관계가 없으면 null */
export function friendRelation(groups: FriendGroups, uid: string): FriendItem['state'] | null {
  return [...groups.friends, ...groups.incoming, ...groups.outgoing].find(f => f.uid === uid)?.state ?? null;
}

/** 친구 목록의 있는 곳 칸 — 접속 중이면 지금 있는 곳, 아니면 마지막 행동이 얼마나 지났는지.
    접속 여부는 접속 점이 보이므로 문장에 다시 쓰지 않는다 */
export function friendPlaceText(f: FriendItem, nowMs: number): string {
  if (f.online) {
    if (f.region === 'village') return '마을';
    const zone = f.zone ? zoneById(f.zone as ZoneId)?.name : undefined;
    return zone ?? '바다';
  }
  if (!f.lastActiveAt) return '아직 기록이 없어요';
  const mins = Math.max(0, Math.floor((nowMs - Date.parse(f.lastActiveAt)) / 60_000));
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/** 요청 실패 코드를 안내 문장으로 */
export const FRIEND_ERROR_TEXT: Record<string, string> = {
  'not-found': '그 닉네임의 계정을 찾지 못했어요.',
  self: '자기 자신에게는 요청할 수 없어요.',
  'account-only': '친구는 계정을 연결하면 쓸 수 있어요.',
  'bad-nickname': '닉네임을 입력해 주세요.',
};

/** 실시간 친구 알림의 메시지 창 문구 — 받은 요청과 내 요청의 수락. 이름을 모르면 이름 없이 알린다 */
export function friendAlertText(e: { kind: 'request' | 'accepted'; nick: string | null }): string {
  if (e.kind === 'request') return e.nick ? `${e.nick} 님이 친구 요청을 보냈어요.` : '새 친구 요청이 왔어요.';
  return e.nick ? `${e.nick} 님과 친구가 됐어요.` : '친구 요청이 수락됐어요.';
}
