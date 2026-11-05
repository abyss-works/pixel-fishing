import { describe, expect, it } from 'vitest';
import type { ChatLine, Presence } from '../../../game/rules/live';
import { LIVE_STALE_MS } from '../../../game/rules/live';
import { applyLiveMessage, BUBBLE_MS, bubbleOf, CHAT_KEEP, EMPTY_LIVE, isStale, nextPositionMessage, othersInRegion, TYPING_MS, withoutAuthor } from './live';

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

describe('채팅 상태', () => {
  const line = (id: number, uid = 'a'): ChatLine => ({ id, uid, nick: `n-${uid}`, text: `t${id}`, at: '2030-01-01T00:00:00.000Z' });
  const hello = (recentChat: ChatLine[]) => applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [], recentChat }, 0);

  it('hello의 최근 대화로 시작하고, 새 줄은 뒤에 붙이며 같은 id는 한 번만 둔다', () => {
    let s = hello([line(1), line(2)]);
    s = applyLiveMessage(s, { t: 'chat', line: line(3) }, 1);
    expect(applyLiveMessage(s, { t: 'chat', line: line(3) }, 2)).toBe(s);
    expect(s.chat.map(l => l.id)).toEqual([1, 2, 3]);
    // 재연결의 hello는 목록을 서버 기준으로 바꾼다
    expect(applyLiveMessage(s, { t: 'hello', you: 'me', others: [], recentChat: [line(3)] }, 3).chat.map(l => l.id)).toEqual([3]);
  });

  it('보관 상한을 넘으면 오래된 줄부터 버린다', () => {
    let s = hello([]);
    for (let i = 1; i <= CHAT_KEEP + 2; i++) s = applyLiveMessage(s, { t: 'chat', line: line(i) }, i);
    expect(s.chat).toHaveLength(CHAT_KEEP);
    expect(s.chat[0].id).toBe(3);
  });

  it('오류는 마지막 하나만 남고, 내 채팅이 저장되면 지운다', () => {
    let s = applyLiveMessage(hello([]), { t: 'error', code: 'chat-rate' }, 1);
    expect(s.chatError).toBe('chat-rate');
    s = applyLiveMessage(s, { t: 'chat', line: line(1, 'other') }, 2);
    expect(s.chatError).toBe('chat-rate');
    s = applyLiveMessage(s, { t: 'chat', line: line(2, 'me') }, 3);
    expect(s.chatError).toBeNull();
  });

  it('withoutAuthor는 그 사람의 줄을 지운다', () => {
    const s = hello([line(1, 'a'), line(2, 'b'), line(3, 'a')]);
    expect(withoutAuthor(s, 'a').chat.map(l => l.id)).toEqual([2]);
  });
});

describe('bubbleOf', () => {
  it('최근 채팅이 입력 중보다 먼저고, 시간이 지나면 사라진다', () => {
    expect(bubbleOf({ text: '안녕', at: 0 }, 0, BUBBLE_MS - 1)).toEqual({ kind: 'chat', text: '안녕' });
    expect(bubbleOf({ text: '안녕', at: 0 }, BUBBLE_MS, BUBBLE_MS)).toEqual({ kind: 'typing' });
    expect(bubbleOf(null, 0, TYPING_MS)).toBeNull();
    expect(bubbleOf(null, null, 0)).toBeNull();
  });
});
