// 데스크톱 위젯 요약 조회(GET /api/widget/summary)·실시간 SSE 스트림(GET /api/widget/stream)·액션/실시간 훅 실제 Postgres 통합 테스트.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { LIVE_PATH } from '../../src/game/rules/live.js';
import { SNAPSHOT_EVERY } from '../../src/game/rules/balance.js';
import { WIDGET_MIN_CLIENT_VERSION } from '../../src/game/rules/widget.js';
import type { WidgetSummary } from '../../src/game/rules/widget.js';
import { createWidgetToken, sha256Hex } from '../_data/widget.js';
import { database } from '../_db/client.js';
import {
  callAction,
  fish,
  seedUser,
  startActionEnv,
  testUid,
  userToken,
} from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { attachLive } from '../_server/live.js';
import { provideIsUserOnline, providePresence } from '../_server/livePresence.js';
import { createWidgetHub, provideWidgetHub, widgetHub } from '../_server/widgetHub.js';
import { createWidgetAuthLogoutHandler } from './auth.js';
import { provideWidgetDisconnect } from './guard.js';
import widgetStreamHandler from './stream.js';
import widgetSummaryHandler from './summary.js';

let env: ActionEnv;
let nextUid = 9700;

beforeAll(async () => {
  env = await startActionEnv();
});

afterAll(async () => {
  await env?.stop();
});

afterEach(() => {
  delete process.env.WIDGET_API_ENABLED;
  process.env.DEPLOY_ENV = 'local';
  process.env.CONSENT_EFFECTIVE_DATE = '2099-12-31';
  provideIsUserOnline(() => false);
  providePresence(() => null);
  provideWidgetDisconnect(() => {});
  widgetHub().close();
  provideWidgetHub(createWidgetHub());
});

async function seedGoogleWidgetUser(opts: {
  admin?: boolean;
  restricted?: boolean;
  lastSpot?: string | null;
  lastCatchAt?: string;
  boat?: number;
  version?: number;
  location?: { kind: 'region'; id: 'village' | 'world' } | { kind: 'base'; id: 'home' | 'harbor' };
  bag?: ReturnType<typeof fish>[];
  exhibit?: ReturnType<typeof fish>[];
} = {}): Promise<{ uid: string; token: string }> {
  const uid = testUid(nextUid++);
  await seedUser(env.client, {
    uid,
    email: `widget-stream-${uid.slice(-6)}@gmail.test`,
    nickname: `위젯유저-${uid.slice(-4)}`,
    admin: opts.admin,
    restricted: opts.restricted,
    version: opts.version ?? 2,
    lastCatchAt: opts.lastCatchAt,
    state: {
      boat: opts.boat ?? 2,
      location: opts.location ?? { kind: 'region', id: 'world' },
      bag: opts.bag ?? [],
      exhibit: opts.exhibit ?? [],
    },
  });
  await env.client.query(
    `insert into auth.accounts (user_id, account_id, provider_id) values ($1::uuid, $2, 'google')`,
    [uid, `google-sub-${uid}`],
  );
  if (opts.lastSpot !== undefined) {
    await env.client.query('update public.saves_current set last_spot = $2 where user_id = $1', [uid, opts.lastSpot]);
  }
  const rawToken = `tok-${uid}`;
  await createWidgetToken(database().db, {
    tokenHash: sha256Hex(rawToken),
    userId: uid,
    clientVersion: WIDGET_MIN_CLIENT_VERSION,
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  return { uid, token: rawToken };
}

const widgetHeaders = (token?: string, version = WIDGET_MIN_CLIENT_VERSION): Record<string, string> => ({
  'x-widget-client': 'desktop',
  'x-widget-version': version,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

async function runMockSummary(opts: { method?: string; headers?: Record<string, string> }) {
  const out: { status: number; body: unknown; headers: Record<string, string> } = {
    status: 200,
    body: undefined,
    headers: {},
  };
  const res = {
    statusCode: 200,
    setHeader(k: string, v: string | number | readonly string[]) {
      out.headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
    },
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; },
    end() {},
  };
  await widgetSummaryHandler({ method: opts.method ?? 'GET', headers: opts.headers ?? {} } as never, res as never);
  return out;
}

interface ParsedSseFrame {
  id: string | null;
  event: string;
  data: unknown;
}

async function openSseStream(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers });
  const body = response.body;
  if (!body) throw new Error('응답 스트림이 없습니다');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const frames: ParsedSseFrame[] = [];
  const comments: string[] = [];

  const pumpUntil = async (predicate: () => boolean, timeoutMs = 4000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`SSE 대기 시간 초과 (frames=${JSON.stringify(frames)}, comments=${JSON.stringify(comments)})`);
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SSE read timeout')), remaining)),
      ]);
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true }).replaceAll('\r\n', '\n');
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let id: string | null = null;
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith(':')) {
            comments.push(line.slice(1).trim());
            continue;
          }
          const idx = line.indexOf(':');
          const key = idx === -1 ? line : line.slice(0, idx);
          const val = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
          if (key === 'id') id = val;
          else if (key === 'event') event = val;
          else if (key === 'data') dataLines.push(val);
        }
        if (dataLines.length > 0) {
          frames.push({ id, event, data: JSON.parse(dataLines.join('\n')) });
        }
        sep = buffer.indexOf('\n\n');
      }
    }
  };

  return {
    response,
    frames,
    comments,
    pumpUntil,
    waitDone: async (timeoutMs = 3000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const next = await Promise.race([
          reader.read(),
          new Promise<{ done: true; value: undefined }>(resolve => setTimeout(() => resolve({ done: true, value: undefined }), 1000)),
        ]);
        if (next.done) return true;
      }
      return false;
    },
    close: async () => { await reader.cancel().catch(() => {}); },
  };
}

async function startWidgetHttpServer() {
  provideWidgetHub(createWidgetHub());
  provideWidgetDisconnect(uid => widgetHub().disconnectUser(uid));

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const wrappedRes = Object.assign(res, {
      status(code: number) { res.statusCode = code; return wrappedRes; },
      json(body: unknown) {
        if (!res.hasHeader('content-type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
      },
    });
    if (path === '/api/widget/summary') {
      void widgetSummaryHandler(req, wrappedRes as never);
      return;
    }
    if (path === '/api/widget/stream') {
      void widgetStreamHandler(req, wrappedRes as never);
      return;
    }
    if (path === '/api/widget/auth/logout') {
      const logout = createWidgetAuthLogoutHandler();
      void logout(req as never, wrappedRes as never);
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const live = attachLive(server, {
    origin: 'http://127.0.0.1',
    stale: () => false,
    authenticate: async req => {
      const uid = req.headers['x-test-uid'];
      if (typeof uid !== 'string') return null;
      return { uid, nick: '테스터', boat: 2, fame: 0, guest: false };
    },
    chat: {
      save: async () => null,
      recent: async () => [],
      blocked: async () => [],
      guildOf: async () => null,
    },
    recordSession: () => {},
    savePosition: () => {},
    onUserDisconnect: uid => {
      if (widgetHub().hasSubscribers(uid)) {
        widgetHub().publishStatusChanged(uid, 'idle');
      }
    },
  });
  provideIsUserOnline(uid => live.isOnline(uid));
  providePresence(uid => live.presenceOf(uid));

  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}${LIVE_PATH}`;

  const stop = async () => {
    live.close();
    widgetHub().close();
    server.closeAllConnections();
    await new Promise<void>(resolve => { server.close(() => resolve()); });
  };

  return { baseUrl, wsUrl, live, stop };
}

describe('GET /api/widget/summary & GET /api/widget/stream', () => {
  it('요약 조회는 가방(전시 제외)·최근 포획 4건·해역·active/idle 판정을 정확히 반환한다', async () => {
    const recentIso = new Date(Date.now() - 10_000).toISOString();
    const { uid, token } = await seedGoogleWidgetUser({
      lastSpot: 'deep',
      lastCatchAt: recentIso,
      boat: 2, // bagCap 300
      location: { kind: 'region', id: 'world' },
      bag: [fish('crucian'), fish('carp')],
      exhibit: [fish('goldfish')],
    });

    for (let i = 1; i <= 5; i += 1) {
      await env.client.query(
        `insert into public.events (user_id, type, payload, created_at)
         values ($1, 'catch', $2::jsonb, $3)`,
        [
          uid,
          JSON.stringify({
            fishId: i === 5 ? 'carp' : 'crucian',
            form: i === 5 ? 'variant' : 'normal',
            size: 20 + i,
            isBig: i === 5,
            spot: 'deep',
          }),
          new Date(Date.now() - (6 - i) * 1000).toISOString(),
        ],
      );
    }

    provideIsUserOnline(id => id === uid);
    const activeRes = await runMockSummary({ headers: widgetHeaders(token) });
    expect(activeRes.status).toBe(200);
    expect(activeRes.headers['cache-control']).toBe('no-store');
    const summary = activeRes.body as WidgetSummary;
    expect(summary).toMatchObject({
      authState: 'authenticated',
      connectionState: 'connected',
      fishingState: 'active',
      spotId: 'deep',
      spotName: '마리아나 해구',
      seaTheme: 'deep',
      bag: { count: 2, cap: 300, percent: 0 },
    });
    expect(summary.recentCatches).toHaveLength(4);
    expect(summary.recentCatches[0]).toMatchObject({
      spriteKey: 'carp',
      isBig: true,
      isMutant: true,
    });
    expect(summary.recentCatches[0].fallbackColors).toBeDefined();
    expect(summary.lastEventId).toBe(summary.recentCatches[0].eventId);
    expect(typeof summary.gameHour).toBe('number');

    // 오프라인이면 idle
    provideIsUserOnline(() => false);
    const offlineRes = await runMockSummary({ headers: widgetHeaders(token) });
    expect((offlineRes.body as WidgetSummary).fishingState).toBe('idle');

    // 온라인이라도 90초 초과면 idle
    provideIsUserOnline(() => true);
    await env.client.query(
      'update public.saves_current set last_catch_at = $2 where user_id = $1',
      [uid, new Date(Date.now() - 95_000).toISOString()],
    );
    const timeoutRes = await runMockSummary({ headers: widgetHeaders(token) });
    expect((timeoutRes.body as WidgetSummary).fishingState).toBe('idle');

    // 최근 포획이라도 거점(harbor) 안에 있으면 idle
    await env.client.query(
      `update public.saves_current
       set last_catch_at = $2, data = jsonb_set(data, '{location}', '{"kind":"base","id":"harbor"}'::jsonb)
       where user_id = $1`,
      [uid, new Date(Date.now() - 5_000).toISOString()],
    );
    const baseRes = await runMockSummary({ headers: widgetHeaders(token) });
    expect((baseRes.body as WidgetSummary).fishingState).toBe('idle');
  });

  it('메서드(405)·클라이언트 버전(426)·토큰(401)·preview 비관리자(403)·production 비활성화(404)를 차단한다', async () => {
    const member = await seedGoogleWidgetUser({ admin: false });
    const admin = await seedGoogleWidgetUser({ admin: true });

    expect((await runMockSummary({ method: 'POST', headers: widgetHeaders(member.token) })).status).toBe(405);
    expect((await runMockSummary({ headers: widgetHeaders(member.token, '0.0.1') })).status).toBe(426);
    expect((await runMockSummary({ headers: widgetHeaders('invalid-tok') })).status).toBe(401);

    process.env.DEPLOY_ENV = 'preview';
    expect(await runMockSummary({ headers: widgetHeaders(member.token) })).toMatchObject({
      status: 403,
      body: { error: 'unsupported-account' },
    });
    expect((await runMockSummary({ headers: widgetHeaders(admin.token) })).status).toBe(200);

    process.env.DEPLOY_ENV = 'production';
    delete process.env.WIDGET_API_ENABLED;
    expect((await runMockSummary({ headers: widgetHeaders(admin.token) })).status).toBe(404);
  });

  it('실제 HTTP SSE 스트림으로 connected + summary_sync -> catch(last_spot·isBig 포함) -> bag_sync -> status_changed -> WS/로그아웃 종료를 검증한다', async () => {
    const srv = await startWidgetHttpServer();
    try {
      const { uid, token } = await seedGoogleWidgetUser({
        boat: 2,
        location: { kind: 'region', id: 'village' },
        lastSpot: null,
      });

      // production 게이트 및 426 확인
      process.env.DEPLOY_ENV = 'production';
      const prodStream = await fetch(`${srv.baseUrl}/api/widget/stream`, { headers: widgetHeaders(token) });
      expect(prodStream.status).toBe(404);
      process.env.DEPLOY_ENV = 'local';

      const verStream = await fetch(`${srv.baseUrl}/api/widget/stream`, { headers: widgetHeaders(token, '0.0.1') });
      expect(verStream.status).toBe(426);

      // 실시간 WS 연결 후 SSE 구독 시작
      const ws = new WebSocket(srv.wsUrl, { headers: { origin: 'http://127.0.0.1', 'x-test-uid': uid } });
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      const sse = await openSseStream(`${srv.baseUrl}/api/widget/stream`, widgetHeaders(token));
      try {
        expect(sse.response.status).toBe(200);
        expect(sse.response.headers.get('content-type')).toContain('text/event-stream');
        expect(sse.response.headers.get('cache-control')).toBe('no-cache, no-transform');
        expect(sse.response.headers.get('x-accel-buffering')).toBe('no');

        await sse.pumpUntil(() => sse.frames.some(f => f.event === 'summary_sync'));
        expect(sse.comments).toContain('connected');
        const syncFrame = sse.frames.find(f => f.event === 'summary_sync')!;
        expect((syncFrame.data as WidgetSummary).authState).toBe('authenticated');

        // 1) fast-path catch -> last_spot 갱신, catch 이벤트에 isBig 포함, SSE catch 이벤트 수신
        const catchRes = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' });
        expect(catchRes.status).toBe(200);

        await sse.pumpUntil(() => sse.frames.some(f => f.event === 'catch'));
        const catchFrame = sse.frames.find(f => f.event === 'catch')!;
        expect(catchFrame.id).toBeTruthy();
        expect(catchFrame.data).toMatchObject({
          type: 'catch',
          spotId: 'pond',
          spotName: '마을 연못',
          seaTheme: 'deep',
          fishingState: 'active',
          bag: { count: 1, cap: 300 },
        });

        const sseCatchEventId = (catchFrame.data as { catchItem: { eventId: string } }).catchItem.eventId;
        const summaryAfterCatchRes = await fetch(`${srv.baseUrl}/api/widget/summary`, {
          headers: widgetHeaders(token),
        });
        expect(summaryAfterCatchRes.status).toBe(200);
        const summaryAfterCatch = (await summaryAfterCatchRes.json()) as WidgetSummary;
        expect(summaryAfterCatch.recentCatches[0]?.eventId).toBe(sseCatchEventId);
        expect(summaryAfterCatch.lastEventId).toBe(sseCatchEventId);

        const { rows: [saveAfterCatch] } = await env.client.query<{ last_spot: string | null }>(
          'select last_spot from public.saves_current where user_id = $1',
          [uid],
        );
        expect(saveAfterCatch.last_spot).toBe('pond');

        const { rows: [catchEventRow] } = await env.client.query<{ payload: Record<string, unknown> }>(
          `select payload from public.events where user_id = $1 and type = 'catch' order by id desc limit 1`,
          [uid],
        );
        expect(typeof catchEventRow.payload.isBig).toBe('boolean');

        // 2) 스냅샷 경계(리듀서 경로)에서도 last_spot 갱신 확인
        await env.client.query(
          `update public.saves_current set version = $2, last_catch_at = '2026-01-01T00:00:00Z' where user_id = $1`,
          [uid, SNAPSHOT_EVERY - 1],
        );
        const fullCatchRes = await callAction(userToken(uid), { type: 'catch', spot: 'river', judgment: 'good' });
        expect(fullCatchRes.status).toBe(200);
        await sse.pumpUntil(() => sse.frames.filter(f => f.event === 'catch').length >= 2);
        const { rows: [saveAfterFull] } = await env.client.query<{ last_spot: string | null }>(
          'select last_spot from public.saves_current where user_id = $1',
          [uid],
        );
        expect(saveAfterFull.last_spot).toBe('river');

        // 3) sell -> bag_sync
        const { rows: [instRow] } = await env.client.query<{ uid: string }>(
          'select uid from public.fish_instances where user_id = $1 limit 1',
          [uid],
        );
        const sellRes = await callAction(userToken(uid), { type: 'sell', uids: [instRow.uid] });
        expect(sellRes.status).toBe(200);
        await sse.pumpUntil(() => sse.frames.some(f => f.event === 'bag_sync'));
        const bagFrame = sse.frames.find(f => f.event === 'bag_sync')!;
        expect(bagFrame.data).toMatchObject({ type: 'bag_sync', bag: { count: 1, cap: 300 } });

        // 4) travel -> harbor base -> status_changed: idle
        const travelRes = await callAction(userToken(uid), { type: 'travel', to: { kind: 'base', id: 'harbor' } });
        expect(travelRes.status).toBe(200);
        await sse.pumpUntil(() => sse.frames.some(f => f.event === 'status_changed'));
        expect(sse.frames.find(f => f.event === 'status_changed')?.data).toMatchObject({
          type: 'status_changed',
          fishingState: 'idle',
        });

        // 5) WS 연결 종료 -> status_changed: idle 추가 발행
        const statusCountBeforeClose = sse.frames.filter(f => f.event === 'status_changed').length;
        ws.close();
        await sse.pumpUntil(() => sse.frames.filter(f => f.event === 'status_changed').length > statusCountBeforeClose);

        // 6) 로그아웃 -> SSE 연결 즉시 종료
        const logoutRes = await fetch(`${srv.baseUrl}/api/widget/auth/logout`, {
          method: 'POST',
          headers: widgetHeaders(token),
        });
        expect(logoutRes.status).toBe(200);
        expect(await sse.waitDone()).toBe(true);
      } finally {
        await sse.close();
        ws.close();
      }
    } finally {
      await srv.stop();
    }
  });
});
