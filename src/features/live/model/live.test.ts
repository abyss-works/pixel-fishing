import { describe, expect, it } from 'vitest';
import type { ChatLine, Presence } from '../../../game/rules/live';
import { LIVE_STALE_MS } from '../../../game/rules/live';
import { DEFAULT_LOOK } from '../../../game/content/wardrobe';
import { applyLiveMessage, boatTierLabel, BUBBLE_MS, bubbleOf, CHAT_KEEP, EMPTY_LIVE, filterPlayers, GLOBAL_CHAT_COOLDOWN_MS, idleLabel, isStale, matesInRegion, nextPositionMessage, othersInRegion, PLAYER_LIST_SORT_OPTIONS, playerZoneLabel, resolveLiveRegion, selectPlayerList, selectPlayersInRegion, sortPlayers, TYPING_MS, withoutAuthor } from './live';

const p = (uid: string, nick: string, region = 'sea', fame = 0): Presence =>
  ({ uid, nick, boat: 1, fame, region, x: 0, y: 0, dir: 0, line: false });

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

  it('playerZoneLabel은 실시간 해역의 짧은 이름을 돌려주고 없으면 지역으로 폴백한다', () => {
    expect(playerZoneLabel({ region: 'world', zone: 'seasia' })).toBe('동남아');
    expect(playerZoneLabel({ region: 'world', zone: 'deep' })).toBe('해구');
    expect(playerZoneLabel({ region: 'world', zone: null })).toBe('바다');
    expect(playerZoneLabel({ region: 'village', zone: null })).toBe('마을');
    expect(playerZoneLabel({ region: 'unknown', zone: null })).toBeNull();
  });

  it('nick 알림을 받으면 접속자 목록과 전체·지역·길드 채팅 발신자의 닉네임을 즉시 갱신한다', () => {
    const globalLine: ChatLine = { id: 1, uid: 'a', nick: '가', text: '안녕', at: '2030-01-01T00:00:00.000Z' };
    const localLine: ChatLine = { id: 4, uid: 'a', nick: '가', text: '지역안녕', at: '2030-01-01T00:00:00.500Z' };
    const guildLine: ChatLine = { id: 2, uid: 'a', nick: '가', text: '길드안녕', at: '2030-01-01T00:00:01.000Z' };
    const otherLine: ChatLine = { id: 3, uid: 'b', nick: '나', text: '반가워', at: '2030-01-01T00:00:02.000Z' };
    let s = applyLiveMessage(EMPTY_LIVE, {
      t: 'hello',
      you: 'me',
      others: [p('a', '가'), p('b', '나')],
      recentChat: [globalLine, otherLine],
      recentLocalChat: [localLine],
      recentGuildChat: [guildLine],
    }, 0);

    s = applyLiveMessage(s, { t: 'nick', uid: 'a', nick: '새이름' }, 1);
    expect(s.others.a.presence.nick).toBe('새이름');
    expect(s.others.b.presence.nick).toBe('나');
    expect(s.globalChat.map(l => l.nick)).toEqual(['새이름', '나']);
    expect(s.localChat.map(l => l.nick)).toEqual(['새이름']);
    expect(s.guildChat.map(l => l.nick)).toEqual(['새이름']);
    expect(othersInRegion(s, 'sea').map(o => o.presence.nick)).toEqual(['나', '새이름']);

    // 같은 닉네임이거나 모르는 사용자면 상태를 그대로 돌려준다
    expect(applyLiveMessage(s, { t: 'nick', uid: 'a', nick: '새이름' }, 2)).toBe(s);
    expect(applyLiveMessage(s, { t: 'nick', uid: 'unknown', nick: '아무개' }, 3)).toBe(s);
  });

  it('hello와 join의 fame·boat·look을 보존하고 move·stop·nick 뒤에도 유지한다', () => {
    const look = { shirt: 3, pants: 2, hat: 'cap-red' };
    let s = applyLiveMessage(EMPTY_LIVE, {
      t: 'hello',
      you: 'me',
      others: [{ ...p('a', '가람', 'world', 12_500), boat: 7, look }],
      recentChat: [],
    }, 0);
    expect(s.others.a.presence.fame).toBe(12_500);

    s = applyLiveMessage(s, { t: 'move', uid: 'a', region: 'world', x: 12, y: 34, dir: 1, line: true }, 10);
    expect(s.others.a.presence.fame).toBe(12_500);
    expect(s.others.a.presence.boat).toBe(7);
    expect(s.others.a.presence.look).toEqual(look);

    s = applyLiveMessage(s, { t: 'stop', uid: 'a' }, 20);
    expect(s.others.a.presence.fame).toBe(12_500);

    s = applyLiveMessage(s, { t: 'nick', uid: 'a', nick: '바다사냥꾼' }, 30);
    expect(s.others.a.presence.fame).toBe(12_500);
    expect(s.others.a.presence.nick).toBe('바다사냥꾼');

    s = applyLiveMessage(s, {
      t: 'join',
      presence: { ...p('b', '새접속', 'world', 4_200), boat: 4, look },
    }, 40);
    expect(s.others.b.presence.fame).toBe(4_200);
  });
});

describe('접속자 목록 모델(정렬·검색·배 티어)', () => {
  it('정렬 옵션은 명성순(기본)과 가나다순 2종만 제공한다', () => {
    expect(PLAYER_LIST_SORT_OPTIONS).toEqual([
      { value: 'fame', label: '명성순' },
      { value: 'name', label: '가나다순' },
    ]);
  });

  it('boatTierLabel은 1~9단계는 T1~T9로, 0단계 이하는 도보로 바꾼다', () => {
    expect(boatTierLabel(0)).toBe('도보');
    expect(boatTierLabel(-1)).toBe('도보');
    expect(boatTierLabel(1)).toBe('T1');
    expect(boatTierLabel(5)).toBe('T5');
    expect(boatTierLabel(9)).toBe('T9');
  });

  it('sortPlayers는 명성순 내림차순(동률 시 가나다순 오름차순)과 가나다순 오름차순으로 정렬한다', () => {
    const items = [
      { uid: 'u1', nick: '하늘', fame: 500 },
      { uid: 'u2', nick: '가람', fame: 500 },
      { uid: 'u3', nick: '바다', fame: 1200 },
      { uid: 'u4', nick: '나루', fame: 300 },
    ];
    expect(sortPlayers(items, 'fame').map(i => i.uid)).toEqual(['u3', 'u2', 'u1', 'u4']);
    expect(sortPlayers(items, 'name').map(i => i.uid)).toEqual(['u2', 'u4', 'u3', 'u1']);
  });

  it('filterPlayers와 selectPlayerList는 공백 트림·대소문자 무시 부분 일치로 즉시 걸러 정렬한다', () => {
    const items = [
      { uid: 'u1', nick: 'AlphaFisher', fame: 100 },
      { uid: 'u2', nick: 'alphaKing', fame: 500 },
      { uid: 'u3', nick: '바다사나이', fame: 300 },
    ];
    expect(filterPlayers(items, '  ALPHA  ').map(i => i.uid)).toEqual(['u1', 'u2']);
    expect(filterPlayers(items, '   ').map(i => i.uid)).toEqual(['u1', 'u2', 'u3']);
    expect(selectPlayerList(items, { query: 'alpha', sort: 'fame' }).map(i => i.uid)).toEqual(['u2', 'u1']);
    expect(selectPlayerList(items, { query: 'alpha', sort: 'name' }).map(i => i.uid)).toEqual(['u1', 'u2']);
  });

  it('selectPlayersInRegion은 해당 지역 접속자의 fame·배 티어·외형(기본 외형 폴백)을 파생한다', () => {
    const customLook = { shirt: 4, pants: 2, hat: 'straw-hat' };
    const s = applyLiveMessage(EMPTY_LIVE, {
      t: 'hello',
      you: 'me',
      others: [
        { ...p('u1', '도보낚시꾼', 'world', 250), boat: 0, zone: 'pacific' },
        { ...p('u2', '원양선장', 'world', 98_000), boat: 9, zone: 'northatlantic', look: customLook },
        { ...p('u3', '마을사람', 'village', 50_000), boat: 3 },
      ],
      recentChat: [],
    }, 0);

    expect(selectPlayersInRegion(s, 'world')).toEqual([
      {
        uid: 'u2',
        nick: '원양선장',
        boat: 9,
        boatTierLabel: 'T9',
        fame: 98_000,
        look: customLook,
        zoneLabel: '북대서양',
      },
      {
        uid: 'u1',
        nick: '도보낚시꾼',
        boat: 0,
        boatTierLabel: '도보',
        fame: 250,
        look: DEFAULT_LOOK,
        zoneLabel: '태평양',
      },
    ]);
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
  const notice = (id: number) => ({
    id,
    title: `공지 ${id}`,
    body: `내용 ${id}`,
    startsAt: '2030-01-01T00:00:00.000Z',
    endsAt: '2030-01-02T00:00:00.000Z',
    createdAt: '2030-01-01T00:00:00.000Z',
  });
  const hello = (recentChat: ChatLine[]) => applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [], recentChat }, 0);

  it('hello의 전체·지역·길드 최근 대화와 공지로 시작하고, 새 줄은 room ?? local에 따라 분배한다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, {
      t: 'hello',
      you: 'me',
      others: [],
      recentChat: [line(1)],
      recentLocalChat: [line(2)],
      recentGuildChat: [line(3)],
      notices: [notice(10)],
    }, 0);
    expect(s.globalChat.map(l => l.id)).toEqual([1]);
    expect(s.localChat.map(l => l.id)).toEqual([2]);
    expect(s.guildChat.map(l => l.id)).toEqual([3]);
    expect(s.notices.map(n => n.id)).toEqual([10]);

    // room 생략 시 local에 들어간다
    s = applyLiveMessage(s, { t: 'chat', line: line(4) }, 1);
    expect(applyLiveMessage(s, { t: 'chat', line: line(4) }, 2)).toBe(s);
    expect(s.localChat.map(l => l.id)).toEqual([2, 4]);

    s = applyLiveMessage(s, { t: 'chat', room: 'global', line: line(5) }, 3);
    expect(s.globalChat.map(l => l.id)).toEqual([1, 5]);

    // 재연결의 hello는 목록을 서버 기준으로 바꾼다
    const reset = applyLiveMessage(s, { t: 'hello', you: 'me', others: [], recentChat: [line(9)] }, 4);
    expect(reset.globalChat.map(l => l.id)).toEqual([9]);
    expect(reset.localChat).toEqual([]);
    expect(reset.guildChat).toEqual([]);
    expect(reset.notices).toEqual([]);
  });

  it('localHistory와 notices를 받으면 해당 목록을 교체하고, noticesSynced는 hello/notices 수신 뒤에만 true가 된다', () => {
    expect(EMPTY_LIVE.noticesSynced).toBe(false);
    let s = hello([line(1)]);
    expect(s.noticesSynced).toBe(true);
    s = applyLiveMessage(s, { t: 'localHistory', region: 'seasia', lines: [line(10), line(11)] }, 1);
    expect(s.localChat.map(l => l.id)).toEqual([10, 11]);
    s = applyLiveMessage(EMPTY_LIVE, { t: 'notices', notices: [notice(1), notice(2)] }, 2);
    expect(s.notices.map(n => n.id)).toEqual([1, 2]);
    expect(s.noticesSynced).toBe(true);
  });

  it('보관 상한을 넘으면 오래된 줄부터 버린다', () => {
    let s = hello([]);
    for (let i = 1; i <= CHAT_KEEP + 2; i++) s = applyLiveMessage(s, { t: 'chat', room: 'global', line: line(i) }, i);
    expect(s.globalChat).toHaveLength(CHAT_KEEP);
    expect(s.globalChat[0].id).toBe(3);
  });

  it('오류는 마지막 하나만 남고, chat-global-cooldown이면 retryAfterMs로 쿨다운을 동기화하며, 내 채팅이 저장되면 지운다', () => {
    let s = applyLiveMessage(hello([]), { t: 'error', code: 'chat-global-cooldown', retryAfterMs: 7500 }, 1000);
    expect(s.chatError).toBe('chat-global-cooldown');
    expect(s.chatErrorRetryAfterMs).toBe(7500);
    expect(s.globalCooldownUntil).toBe(8500);
    s = applyLiveMessage(s, { t: 'chat', room: 'local', line: line(1, 'other') }, 2000);
    expect(s.chatError).toBe('chat-global-cooldown');
    s = applyLiveMessage(s, { t: 'chat', room: 'local', line: line(2, 'me') }, 3000);
    expect(s.chatError).toBeNull();
    expect(s.chatErrorRetryAfterMs).toBeNull();
  });

  it('전체 채팅 쿨다운은 본인 발신 global chat 확정 또는 chat-global-cooldown 오류로만 설정된다', () => {
    let s = hello([]);
    expect(s.globalCooldownUntil).toBe(0);

    // 다른 사람의 전체 채팅은 내 쿨다운을 건드리지 않는다
    s = applyLiveMessage(s, { t: 'chat', room: 'global', line: line(1, 'other') }, 1000);
    expect(s.globalCooldownUntil).toBe(0);

    // 내 지역·길드 채팅은 전체 쿨다운을 걸지 않는다
    s = applyLiveMessage(s, { t: 'chat', room: 'local', line: line(2, 'me') }, 1500);
    s = applyLiveMessage(s, { t: 'chat', room: 'guild', line: line(3, 'me') }, 1600);
    expect(s.globalCooldownUntil).toBe(0);

    // 중복·속도·길이·제한 오류는 전체 쿨다운을 걸지 않는다
    for (const code of ['chat-duplicate', 'chat-rate', 'chat-length', 'chat-restricted'] as const) {
      s = applyLiveMessage(s, { t: 'error', code }, 2000);
      expect(s.globalCooldownUntil).toBe(0);
    }

    // 본인 계정의 전체 채팅이 서버에서 돌아오면 10초 쿨다운이 설정된다
    s = applyLiveMessage(s, { t: 'chat', room: 'global', line: line(4, 'me') }, 3000);
    expect(s.globalCooldownUntil).toBe(3000 + GLOBAL_CHAT_COOLDOWN_MS);
  });

  it('withoutAuthor는 그 사람의 줄을 세 방에서 모두 지운다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, {
      t: 'hello',
      you: 'me',
      others: [],
      recentChat: [line(1, 'a'), line(2, 'b')],
      recentLocalChat: [line(3, 'a'), line(4, 'b')],
      recentGuildChat: [line(5, 'a')],
    }, 0);
    const cleaned = withoutAuthor(s, 'a');
    expect(cleaned.globalChat.map(l => l.id)).toEqual([2]);
    expect(cleaned.localChat.map(l => l.id)).toEqual([4]);
    expect(cleaned.guildChat).toEqual([]);
  });

  it('길드 채팅은 전체·지역 채팅과 따로 쌓고, hello의 길드 최근 대화로 시작한다', () => {
    let s = applyLiveMessage(EMPTY_LIVE, { t: 'hello', you: 'me', others: [], recentChat: [line(1)], recentGuildChat: [line(2)] }, 0);
    expect(s.guildChat.map(l => l.id)).toEqual([2]);
    s = applyLiveMessage(s, { t: 'error', code: 'chat-no-guild' }, 1);
    s = applyLiveMessage(s, { t: 'chat', room: 'guild', line: line(3, 'me') }, 2);
    expect(applyLiveMessage(s, { t: 'chat', room: 'guild', line: line(3, 'me') }, 3)).toBe(s);
    expect(s.globalChat.map(l => l.id)).toEqual([1]);
    expect(s.guildChat.map(l => l.id)).toEqual([2, 3]);
    expect(s.chatError).toBeNull();
    // 길드가 없는 연결의 hello는 길드 대화를 비운다
    expect(applyLiveMessage(s, { t: 'hello', you: 'me', others: [], recentChat: [] }, 4).guildChat).toEqual([]);
  });
});

describe('resolveLiveRegion', () => {
  it('거점과 바다 하위 존을 최상위 지역 ID로 정규화한다', () => {
    expect(resolveLiveRegion({ kind: 'region', id: 'village' }, null)).toBe('village');
    expect(resolveLiveRegion({ kind: 'base', id: 'home' }, null)).toBe('village');
    expect(resolveLiveRegion({ kind: 'base', id: 'harbor' }, null)).toBe('pacific');
    expect(resolveLiveRegion({ kind: 'base', id: 'manila' }, null)).toBe('seasia');
    expect(resolveLiveRegion({ kind: 'base', id: 'lisbon' }, null)).toBe('northatlantic');
    expect(resolveLiveRegion({ kind: 'region', id: 'world' }, 'deep')).toBe('pacific');
    expect(resolveLiveRegion({ kind: 'region', id: 'world' }, 'dragonhole')).toBe('seasia');
    expect(resolveLiveRegion({ kind: 'region', id: 'world' }, null)).toBe('pacific');
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
