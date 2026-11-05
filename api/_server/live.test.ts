// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { attachLive } from './live.js';
import type { LiveOptions, LiveServer } from './live.js';
import { CHAT_RATE_MAX, CHAT_RECENT, LIVE_CLOSE_REPLACED, LIVE_CLOSE_RESTART, LIVE_MAX_PER_SEC, LIVE_PATH } from '../../src/game/rules/live.js';
import type { ChatLine, ServerMessage } from '../../src/game/rules/live.js';

const ORIGIN = 'https://game.test';
let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => { await cleanup?.(); cleanup = null; });

// 이 개발 환경(Windows)의 소켓 바인드가 가끔 EFAULT로 실패하고, 실패는 짧게 몰려 온다.
// 그 오류만 간격을 늘려 가며 여섯 번까지 다시 연다
async function listen(server: Server): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 100 * attempt));
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
      });
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EFAULT' || attempt >= 6) throw e;
    }
  }
}

// 쿠키 값을 사용자 id로 쓰는 시험용 인증. 닉네임은 n-<id>, 배는 2다. 쿠키가 guest:로 시작하면 게스트다
// 채팅 저장소는 메모리 대역이다. restricted에 넣은 계정은 제재된 계정, blocks는 계정별 차단 목록이다
interface ChatFake { lines: ChatLine[]; restricted: Set<string>; blocks: Map<string, string[]> }

async function start(extra: Partial<LiveOptions> = {}): Promise<{ url: string; live: LiveServer; chat: ChatFake }> {
  const server = createServer();
  const chat: ChatFake = { lines: [], restricted: new Set(), blocks: new Map() };
  const live = attachLive(server, {
    origin: ORIGIN,
    authenticate: async (req) => {
      const cookie = req.headers.cookie;
      if (!cookie) return null;
      const guest = cookie.startsWith('guest:');
      const uid = guest ? cookie.slice('guest:'.length) : cookie;
      return { uid, nick: `n-${uid}`, boat: 2, guest };
    },
    chat: {
      save: async (user, text) => {
        if (chat.restricted.has(user.uid)) return null;
        const line = { id: chat.lines.length + 1, uid: user.uid, nick: user.nick, text, at: '2030-01-01T00:00:00.000Z' };
        chat.lines.push(line);
        return line;
      },
      recent: async (uid) => chat.lines.filter(l => !(chat.blocks.get(uid) ?? []).includes(l.uid)).slice(-CHAT_RECENT),
      blocked: async (uid) => chat.blocks.get(uid) ?? [],
    },
    ...extra,
  });
  await listen(server);
  cleanup = async () => { live.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); };
  return { url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}${LIVE_PATH}`, live, chat };
}

interface Client { ws: WebSocket; messages: ServerMessage[]; next: () => Promise<ServerMessage>; closed: Promise<number> }

function connect(url: string, uid: string | null, origin = ORIGIN): Client {
  const ws = new WebSocket(url, { headers: { origin, ...(uid ? { cookie: uid } : {}) } });
  const messages: ServerMessage[] = [];
  const waiters: ((m: ServerMessage) => void)[] = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as ServerMessage;
    const w = waiters.shift();
    if (w) w(m); else messages.push(m);
  });
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  ws.on('error', () => {});
  const next = () => new Promise<ServerMessage>((resolve) => {
    const m = messages.shift();
    if (m) resolve(m); else waiters.push(resolve);
  });
  return { ws, messages, next, closed };
}

const rejected = (url: string, uid: string | null, origin = ORIGIN) => new Promise<number>((resolve) => {
  const ws = new WebSocket(url, { headers: { origin, ...(uid ? { cookie: uid } : {}) } });
  ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
  ws.on('error', () => {});
});

describe('실시간 채널 서버', () => {
  it('세션이 없으면 401, Origin이 다르면 403으로 거부한다', async () => {
    const { url } = await start();
    expect(await rejected(url, null)).toBe(401);
    expect(await rejected(url, 'u1', 'https://evil.test')).toBe(403);
  });

  it('연결하면 hello에 자기 id를 받는다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    expect(await a.next()).toEqual({ t: 'hello', you: 'u1', others: [], recentChat: [] });
  });

  it('첫 위치는 join, 이후 위치는 move로 보낸 사람을 뺀 연결에 전달하고, 형식이 틀린 메시지는 무시한다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    a.ws.send('{"t":"move","x":"bad"}');
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 3, y: 4, dir: 1, line: false }));
    expect(await b.next()).toEqual({ t: 'join', presence: { uid: 'u1', nick: 'n-u1', boat: 2, region: 'sea', x: 3, y: 4, dir: 1, line: false } });
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 5, y: 4, dir: 1, line: true }));
    expect(await b.next()).toEqual({ t: 'move', uid: 'u1', region: 'sea', x: 5, y: 4, dir: 1, line: true });
    a.ws.send('{"t":"stop"}');
    expect(await b.next()).toEqual({ t: 'stop', uid: 'u1' });
    expect(a.messages).toEqual([]);
  });

  it('나중에 연결한 사람은 hello로 위치를 보낸 사람만 받고, 끊기면 leave가 간다', async () => {
    const { url, live } = await start();
    const a = connect(url, 'u1');
    const quiet = connect(url, 'u3');
    await a.next(); await quiet.next();
    a.ws.send(JSON.stringify({ t: 'move', region: 'deep', x: 1, y: 2, dir: 0, line: false }));
    expect((await quiet.next()).t).toBe('join');
    expect(live.presenceOf('u1')).toMatchObject({ region: 'deep', x: 1, y: 2 });
    expect(live.presenceOf('u3')).toBeNull();
    const b = connect(url, 'u2');
    expect(await b.next()).toEqual({ t: 'hello', you: 'u2', recentChat: [],
      others: [{ uid: 'u1', nick: 'n-u1', boat: 2, region: 'deep', x: 1, y: 2, dir: 0, line: false }] });
    a.ws.close();
    expect(await b.next()).toEqual({ t: 'leave', uid: 'u1' });
  });

  it('같은 계정으로 다시 연결하면 이전 연결을 교체 코드로 닫고 leave는 한 번만 간다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 0, y: 0, dir: 0, line: false }));
    expect((await b.next()).t).toBe('join');
    const a2 = connect(url, 'u1');
    await a2.next();
    expect(await a.closed).toBe(LIVE_CLOSE_REPLACED);
    expect(await b.next()).toEqual({ t: 'leave', uid: 'u1' });
    a2.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 1, y: 1, dir: 0, line: false }));
    expect((await b.next()).t).toBe('join');
  });

  it('초당 상한을 넘게 보내면 연결을 끊는다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    await a.next();
    // 상한의 세 배를 보낸다 — 부하로 처리가 느려져 1초 창이 넘어가도 한 창 안에서 상한을 넘는다
    for (let i = 0; i < LIVE_MAX_PER_SEC * 3; i++) a.ws.send('{"t":"ping"}');
    expect(await a.closed).toBe(1008);
  });

  it('무응답 시간이 지나면 연결을 정리한다', async () => {
    const { url } = await start({ sweepMs: 20, idleMs: 60 });
    const a = connect(url, 'u1');
    await a.next();
    expect(await a.closed).toBe(1006);
  });

  it('close는 열린 연결을 재시작 코드로 닫는다', async () => {
    const { url, live } = await start();
    const a = connect(url, 'u1');
    await a.next();
    live.close();
    expect(await a.closed).toBe(LIVE_CLOSE_RESTART);
  });
});

describe('실시간 채널 채팅', () => {
  const chat = (c: Client, text: string) => c.ws.send(JSON.stringify({ t: 'chat', text }));
  const lineOf = (id: number, uid: string, text: string): ServerMessage =>
    ({ t: 'chat', line: { id, uid, nick: `n-${uid}`, text, at: '2030-01-01T00:00:00.000Z' } });

  it('계정 유저의 채팅은 다듬어 저장한 뒤 보낸 사람을 포함한 모두에게 보낸다', async () => {
    const { url, chat: store } = await start();
    const a = connect(url, 'u1');
    const b = connect(url, 'guest:u2');
    await a.next(); await b.next();
    chat(a, '  안녕하세요  ');
    expect(await b.next()).toEqual(lineOf(1, 'u1', '안녕하세요'));
    expect(await a.next()).toEqual(lineOf(1, 'u1', '안녕하세요'));
    expect(store.lines).toHaveLength(1);
  });

  it('게스트·길이·제재 위반은 보낸 사람에게만 오류를 보내고 저장하지 않는다', async () => {
    const { url, chat: store } = await start();
    store.restricted.add('u3');
    const guest = connect(url, 'guest:g1');
    const a = connect(url, 'u1');
    const banned = connect(url, 'u3');
    const watcher = connect(url, 'u2');
    await guest.next(); await a.next(); await banned.next(); await watcher.next();
    chat(guest, '안녕');
    expect(await guest.next()).toEqual({ t: 'error', code: 'chat-guest' });
    chat(a, '   ');
    expect(await a.next()).toEqual({ t: 'error', code: 'chat-length' });
    chat(a, '가'.repeat(101));
    expect(await a.next()).toEqual({ t: 'error', code: 'chat-length' });
    chat(banned, '도배');
    expect(await banned.next()).toEqual({ t: 'error', code: 'chat-restricted' });
    chat(a, '정상');
    expect(await watcher.next()).toEqual(lineOf(1, 'u1', '정상'));
    expect(store.lines.map(l => l.text)).toEqual(['정상']);
  });

  it('10초 안에 25개를 넘게 보내면 chat-rate로 거부한다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    await a.next();
    // 초당 메시지 상한(15)을 넘지 않게 두 번에 나눠 보낸다
    const first = 13;
    for (let i = 0; i < first; i++) chat(a, `m${i}`);
    for (let i = 0; i < first; i++) expect((await a.next()).t).toBe('chat');
    await new Promise(r => setTimeout(r, 1100));
    for (let i = first; i <= CHAT_RATE_MAX; i++) chat(a, `m${i}`);
    // 거부는 저장을 기다리지 않아 저장된 줄보다 먼저 올 수 있다 — 순서 없이 센다
    const rest: ServerMessage[] = [];
    for (let i = first; i <= CHAT_RATE_MAX; i++) rest.push(await a.next());
    expect(rest.filter(m => m.t === 'chat')).toHaveLength(CHAT_RATE_MAX - first);
    expect(rest.filter(m => m.t === 'error')).toEqual([{ t: 'error', code: 'chat-rate' }]);
  });

  it('차단한 사람의 채팅은 그 수신자에게 보내지 않고, setBlocked로 목록이 바뀌면 바로 따른다', async () => {
    const { url, live, chat: store } = await start();
    store.blocks.set('u2', ['u1']);
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    const c = connect(url, 'u3');
    await a.next(); await b.next(); await c.next();
    chat(a, '하나');
    expect(await c.next()).toEqual(lineOf(1, 'u1', '하나'));
    live.setBlocked('u2', []);
    chat(a, '둘');
    expect(await c.next()).toEqual(lineOf(2, 'u1', '둘'));
    expect(await b.next()).toEqual(lineOf(2, 'u1', '둘'));
    live.setBlocked('u2', ['u1']);
    chat(a, '셋');
    chat(c, '넷');
    expect(await b.next()).toEqual(lineOf(4, 'u3', '넷'));
  });

  it('hello의 recentChat은 최근 대화를 싣고 내가 차단한 사람의 메시지는 뺀다', async () => {
    const { url, chat: store } = await start();
    store.lines.push(
      { id: 1, uid: 'u1', nick: 'n-u1', text: '하나', at: 'x' },
      { id: 2, uid: 'u3', nick: 'n-u3', text: '둘', at: 'x' },
    );
    store.blocks.set('u2', ['u3']);
    const b = connect(url, 'u2');
    expect(await b.next()).toEqual({ t: 'hello', you: 'u2', others: [], recentChat: [store.lines[0]] });
  });
});
