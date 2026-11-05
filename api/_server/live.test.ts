// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { attachLive } from './live.js';
import type { LiveOptions, LiveServer } from './live.js';
import { LIVE_CLOSE_REPLACED, LIVE_CLOSE_RESTART, LIVE_MAX_PER_SEC, LIVE_PATH } from '../../src/game/rules/live.js';
import type { ServerMessage } from '../../src/game/rules/live.js';

const ORIGIN = 'https://game.test';
let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => { await cleanup?.(); cleanup = null; });

// 이 개발 환경(Windows)의 소켓 바인드가 가끔 EFAULT로 실패한다. 그 오류만 두 번까지 다시 연다
async function listen(server: Server): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
      });
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EFAULT' || attempt >= 2) throw e;
    }
  }
}

// 쿠키 값을 사용자 id로 쓰는 시험용 인증. 닉네임은 n-<id>, 배는 2다
async function start(extra: Partial<LiveOptions> = {}): Promise<{ url: string; live: LiveServer }> {
  const server = createServer();
  const live = attachLive(server, {
    origin: ORIGIN,
    authenticate: async (req) => {
      const uid = req.headers.cookie;
      return uid ? { uid, nick: `n-${uid}`, boat: 2 } : null;
    },
    ...extra,
  });
  await listen(server);
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
