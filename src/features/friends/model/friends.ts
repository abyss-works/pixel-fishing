import type { FriendItem } from '../../../platform/api';

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

/** 친구의 지금 상태 한 줄 — 접속 중이면 있는 곳, 아니면 마지막 행동이 얼마나 지났는지 */
export function friendStatusText(f: FriendItem, nowMs: number): string {
  if (f.online) return f.region === 'village' ? '접속 중 · 마을' : '접속 중 · 바다';
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
  'account-only': '친구는 계정을 만든 뒤에 쓸 수 있어요.',
  'bad-nickname': '닉네임을 입력해 주세요.',
};
