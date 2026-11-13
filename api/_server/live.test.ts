// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { attachLive } from './live.js';
import type { LiveOptions, LiveServer } from './live.js';
import { CHAT_RATE_MAX, CHAT_RECENT, LIVE_CLOSE_OUTDATED, LIVE_CLOSE_REPLACED, LIVE_CLOSE_RESTART, LIVE_MAX_PER_SEC, LIVE_PATH } from '../../src/game/rules/live.js';
import type { ChatLine, ServerMessage } from '../../src/game/rules/live.js';

const ORIGIN = 'https://game.test';
// 시험 서버가 받아들이는 클라이언트 빌드 식별자
const BUILD = 'test-build';
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
// guilds는 계정별 소속 길드, guildLines는 길드별 채팅이다. 메시지 id는 두 방이 함께 센다
interface ChatFake {
  lines: ChatLine[]; restricted: Set<string>; blocks: Map<string, string[]>;
  guilds: Map<string, string>; guildLines: Map<string, ChatLine[]>;
}

/** 기록된 접속 세션 — 시각은 ISO 문자열이다 */
interface SessionRecord { uid: string; startedAt: string; endedAt: string }

async function start(extra: Partial<LiveOptions> = {}): Promise<{ url: string; urlFor: (build: string | null) => string; live: LiveServer; chat: ChatFake; sessions: SessionRecord[] }> {
  const server = createServer();
  const chat: ChatFake = { lines: [], restricted: new Set(), blocks: new Map(), guilds: new Map(), guildLines: new Map() };
  let seq = 0;
  const sessions: SessionRecord[] = [];
  const live = attachLive(server, {
    origin: ORIGIN,
    stale: ({ build }) => build !== BUILD,
    authenticate: async (req) => {
      const cookie = req.headers.cookie;
      if (!cookie) return null;
      const guest = cookie.startsWith('guest:');
      const uid = guest ? cookie.slice('guest:'.length) : cookie;
      return { uid, nick: `n-${uid}`, boat: 2, guest };
    },
    chat: {
      save: async (user, text, guild) => {
        if (chat.restricted.has(user.uid)) return null;
        if (guild !== null && chat.guilds.get(user.uid) !== guild) return null;
        const line = { id: ++seq, uid: user.uid, nick: user.nick, text, at: '2030-01-01T00:00:00.000Z' };
        if (guild === null) chat.lines.push(line);
        else chat.guildLines.set(guild, [...chat.guildLines.get(guild) ?? [], line]);
        return line;
      },
      recent: async (uid, _limit, guild) => (guild === null ? chat.lines : chat.guildLines.get(guild) ?? [])
        .filter(l => !(chat.blocks.get(uid) ?? []).includes(l.uid)).slice(-CHAT_RECENT),
      blocked: async (uid) => chat.blocks.get(uid) ?? [],
      guildOf: async (uid) => chat.guilds.get(uid) ?? null,
    },
    recordSession: (uid, startedAt, endedAt) => { sessions.push({ uid, startedAt, endedAt }); },
    savePosition: () => {},
    ...extra,
  });
  await listen(server);
  cleanup = async () => { live.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); };
  const base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}${LIVE_PATH}`;
  const urlFor = (build: string | null) => (build === null ? base : `${base}?build=${build}&version=0.0.0`);
  return { url: urlFor(BUILD), urlFor, live, chat, sessions };
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

  it('접속을 허용하지 않는 계정은 403으로 거부하고 허용하는 계정은 받는다', async () => {
    const { url, live } = await start({ admit: async (user) => user.uid !== 'held' });
    expect(await rejected(url, 'held')).toBe(403);
    expect(live.online()).toEqual([]);
    const ok = connect(url, 'u1');
    await ok.next();
    expect(live.online().map(o => o.uid)).toEqual(['u1']);
  });

  it('연결한 뒤 접속을 허용하지 않게 된 계정은 쓰기 메시지를 거부당하고 정책 위반 코드로 닫힌다', async () => {
    let held = false;
    const { url, live, chat } = await start({ admit: async () => !held });
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next();
    await b.next();
    a.ws.send(JSON.stringify({ t: 'chat', text: '첫 말' }));
    expect((await b.next()).t).toBe('chat');
    held = true;
    a.ws.send(JSON.stringify({ t: 'chat', text: '막힌 말' }));
    a.ws.send(JSON.stringify({ t: 'move', region: 'world', x: 1, y: 2, dir: 0, line: false }));
    expect(await a.closed).toBe(1008);
    expect(chat.lines.map(l => l.text)).toEqual(['첫 말']);
    expect(live.online().map(o => o.uid)).toEqual(['u2']);
    expect(b.messages.filter(m => m.t === 'chat' || m.t === 'move' || m.t === 'join')).toEqual([]);
  });

  it('클라이언트 빌드가 서버와 다르면 연결을 받지 않고 낡은 빌드 코드로 닫는다', async () => {
    const { urlFor, live, sessions } = await start();
    const ok = connect(urlFor(BUILD), 'u1');
    await ok.next();
    const old = connect(urlFor('old-build'), 'u2');
    expect(await old.closed).toBe(LIVE_CLOSE_OUTDATED);
    // 받지 않았으므로 hello도 접속 목록도 세션 기록도 없고, 다른 연결에는 아무것도 가지 않는다
    expect(old.messages).toEqual([]);
    expect(live.online().map(o => o.uid)).toEqual(['u1']);
    expect(sessions).toEqual([]);
    expect(ok.messages).toEqual([]);
  });

  it('낡은 빌드 연결이 잘못된 프레임을 보내도 서버는 죽지 않고 그 연결만 끊는다', async () => {
    const { url } = await start();
    const { port } = new URL(url);
    const request = ['GET /api/live?build=old HTTP/1.1', 'Host: x', `Origin: ${ORIGIN}`, 'Upgrade: websocket',
      'Connection: Upgrade', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13', '', ''].join('\r\n');
    // RSV1 비트가 켜진 프레임 — 수신기가 프로토콜 오류를 낸다
    const bad = Buffer.from([0xc1, 0x01, 0x41]);
    const ended = new Promise<void>((resolve) => {
      const s = tcpConnect(Number(port), '127.0.0.1', () => { s.write(Buffer.concat([Buffer.from(request), bad])); });
      s.on('data', () => {});
      s.on('error', () => resolve());
      s.on('close', () => resolve());
    });
    await ended;
    // 서버가 살아 있고 새 연결을 받는다
    const ok = connect(url, 'u1');
    expect((await ok.next()).t).toBe('hello');
  });

  it('빌드 식별자를 보내지 않은 연결도 낡은 빌드로 본다', async () => {
    const { urlFor } = await start();
    const old = connect(urlFor(null), 'u1');
    expect(await old.closed).toBe(LIVE_CLOSE_OUTDATED);
    expect(old.messages).toEqual([]);
  });

  it('빌드 검사는 인증보다 먼저다 — 세션이 없는 낡은 빌드도 낡은 빌드 코드로 닫힌다', async () => {
    const { urlFor } = await start();
    const old = connect(urlFor('old-build'), null);
    expect(await old.closed).toBe(LIVE_CLOSE_OUTDATED);
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
    expect(await b.next()).toEqual({ t: 'join', presence: { uid: 'u1', nick: 'n-u1', boat: 2, region: 'sea', zone: null, x: 3, y: 4, dir: 1, line: false } });
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 5, y: 4, dir: 1, line: true }));
    expect(await b.next()).toEqual({ t: 'move', uid: 'u1', region: 'sea', zone: null, x: 5, y: 4, dir: 1, line: true });
    a.ws.send('{"t":"stop"}');
    expect(await b.next()).toEqual({ t: 'stop', uid: 'u1' });
    expect(a.messages).toEqual([]);
  });

  it('방치 시간은 첫 결과 경과가 실린 move부터 센다. 줄을 거두거나 위치가 바뀌면 지우고, join과 hello에도 싣는다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    const at = (x: number, line: boolean, idleMs?: number) =>
      JSON.stringify({ t: 'move', region: 'sea', x, y: 4, dir: 1, line, ...(idleMs === undefined ? {} : { idleMs }) });
    a.ws.send(at(3, false));
    expect(await b.next()).not.toHaveProperty('presence.idleMs');
    a.ws.send(at(3, true)); // 던졌지만 첫 결과 전
    expect(await b.next()).not.toHaveProperty('idleMs');
    a.ws.send(at(3, true, 5000)); // 첫 결과가 5초 전에 나왔다
    const first = await b.next() as { idleMs: number };
    expect(first.idleMs).toBeGreaterThanOrEqual(5000);
    expect(first.idleMs).toBeLessThan(6000);
    await new Promise(r => setTimeout(r, 120));
    a.ws.send(at(3, true, 0)); // 같은 던짐에서 다시 보내도 처음 시각을 유지한다
    const kept = await b.next() as { idleMs: number };
    expect(kept.idleMs).toBeGreaterThanOrEqual(5100);
    const c = connect(url, 'u3');
    const hello = await c.next() as Extract<ServerMessage, { t: 'hello' }>;
    expect(hello.others[0].idleMs).toBeGreaterThanOrEqual(5100);
    expect(hello.others[0].idleMs).toBeLessThan(7000);
    a.ws.send(at(3, false)); // 줄을 거두면 지운다
    expect(await b.next()).not.toHaveProperty('idleMs');
    a.ws.send(at(3, true)); // 다시 던진 뒤 첫 결과 전에는 세지 않는다
    expect(await b.next()).not.toHaveProperty('idleMs');
    a.ws.send(at(3, true, 1000));
    expect((await b.next() as { idleMs: number }).idleMs).toBeGreaterThanOrEqual(1000);
    a.ws.send(at(4, true)); // 위치가 바뀌면 지운다
    expect(await b.next()).not.toHaveProperty('idleMs');
  });

  it('외형은 검사해 전하고, 외형이 없는 move는 직전 외형을 유지한다', async () => {
    const { url, live } = await start();
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    const look = { shirt: 3, pants: 4, hat: 'cap-red' };
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 1, y: 1, dir: 1, line: false, look }));
    expect(await b.next()).toMatchObject({ t: 'join', presence: { uid: 'u1', look } });
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 2, y: 1, dir: 1, line: false }));
    expect(await b.next()).toEqual({ t: 'move', uid: 'u1', region: 'sea', zone: null, x: 2, y: 1, dir: 1, line: false });
    expect(live.presenceOf('u1')?.look).toEqual(look);
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 2, y: 1, dir: 1, line: false, look: { shirt: 99, pants: 0, hat: null } }));
    expect(await b.next()).toMatchObject({ t: 'move', look: { shirt: 0, pants: 0, hat: null } });
    expect(live.presenceOf('u1')?.look).toEqual({ shirt: 0, pants: 0, hat: null });
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
      others: [{ uid: 'u1', nick: 'n-u1', boat: 2, region: 'deep', zone: null, x: 1, y: 2, dir: 0, line: false }] });
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

describe('실시간 채널 접속 목록과 세션 기록', () => {
  const until = async (ok: () => boolean) => { while (!ok()) await new Promise(r => setTimeout(r, 5)); };
  const isoOrdered = (s: SessionRecord) => Date.parse(s.startedAt) <= Date.parse(s.endedAt);

  it('online은 위치를 보내기 전의 연결도 지역·해역 없이 싣고, 위치를 보내면 지역과 해역을 싣는다', async () => {
    const { url, live } = await start();
    const before = Date.now();
    // online은 연결한 순서다. 인증은 비동기라 동시에 열면 순서가 바뀔 수 있어 차례로 연다
    const a = connect(url, 'u1');
    await a.next();
    const g = connect(url, 'guest:g1');
    await g.next();
    expect(live.online()).toEqual([
      { uid: 'u1', nick: 'n-u1', region: null, zone: null, connectedAt: expect.any(String), guest: false },
      { uid: 'g1', nick: 'n-g1', region: null, zone: null, connectedAt: expect.any(String), guest: true },
    ]);
    expect(Date.parse(live.online()[0].connectedAt)).toBeGreaterThanOrEqual(before - 1);
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', zone: 'pacific', x: 3, y: 4, dir: 1, line: false }));
    await until(() => live.online()[0].region !== null);
    expect(live.online()[0]).toMatchObject({ uid: 'u1', region: 'sea', zone: 'pacific' });
    a.ws.close();
    await until(() => live.online().length === 1);
    expect(live.online().map(o => o.uid)).toEqual(['g1']);
  });

  it('연결이 끝나면 연결 시각부터 끝난 시각까지를 세션 하나로 기록한다', async () => {
    const { url, sessions } = await start();
    const a = connect(url, 'u1');
    await a.next();
    expect(sessions).toEqual([]);
    a.ws.close();
    await until(() => sessions.length === 1);
    expect(sessions[0].uid).toBe('u1');
    expect(isoOrdered(sessions[0])).toBe(true);
  });

  it('같은 계정의 새 연결로 교체된 연결과 무응답으로 정리된 연결도 세션으로 기록한다', async () => {
    const { url, sessions } = await start({ sweepMs: 20, idleMs: 300 });
    const a = connect(url, 'u1');
    await a.next();
    const a2 = connect(url, 'u1');
    await a2.next();
    expect(await a.closed).toBe(LIVE_CLOSE_REPLACED);
    expect(sessions.map(s => s.uid)).toEqual(['u1']);
    // 교체한 새 연결은 아무것도 보내지 않아 정리된다
    expect(await a2.closed).toBe(1006);
    await until(() => sessions.length === 2);
    expect(sessions.every(isoOrdered)).toBe(true);
  });

  it('close는 닫기 응답을 기다리지 않고 열린 연결을 모두 바로 세션으로 기록한다', async () => {
    const { url, live, sessions } = await start();
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    live.close();
    expect(sessions.map(s => s.uid).sort()).toEqual(['u1', 'u2']);
    expect(live.online()).toEqual([]);
    expect(await a.closed).toBe(LIVE_CLOSE_RESTART);
    expect(sessions).toHaveLength(2);
  });
});

describe('실시간 채널 채팅', () => {
  const chat = (c: Client, text: string) => c.ws.send(JSON.stringify({ t: 'chat', text }));
  const lineOf = (id: number, uid: string, text: string): ServerMessage =>
    ({ t: 'chat', line: { id, uid, nick: `n-${uid}`, text, at: '2030-01-01T00:00:00.000Z' } });

  it('마지막 위치는 첫 위치에서 쓰고, 간격 안의 이동은 쓰지 않으며, 연결이 끝날 때 마지막 자리를 쓴다', async () => {
    const saved: Array<{ uid: string; region: string; x: number; y: number }> = [];
    const { url } = await start({ savePosition: (uid, pos) => { saved.push({ uid, ...pos }); } });
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 1, y: 2, dir: 0, line: false }));
    await b.next();
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 3, y: 4, dir: 0, line: false }));
    await b.next();
    expect(saved).toEqual([{ uid: 'u1', region: 'sea', x: 1, y: 2 }]);
    a.ws.close();
    await b.next(); // leave
    expect(saved).toEqual([{ uid: 'u1', region: 'sea', x: 1, y: 2 }, { uid: 'u1', region: 'sea', x: 3, y: 4 }]);
  });

  it('간격이 지나면 움직이는 동안에도 쓰고, 마지막으로 쓴 뒤 움직이지 않았으면 끊길 때 다시 쓰지 않는다', async () => {
    const saved: Array<{ x: number }> = [];
    const { url } = await start({ positionSaveMs: 30, savePosition: (_uid, pos) => { saved.push({ x: pos.x }); } });
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 1, y: 0, dir: 0, line: false }));
    await b.next();
    await new Promise(r => setTimeout(r, 40));
    a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 2, y: 0, dir: 0, line: false }));
    await b.next();
    expect(saved).toEqual([{ x: 1 }, { x: 2 }]);
    a.ws.close();
    await b.next(); // leave
    expect(saved).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('게스트의 위치는 간격이 지나도, 연결이 끊겨도 마지막 위치로 저장하지 않는다', async () => {
    const saved: unknown[] = [];
    const { url, sessions } = await start({ positionSaveMs: 0, savePosition: (_uid, pos) => { saved.push(pos); } });
    const g = connect(url, 'guest:g1');
    await g.next();
    g.ws.send(JSON.stringify({ t: 'move', region: 'village', x: 3, y: 4, dir: 1, line: false }));
    g.ws.send(JSON.stringify({ t: 'chat', text: '안녕' }));
    expect(await g.next()).toEqual({ t: 'error', code: 'chat-guest' });
    expect(saved).toEqual([]);
    g.ws.close();
    await g.closed;
    await vi.waitFor(() => expect(sessions).toHaveLength(1));
    expect(saved).toEqual([]);
  });

  it('위치를 보내지 않은 연결은 끝나도 마지막 위치를 쓰지 않는다', async () => {
    const saved: unknown[] = [];
    const { url, sessions } = await start({ savePosition: (_uid, pos) => { saved.push(pos); } });
    const a = connect(url, 'u1');
    await a.next();
    a.ws.close();
    await a.closed;
    await vi.waitFor(() => expect(sessions).toHaveLength(1));
    expect(saved).toEqual([]);
  });

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

  it('계정 유저의 입력 중 표시는 다른 사람에게만 가고, 게스트의 입력 중 표시는 보내지 않는다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    const g = connect(url, 'guest:u3');
    const b = connect(url, 'u2');
    await a.next(); await g.next(); await b.next();
    g.ws.send(JSON.stringify({ t: 'typing', on: true }));
    a.ws.send(JSON.stringify({ t: 'typing', on: true }));
    expect(await b.next()).toEqual({ t: 'typing', uid: 'u1', on: true });
    a.ws.send(JSON.stringify({ t: 'typing', on: false }));
    expect(await b.next()).toEqual({ t: 'typing', uid: 'u1', on: false });
    expect(a.messages).toEqual([]);
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

describe('실시간 채널 길드 채팅', () => {
  const guildChat = (c: Client, text: string) => c.ws.send(JSON.stringify({ t: 'chat', text, room: 'guild' }));
  const guildLine = (id: number, uid: string, text: string): ServerMessage =>
    ({ t: 'chat', room: 'guild', line: { id, uid, nick: `n-${uid}`, text, at: '2030-01-01T00:00:00.000Z' } });

  it('길드 채팅은 같은 길드의 접속한 길드원에게만 가고, 차단한 사람의 줄은 받지 않으며, 월드 채팅은 그대로 모두에게 간다', async () => {
    const { url, chat: store } = await start();
    store.guilds.set('u1', 'g1').set('u2', 'g1').set('u3', 'g2').set('u5', 'g1');
    store.blocks.set('u5', ['u1']);
    const [a, b, c, d, e] = ['u1', 'u2', 'u3', 'u4', 'u5'].map(uid => connect(url, uid));
    for (const x of [a, b, c, d, e]) await x.next();
    guildChat(a, '  길드 안녕  ');
    expect(await a.next()).toEqual(guildLine(1, 'u1', '길드 안녕'));
    expect(await b.next()).toEqual(guildLine(1, 'u1', '길드 안녕'));
    a.ws.send(JSON.stringify({ t: 'chat', text: '월드' }));
    const world = { t: 'chat', line: { id: 2, uid: 'u1', nick: 'n-u1', text: '월드', at: '2030-01-01T00:00:00.000Z' } };
    expect(await c.next()).toEqual(world);
    expect(await d.next()).toEqual(world);
    expect(await b.next()).toEqual(world);
    guildChat(b, '둘');
    expect(await e.next()).toEqual(guildLine(3, 'u2', '둘'));
    expect(store.guildLines.get('g1')?.map(l => l.text)).toEqual(['길드 안녕', '둘']);
  });

  it('길드가 없으면 chat-no-guild로 거부하고, setGuild로 소속이 바뀌면 바로 따른다', async () => {
    const { url, live, chat: store } = await start();
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    guildChat(a, '혼자');
    expect(await a.next()).toEqual({ t: 'error', code: 'chat-no-guild' });
    store.guilds.set('u1', 'g1').set('u2', 'g1');
    live.setGuild('u1', 'g1');
    live.setGuild('u2', 'g1');
    guildChat(a, '이제');
    expect(await b.next()).toEqual(guildLine(1, 'u1', '이제'));
    store.guilds.delete('u2');
    live.setGuild('u2', null);
    guildChat(a, '떠남');
    expect(await a.next()).toEqual(guildLine(1, 'u1', '이제'));
    expect(await a.next()).toEqual(guildLine(2, 'u1', '떠남'));
    guildChat(b, '나도');
    expect(await b.next()).toEqual({ t: 'error', code: 'chat-no-guild' });
  });

  it('hello는 길드원에게만 그 길드의 최근 대화를 싣고, 내가 차단한 사람의 줄은 뺀다', async () => {
    const { url, chat: store } = await start();
    const line = (id: number, uid: string) => ({ id, uid, nick: `n-${uid}`, text: `줄${id}`, at: 'x' });
    store.guildLines.set('g1', [line(1, 'u1'), line(2, 'u3')]);
    store.guilds.set('u2', 'g1');
    store.blocks.set('u2', ['u3']);
    const b = connect(url, 'u2');
    expect(await b.next()).toEqual({ t: 'hello', you: 'u2', others: [], recentChat: [], recentGuildChat: [line(1, 'u1')] });
    const c = connect(url, 'u4');
    expect(await c.next()).toEqual({ t: 'hello', you: 'u4', others: [], recentChat: [] });
  });

  it('게스트의 위치와 닉네임은 다른 연결에 보내지 않는다 — join, move, stop, leave 모두 없다', async () => {
    const { url, live } = await start();
    const a = connect(url, 'u1');
    await a.next();
    const g = connect(url, 'guest:g1');
    await g.next();
    g.ws.send(JSON.stringify({ t: 'move', region: 'village', x: 3, y: 4, dir: 1, line: false }));
    g.ws.send(JSON.stringify({ t: 'move', region: 'village', x: 5, y: 4, dir: 1, line: true }));
    g.ws.send('{"t":"stop"}');
    // 계정 연결의 첫 위치가 도착하는 시점에는 앞선 게스트의 메시지가 이미 처리됐다
    const b = connect(url, 'u2');
    await b.next();
    b.ws.send(JSON.stringify({ t: 'move', region: 'world', x: 1, y: 1, dir: 1, line: false }));
    expect((await a.next()).t).toBe('join');
    expect(a.messages).toEqual([]);
    expect(live.presenceOf('g1')).toBeNull();
    g.ws.close();
    await g.closed;
    b.ws.send(JSON.stringify({ t: 'move', region: 'world', x: 2, y: 1, dir: 1, line: false }));
    expect(await a.next()).toMatchObject({ t: 'move', uid: 'u2' });
    expect(a.messages).toEqual([]);
  });

  it('접속한 게스트는 새로 들어온 연결의 hello others에 들어가지 않는다', async () => {
    const { url } = await start();
    const g = connect(url, 'guest:g1');
    await g.next();
    g.ws.send(JSON.stringify({ t: 'move', region: 'village', x: 3, y: 4, dir: 1, line: false }));
    // 같은 연결의 메시지는 순서대로 처리되므로 채팅 거부 응답이 오면 앞선 move는 처리된 뒤다
    g.ws.send(JSON.stringify({ t: 'chat', text: '안녕' }));
    expect(await g.next()).toEqual({ t: 'error', code: 'chat-guest' });
    const a = connect(url, 'u1');
    const hello = await a.next();
    expect(hello).toMatchObject({ t: 'hello', you: 'u1', others: [] });
  });
});
