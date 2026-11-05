import { describe, expect, it } from 'vitest';
import type { FriendItem } from '../../../platform/api';
import { friendRelation, friendStatusText, groupFriends } from './friends';
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

describe('friendStatusText', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  it('접속 중이면 있는 곳, 아니면 지난 시간', () => {
    expect(friendStatusText(f('a', 'friend', { online: true, region: 'world' }), now)).toBe('접속 중 · 바다');
    expect(friendStatusText(f('a', 'friend', { online: true, region: 'world', zone: 'pacific' }), now)).toBe(`접속 중 · ${zoneById('pacific')!.name}`);
    expect(friendStatusText(f('a', 'friend', { online: true, region: 'village' }), now)).toBe('접속 중 · 마을');
    expect(friendStatusText(f('a', 'friend'), now)).toBe('아직 기록이 없어요');
    expect(friendStatusText(f('a', 'friend', { lastActiveAt: '2026-11-05T11:59:40Z' }), now)).toBe('방금 전');
    expect(friendStatusText(f('a', 'friend', { lastActiveAt: '2026-11-05T11:15:00Z' }), now)).toBe('45분 전');
    expect(friendStatusText(f('a', 'friend', { lastActiveAt: '2026-11-05T09:00:00Z' }), now)).toBe('3시간 전');
    expect(friendStatusText(f('a', 'friend', { lastActiveAt: '2026-11-02T12:00:00Z' }), now)).toBe('3일 전');
  });
});

describe('friendRelation', () => {
  it('그 사람과의 관계를 돌려주고, 관계가 없으면 null이다', () => {
    const g = groupFriends([f('a', 'friend'), f('b', 'incoming'), f('c', 'outgoing')]);
    expect(['a', 'b', 'c', 'd'].map(uid => friendRelation(g, uid))).toEqual(['friend', 'incoming', 'outgoing', null]);
  });
});
