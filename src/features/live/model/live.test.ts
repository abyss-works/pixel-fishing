import { describe, expect, it } from 'vitest';
import type { Presence } from '../../../game/rules/live';
import { LIVE_STALE_MS } from '../../../game/rules/live';
import { applyLiveMessage, EMPTY_LIVE, isStale, nextPositionMessage, othersInRegion } from './live';

const p = (uid: string, nick: string, region = 'sea'): Presence =>
  ({ uid, nick, boat: 1, region, x: 0, y: 0, dir: 0, line: false });

describe('applyLiveMessage', () => {
  it('hello로 시작해 join·move·stop·leave를 반영하고, 자기 자신과 모르는 사람은 무시한다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [p('a', '가')], recentChat: [] }, 0);
    expect(Object.keys(s.others)).toEqual(['a']);
    expect(applyLiveMessage(s, { t: 'join', presence: p('me', '나') }, 1)).toBe(s);
    s = applyLiveMessage(s, { t: 'join', presence: p('b', '나') }, 1);
    s = applyLiveMessage(s, { t: 'move', uid: 'b', region: 'deep', x: 5, y: 6, dir: 1, line: true }, 2);
    expect(s.others.b).toEqual({ presence: { ...p('b', '나', 'deep'), x: 5, y: 6, dir: 1, line: true }, moving: true, lastAt: 2 });
    s = applyLiveMessage(s, { t: 'stop', uid: 'b' }, 3);
    expect(s.others.b.moving).toBe(false);
    expect(applyLiveMessage(s, { t: 'move', uid: 'zz', region: 'sea', x: 0, y: 0, dir: 0, line: false }, 4)).toBe(s);
    s = applyLiveMessage(s, { t: 'leave', uid: 'a' }, 5);
    expect(Object.keys(s.others)).toEqual(['b']);
  });

  it('이동 중에 오래 소식이 없을 때만 반투명이다', () => {
    const s = applyLiveMessage(applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [p('a', '가')], recentChat: [] }, 0),
      { t: 'move', uid: 'a', region: 'sea', x: 1, y: 1, dir: 0, line: false }, 100);
    expect(isStale(s.others.a, 100 + LIVE_STALE_MS)).toBe(false);
    expect(isStale(s.others.a, 101 + LIVE_STALE_MS)).toBe(true);
    const stopped = applyLiveMessage(s, { t: 'stop', uid: 'a' }, 200);
    expect(isStale(stopped.others.a, 10_000_000)).toBe(false);
  });

  it('othersInRegion은 그 바다 사람만 이름 순으로', () => {
    const s = applyLiveMessage(EMPTY_LIVE,
      { t: 'hello', you: 'me', others: [p('a', '하늘'), p('b', '가람'), p('c', '나무', 'deep')], recentChat: [] }, 0);
    expect(othersInRegion(s, 'sea').map(o => o.presence.nick)).toEqual(['가람', '하늘']);
  });
});

describe('nextPositionMessage', () => {
  const at = (x: number, y: number, line = false) => ({ region: 'sea', x, y, line });

  it('처음과 바뀐 위치는 move, 그대로면 stop 한 번, 그 뒤로는 보내지 않는다', () => {
    let r = nextPositionMessage(null, at(0, 0));
    expect(r.msg).toEqual({ t: 'move', region: 'sea', x: 0, y: 0, dir: 2, line: false });
    r = nextPositionMessage(r.sent, at(3, 0));
    expect(r.msg).toMatchObject({ t: 'move', x: 3, dir: 1 });
    r = nextPositionMessage(r.sent, at(3, 0));
    expect(r.msg).toEqual({ t: 'stop' });
    r = nextPositionMessage(r.sent, at(3, 0));
    expect(r.msg).toBeNull();
  });

  it('제자리에서 낚싯줄을 드리우거나 바다를 옮기면 move를 보낸다', () => {
    const still = nextPositionMessage(nextPositionMessage(null, at(1, 1)).sent, at(1, 1)).sent;
    expect(nextPositionMessage(still, at(1, 1, true)).msg).toMatchObject({ t: 'move', line: true });
    expect(nextPositionMessage(still, { ...at(1, 1), region: 'deep' }).msg).toMatchObject({ t: 'move', region: 'deep' });
  });
});
