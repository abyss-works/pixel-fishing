import { describe, expect, it } from 'vitest';
import type { FriendItem } from '../../../platform/api';
import { FRIEND_ERROR_TEXT, friendRelation, friendPlaceText, groupFriends, friendAlertText } from './friends';
import { zoneById } from '../../../game/content/zones';

const f = (uid: string, state: FriendItem['state'], extra: Partial<FriendItem> = {}): FriendItem =>
  ({ uid, nick: uid, state, lastActiveAt: null, online: false, region: null, zone: null, ...extra });

describe('groupFriends', () => {
  it('상태별로 나누고, 친구는 접속 중이 먼저, 그다음 최근 행동 순이다', () => {
    const g = groupFriends([
      f('old', 'friend', { lastActiveAt: '2026-11-01T00:00:00Z' }),
      f('in', 'incoming'),
      f('new', 'friend', { lastActiveAt: '2026-11-05T00:00:00Z' }),
      f('on', 'friend', { online: true }),
      f('out', 'outgoing'),
    ]);
    expect(g.friends.map(x => x.uid)).toEqual(['on', 'new', 'old']);
    expect(g.incoming.map(x => x.uid)).toEqual(['in']);
    expect(g.outgoing.map(x => x.uid)).toEqual(['out']);
  });
});

describe('friendPlaceText', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  it('접속 중이면 있는 곳만, 아니면 지난 시간', () => {
    expect(friendPlaceText(f('a', 'friend', { online: true, region: 'world' }), now)).toBe('바다');
    expect(friendPlaceText(f('a', 'friend', { online: true, region: 'world', zone: 'pacific' }), now)).toBe(zoneById('pacific')!.name);
    expect(friendPlaceText(f('a', 'friend', { online: true, region: 'village' }), now)).toBe('마을');
    expect(friendPlaceText(f('a', 'friend'), now)).toBe('아직 기록이 없어요');
    expect(friendPlaceText(f('a', 'friend', { lastActiveAt: '2026-11-05T11:59:40Z' }), now)).toBe('방금 전');
    expect(friendPlaceText(f('a', 'friend', { lastActiveAt: '2026-11-05T11:15:00Z' }), now)).toBe('45분 전');
    expect(friendPlaceText(f('a', 'friend', { lastActiveAt: '2026-11-05T09:00:00Z' }), now)).toBe('3시간 전');
    expect(friendPlaceText(f('a', 'friend', { lastActiveAt: '2026-11-02T12:00:00Z' }), now)).toBe('3일 전');
  });
});

describe('friendRelation', () => {
  it('그 사람과의 관계를 돌려주고, 관계가 없으면 null이다', () => {
    const g = groupFriends([f('a', 'friend'), f('b', 'incoming'), f('c', 'outgoing')]);
    expect(['a', 'b', 'c', 'd'].map(uid => friendRelation(g, uid))).toEqual(['friend', 'incoming', 'outgoing', null]);
  });
});

describe('친구 알림 문구', () => {
  it('받은 요청과 수락을 보낸 사람 이름으로 알린다', () => {
    expect(friendAlertText({ kind: 'request', nick: '나루' })).toBe('나루 님이 친구 요청을 보냈어요.');
    expect(friendAlertText({ kind: 'accepted', nick: '나루' })).toBe('나루 님과 친구가 됐어요.');
    expect(friendAlertText({ kind: 'request', nick: null })).toBe('새 친구 요청이 왔어요.');
  });
});

describe('FRIEND_ERROR_TEXT', () => {
  it('게스트 거부 안내는 계정 연결을 알린다', () => {
    expect(FRIEND_ERROR_TEXT['account-only']).toBe('친구는 계정을 연결하면 쓸 수 있어요.');
  });
});
