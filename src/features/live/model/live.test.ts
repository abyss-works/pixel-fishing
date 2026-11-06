import { describe, expect, it } from 'vitest';
import type { ChatLine, Presence } from '../../../game/rules/live';
import { LIVE_STALE_MS } from '../../../game/rules/live';
import { DEFAULT_LOOK } from '../../../game/content/wardrobe';
import { applyLiveMessage, BUBBLE_MS, bubbleOf, CHAT_KEEP, EMPTY_LIVE, idleLabel, isStale, matesInRegion, nextPositionMessage, othersInRegion, TYPING_MS, withoutAuthor } from './live';

const p = (uid: string, nick: string, region = 'sea'): Presence =>
  ({ uid, nick, boat: 1, region, x: 0, y: 0, dir: 0, line: false });

describe('applyLiveMessage', () => {
  it('hello로 시작해 join·move·stop·leave를 반영하고, 자기 자신과 모르는 사람은 무시한다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [p('a', '가')], recentChat: [] }, 0);
    expect(Object.keys(s.others)).toEqual(['a']);
    expect(applyLiveMessage(s, { t: 'join', presence: p('me', '나') }, 1)).toBe(s);
    s = applyLiveMessage(s, { t: 'join', presence: p('b', '나') }, 1);
    s = applyLiveMessage(s, { t: 'move', uid: 'b', region: 'deep', x: 5, y: 6, dir: 1, line: true }, 2);
    expect(s.others.b).toEqual({ presence: { ...p('b', '나', 'deep'), zone: null, x: 5, y: 6, dir: 1, line: true }, moving: true, lastAt: 2, idleSince: null });
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

  it('matesInRegion은 그 바다에 접속한 길드원의 위치만 준다', () => {
    const s = applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', recentChat: [], others: [
      { ...p('a', '하늘'), x: 10, y: 20 }, { ...p('b', '가람'), x: 30, y: 40 }, { ...p('c', '나무', 'deep'), x: 1, y: 1 },
    ] }, 0);
    expect(matesInRegion(s, 'sea', new Set(['a', 'c', 'zz']))).toEqual([{ uid: 'a', x: 10, y: 20 }]);
    expect(matesInRegion(s, 'sea', new Set())).toEqual([]);
  });
});

describe('nextPositionMessage', () => {
  const at = (x: number, y: number, line = false, bob: { x: number; y: number } | null = null) => ({ region: 'sea', zone: null, x, y, line, bob, look: DEFAULT_LOOK });

  it('처음과 바뀐 위치는 move, 그대로면 stop 한 번, 그 뒤로는 보내지 않는다', () => {
    let r = nextPositionMessage(null, at(0, 0));
    expect(r.msg).toEqual({ t: 'move', region: 'sea', zone: null, x: 0, y: 0, dir: 2, line: false, look: DEFAULT_LOOK });
    expect(r.msg).not.toHaveProperty('bob');
    r = nextPositionMessage(r.sent, at(3, 0));
    expect(r.msg).toMatchObject({ t: 'move', x: 3, dir: 1 });
    expect(r.msg).not.toHaveProperty('look'); // 외형은 처음과 바뀐 때만 싣는다
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

  it('찌 위치를 함께 보내고, 같은 자리에서 다른 어군으로 던지면 move를 다시 보낸다', () => {
    const cast = nextPositionMessage(null, at(1, 1, true, { x: 30, y: 8 }));
    expect(cast.msg).toMatchObject({ t: 'move', line: true, bob: { x: 30, y: 8 } });
    const still = nextPositionMessage(cast.sent, at(1, 1, true, { x: 30, y: 8 })).sent;
    expect(nextPositionMessage(still, at(1, 1, true, { x: 60, y: 8 })).msg).toMatchObject({ t: 'move', bob: { x: 60, y: 8 } });
  });
});

describe('외형 송신과 반영', () => {
  const pos = { region: 'sea', zone: null, x: 1, y: 1, line: false, bob: null };
  const red = { shirt: 1, pants: 2, hat: 'cap-red' };

  it('외형이 바뀌면 제자리에서도 move에 새 외형을 싣는다', () => {
    const still = nextPositionMessage(nextPositionMessage(null, { ...pos, look: DEFAULT_LOOK }).sent, { ...pos, look: DEFAULT_LOOK }).sent;
    expect(nextPositionMessage(still, { ...pos, look: red }).msg).toMatchObject({ t: 'move', look: red });
  });

  it('다시 연결되어 처음부터 보내면 외형도 다시 싣는다', () => {
    expect(nextPositionMessage(null, { ...pos, look: red }).msg).toMatchObject({ t: 'move', look: red });
  });

  it('move의 외형을 반영하고, 외형이 없는 move는 직전 외형을 유지한다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [{ ...p('a', '가'), look: DEFAULT_LOOK }], recentChat: [] }, 0);
    s = applyLiveMessage(s, { t: 'move', uid: 'a', region: 'sea', x: 1, y: 1, dir: 0, line: false, look: red }, 1);
    expect(s.others.a.presence.look).toEqual(red);
    s = applyLiveMessage(s, { t: 'move', uid: 'a', region: 'sea', x: 2, y: 1, dir: 0, line: false }, 2);
    expect(s.others.a.presence.look).toEqual(red);
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

  it('withoutAuthor는 그 사람의 줄을 두 방에서 모두 지운다', () => {
    let s = hello([line(1, 'a'), line(2, 'b'), line(3, 'a')]);
    s = applyLiveMessage(s, { t: 'chat', room: 'guild', line: line(4, 'a') }, 1);
    expect(withoutAuthor(s, 'a').chat.map(l => l.id)).toEqual([2]);
    expect(withoutAuthor(s, 'a').guildChat).toEqual([]);
  });

  it('길드 채팅은 월드 채팅과 따로 쌓고, hello의 길드 최근 대화로 시작한다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [], recentChat: [line(1)], recentGuildChat: [line(2)] }, 0);
    expect(s.guildChat.map(l => l.id)).toEqual([2]);
    s = applyLiveMessage(s, { t: 'error', code: 'chat-no-guild' }, 1);
    s = applyLiveMessage(s, { t: 'chat', room: 'guild', line: line(3, 'me') }, 2);
    expect(applyLiveMessage(s, { t: 'chat', room: 'guild', line: line(3, 'me') }, 3)).toBe(s);
    expect(s.chat.map(l => l.id)).toEqual([1]);
    expect(s.guildChat.map(l => l.id)).toEqual([2, 3]);
    expect(s.chatError).toBeNull();
    // 길드가 없는 연결의 hello는 길드 대화를 비운다
    expect(applyLiveMessage(s, { t: 'hello', you: 'me', others: [], recentChat: [] }, 4).guildChat).toEqual([]);
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

describe('다른 플레이어의 방치 시간', () => {
  const at = (idleMs?: number) => ({ ...p('a', '가'), ...(idleMs === undefined ? {} : { idleMs }) });
  it('hello, join, move가 실은 경과 시간을 받은 시각의 내 시계로 옮긴다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [at(4000)], recentChat: [] }, 10_000);
    expect(s.others.a.idleSince).toBe(6000);
    s = applyLiveMessage(s, { t: 'join', presence: { ...at(0), uid: 'b' } }, 11_000);
    expect(s.others.b.idleSince).toBe(11_000);
    s = applyLiveMessage(s, { t: 'move', uid: 'a', region: 'sea', x: 1, y: 1, dir: 0, line: true, idleMs: 300 }, 12_500);
    expect(s.others.a.idleSince).toBe(12_200);
  });

  it('경과 시간이 없으면 시간을 모른다. 줄을 거둔 move는 지운다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [at()], recentChat: [] }, 10_000);
    expect(s.others.a.idleSince).toBeNull();
    s = applyLiveMessage(s, { t: 'move', uid: 'a', region: 'sea', x: 1, y: 1, dir: 0, line: true, idleMs: 100 }, 11_000);
    expect(s.others.a.idleSince).toBe(10_900);
    s = applyLiveMessage(s, { t: 'move', uid: 'a', region: 'sea', x: 1, y: 1, dir: 0, line: false }, 12_000);
    expect(s.others.a.idleSince).toBeNull();
  });
});

describe('idleLabel', () => {
  it('시작 시각을 모르면 null, 알면 경과 시간 문자열이다', () => {
    expect(idleLabel(1000, 1000)).toBe('00:00');
    expect(idleLabel(1000, 66_000)).toBe('01:05');
    expect(idleLabel(null, 66_000)).toBeNull();
  });
  it('시계가 뒤로 가도 00:00 아래로 내려가지 않는다', () => {
    expect(idleLabel(5000, 1000)).toBe('00:00');
  });
});

describe('nextPositionMessage의 첫 결과 경과', () => {
  const cast = { region: 'sea', zone: null, x: 1, y: 1, line: true, bob: { x: 30, y: 8 }, look: DEFAULT_LOOK };
  it('첫 결과가 나오면 같은 자리여도 idleMs를 실은 move를 한 번 보낸다', () => {
    const before = nextPositionMessage(nextPositionMessage(null, cast).sent, cast).sent;
    const r = nextPositionMessage(before, { ...cast, idleMs: 0 });
    expect(r.msg).toMatchObject({ t: 'move', line: true, idleMs: 0 });
    // 경과만 늘어난 것은 변경이 아니다
    expect(nextPositionMessage(r.sent, { ...cast, idleMs: 3000 }).msg).toEqual({ t: 'stop' });
  });
  it('결과 전에는 idleMs를 싣지 않고, 다시 연결하면(last 없음) 현재 경과를 싣는다', () => {
    expect(nextPositionMessage(null, cast).msg).not.toHaveProperty('idleMs');
    expect(nextPositionMessage(null, { ...cast, idleMs: 7000 }).msg).toMatchObject({ idleMs: 7000 });
  });
  it('줄을 거두어 경과가 사라지면 move를 보낸다', () => {
    const counting = nextPositionMessage(null, { ...cast, idleMs: 5 }).sent;
    expect(nextPositionMessage(counting, { ...cast, line: false, bob: null }).msg).not.toHaveProperty('idleMs');
  });
});
