import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { attachLive } from './live.js';
import type { LiveOptions, LiveServer } from './live.js';
import { LIVE_CLOSE_REPLACED, LIVE_CLOSE_RESTART, LIVE_MAX_PER_SEC, LIVE_PATH } from '../../src/game/rules/live.js';
import type { ServerMessage } from '../../src/game/rules/live.js';

const ORIGIN = 'https://game.test';
let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => { await cleanup?.(); cleanup = null; });

// 쿠키 값을 사용자 id로 쓰는 시험용 인증
async function start(extra: Partial<LiveOptions> = {}): Promise<{ url: string; live: LiveServer }> {
  const server = createServer();
  const live = attachLive(server, {
    origin: ORIGIN,
    authenticate: async (req) => req.headers.cookie ?? null,
    ...extra,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  cleanup = async () => { live.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); };
  return { url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}${LIVE_PATH}`, live };
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

  it('move는 보낸 사람을 뺀 연결에 uid를 붙여 전달하고, 형식이 틀린 메시지는 무시한다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    const b = connect(url, 'u2');
    await a.next(); await b.next();
    a.ws.send('{"t":"move","x":"bad"}');
    a.ws.send(JSON.stringify({ t: 'move', x: 3, y: 4, dir: 1, line: true }));
    expect(await b.next()).toEqual({ t: 'move', uid: 'u1', x: 3, y: 4, dir: 1, line: true });
    b.ws.send(JSON.stringify({ t: 'ping' }));
    b.ws.send(JSON.stringify({ t: 'move', x: 0, y: 0, dir: 0, line: false }));
    expect(await a.next()).toEqual({ t: 'move', uid: 'u2', x: 0, y: 0, dir: 0, line: false });
    expect(a.messages).toEqual([]);
  });

  it('같은 계정으로 다시 연결하면 이전 연결을 교체 코드로 닫는다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    await a.next();
    const a2 = connect(url, 'u1');
    await a2.next();
    expect(await a.closed).toBe(LIVE_CLOSE_REPLACED);
  });

  it('초당 상한을 넘게 보내면 연결을 끊는다', async () => {
    const { url } = await start();
    const a = connect(url, 'u1');
    await a.next();
    for (let i = 0; i <= LIVE_MAX_PER_SEC; i++) a.ws.send('{"t":"ping"}');
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
