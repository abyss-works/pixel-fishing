// HTTP 지표 수집 미들웨어 단위·통합 테스트.
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpMetricIncrement } from '../_data/httpMetrics.js';
import { createHttpMetrics, kstDayOf, markRateLimitReason, routeGroupOf, sanitizeMetricPath } from './httpMetrics.js';

describe('routeGroupOf', () => {
  it('요청 경로를 action·auth·admin·api·web 5개 묶음으로 분류한다', () => {
    expect(routeGroupOf('/api/action')).toBe('action');
    expect(routeGroupOf('/api/action?ping=1')).toBe('action');
    expect(routeGroupOf('/api/auth/sign-in/anonymous')).toBe('auth');
    expect(routeGroupOf('/api/auth')).toBe('auth');
    expect(routeGroupOf('/api/admin?q=httpMetrics')).toBe('admin');
    expect(routeGroupOf('/api/admin/live')).toBe('admin');
    expect(routeGroupOf('/api/admin/auth/sign-in/social')).toBe('admin');
    expect(routeGroupOf('/api/me')).toBe('api');
    expect(routeGroupOf('/api/rank?board=fame')).toBe('api');
    expect(routeGroupOf('/api/guilds/123')).toBe('api');
    expect(routeGroupOf('/')).toBe('web');
    expect(routeGroupOf('/terms')).toBe('web');
    expect(routeGroupOf('/g/ABCD1234')).toBe('web');
    expect(routeGroupOf('/assets/index-abc.js')).toBe('web');
    expect(routeGroupOf('/api-docs')).toBe('web');
  });
});

describe('sanitizeMetricPath', () => {
  it('쿼리 문자열을 제거하고 UUID와 숫자 세그먼트를 :id로 정규화한다', () => {
    expect(sanitizeMetricPath('/api/players/550e8400-e29b-41d4-a716-446655440000?tab=profile')).toBe('/api/players/:id');
    expect(sanitizeMetricPath('/api/chat/messages/987654/reports?reason=spam')).toBe('/api/chat/messages/:id/reports');
    expect(sanitizeMetricPath('/api/friends/550E8400-E29B-41D4-A716-446655440000')).toBe('/api/friends/:id');
    expect(sanitizeMetricPath('/api/action?ping=1')).toBe('/api/action');
    expect(sanitizeMetricPath(undefined)).toBe('/');
  });
});

describe('kstDayOf', () => {
  it('UTC 시각을 KST(UTC+9) 날짜 문자열로 변환한다', () => {
    expect(kstDayOf(Date.parse('2026-11-25T14:59:59.000Z'))).toBe('2026-11-25');
    expect(kstDayOf(Date.parse('2026-11-25T15:00:00.000Z'))).toBe('2026-11-26');
  });
});

describe('createHttpMetrics 미들웨어', () => {
  let server: Server | null = null;
  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => { server!.close(() => resolve()); });
      server = null;
    }
  });

  it('Express 응답 완료 시 상태 코드(409·426·429·4xx·5xx)·429 사유·지연 버킷·슬로우 요청을 기록하고 플러시한다', async () => {
    const persisted: HttpMetricIncrement[][] = [];
    const metrics = createHttpMetrics({
      flushIntervalMs: 60_000,
      slowThresholdMs: 25,
      maxSlowRequests: 2,
      now: () => Date.parse('2026-11-25T05:00:00.000Z'),
      persist: async rows => { persisted.push(rows); },
    });

    const app = express();
    app.use(metrics.middleware);
    app.get('/api/action', (_req, res) => { res.status(200).json({ ok: true }); });
    app.post('/api/action', (req, res) => {
      const code = Number(req.query.status ?? 200);
      if (req.query.reason === 'catch-too-soon' || req.query.reason === 'letter-gap') {
        markRateLimitReason(res, req.query.reason);
      }
      res.status(code).json({ code });
    });
    app.get('/api/players/:uid', async (_req, res) => {
      await new Promise(r => setTimeout(r, 35));
      res.status(200).json({ ok: true });
    });
    app.post('/api/auth/sign-in/anonymous', (_req, res) => { res.status(429).json({ message: 'limited' }); });
    app.get('/api/me', (_req, res) => { res.status(503).json({ error: 'down' }); });
    app.get('/', (_req, res) => { res.status(200).send('ok'); });

    server = app.listen(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await fetch(`${base}/api/action`);
    await fetch(`${base}/api/action?status=409`, { method: 'POST' });
    await fetch(`${base}/api/action?status=426`, { method: 'POST' });
    await fetch(`${base}/api/action?status=429&reason=catch-too-soon`, { method: 'POST' });
    await fetch(`${base}/api/action?status=429&reason=letter-gap`, { method: 'POST' });
    await fetch(`${base}/api/action?status=500`, { method: 'POST' });
    await fetch(`${base}/api/auth/sign-in/anonymous`, { method: 'POST' });
    await fetch(`${base}/api/players/550e8400-e29b-41d4-a716-446655440000?secret=foo`);
    await fetch(`${base}/api/players/12345`);
    await fetch(`${base}/api/me`);
    await fetch(`${base}/`);

    const slow = metrics.slowRequests();
    expect(slow.length).toBeLessThanOrEqual(2);
    expect(slow[0]).toMatchObject({
      method: 'GET',
      routeGroup: 'api',
      path: '/api/players/:id',
      statusCode: 200,
    });
    expect(slow[0]?.durationMs).toBeGreaterThanOrEqual(25);
    expect(JSON.stringify(slow)).not.toContain('secret');
    expect(JSON.stringify(slow)).not.toContain('550e8400');

    await metrics.stop();

    expect(persisted).toHaveLength(1);
    const byGroup = new Map(persisted[0].map(r => [r.routeGroup, r]));
    expect(byGroup.get('action')).toMatchObject({
      day: '2026-11-25',
      routeGroup: 'action',
      total: 6,
      status409: 1,
      status426: 1,
      status429: 2,
      status4xx: 4,
      status5xx: 1,
      rateLimitReasons: { catchTooSoon: 1, letterGap: 1, other: 0 },
    });
    expect(byGroup.get('auth')).toMatchObject({
      day: '2026-11-25',
      routeGroup: 'auth',
      total: 1,
      status409: 0,
      status426: 0,
      status429: 1,
      status4xx: 1,
      status5xx: 0,
      rateLimitReasons: { catchTooSoon: 0, letterGap: 0, other: 1 },
    });
    expect(byGroup.get('api')).toMatchObject({
      day: '2026-11-25',
      routeGroup: 'api',
      total: 3,
      status5xx: 1,
    });
    expect(byGroup.get('web')).toMatchObject({
      day: '2026-11-25',
      routeGroup: 'web',
      total: 1,
      status5xx: 0,
    });
  });

  it('record가 지연 버킷 7종을 정확히 분류하고 recentWindowSummary는 flush 후에도 최근 창을 유지하며 만료한다', async () => {
    let nowMs = Date.parse('2026-11-25T05:00:00.000Z');
    const persisted: HttpMetricIncrement[][] = [];
    const metrics = createHttpMetrics({
      flushIntervalMs: 60_000,
      windowMs: 60_000,
      now: () => nowMs,
      persist: async rows => { persisted.push(rows); },
    });

    for (const ms of [10, 80, 200, 400, 800, 2000, 3000]) {
      metrics.record('/api/action', 200, { durationMs: ms });
    }
    await metrics.flush();
    expect(persisted[0]?.[0]?.latencyBuckets).toEqual({
      le50: 1, le100: 1, le250: 1, le500: 1, le1000: 1, le2500: 1, gt2500: 1, sumMs: 6490,
    });

    const recentAfterFlush = metrics.recentWindowSummary();
    expect(recentAfterFlush.total).toBe(7);
    expect(recentAfterFlush.latency.samples).toBe(7);
    expect(recentAfterFlush.latency.p95Ms).toBeGreaterThanOrEqual(2500);

    nowMs += 61_000;
    expect(metrics.recentWindowSummary().total).toBe(0);
    expect(metrics.recentWindowSummary().latency.samples).toBe(0);
    await metrics.stop();
  });

  it('저장 실패 시 집계분을 유실하지 않고 버퍼에 복구해 다음 플러시에 합산 전송한다', async () => {
    const onError = vi.fn();
    let shouldFail = true;
    const saved: HttpMetricIncrement[][] = [];
    const metrics = createHttpMetrics({
      flushIntervalMs: 60_000,
      now: () => Date.parse('2026-11-25T05:00:00.000Z'),
      persist: async rows => {
        if (shouldFail) throw new Error('db-down');
        saved.push(rows);
      },
      onError,
    });

    metrics.record('/api/action', 429);
    metrics.record('/api/action', 500);
    await metrics.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(0);

    shouldFail = false;
    metrics.record('/api/action', 426);
    await metrics.stop();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.[0]).toMatchObject({
      day: '2026-11-25',
      routeGroup: 'action',
      total: 3,
      status426: 1,
      status429: 1,
      status4xx: 2,
      status5xx: 1,
      rateLimitReasons: { catchTooSoon: 0, letterGap: 0, other: 1 },
    });
  });

  it('버퍼가 비어 있으면 persist를 호출하지 않는다', async () => {
    const persist = vi.fn(async () => {});
    const metrics = createHttpMetrics({ flushIntervalMs: 60_000, persist });
    await metrics.flush();
    await metrics.stop();
    expect(persist).not.toHaveBeenCalled();
  });

  it('동시 flush 호출이 대기 중 추가 기록과 겹쳐도 persist를 중첩 실행하지 않고 완료 시점까지 기다린다', async () => {
    const deferreds: Array<() => void> = [];
    let inFlightPersists = 0;
    let maxConcurrentPersists = 0;
    const batches: HttpMetricIncrement[][] = [];

    const metrics = createHttpMetrics({
      flushIntervalMs: 60_000,
      now: () => Date.parse('2026-11-25T05:00:00.000Z'),
      persist: async rows => {
        inFlightPersists += 1;
        maxConcurrentPersists = Math.max(maxConcurrentPersists, inFlightPersists);
        batches.push(rows);
        await new Promise<void>(resolve => { deferreds.push(resolve); });
        inFlightPersists -= 1;
      },
    });

    metrics.record('/api/action', 200);
    const flush1 = metrics.flush();
    expect(deferreds).toHaveLength(1);

    metrics.record('/api/action', 500);
    let flush2Settled = false;
    let flush3Settled = false;
    const flush2 = metrics.flush().then(() => { flush2Settled = true; });
    const flush3 = metrics.flush().then(() => { flush3Settled = true; });

    deferreds[0]();
    await flush1;
    await Promise.resolve();
    await Promise.resolve();

    expect(deferreds).toHaveLength(2);
    expect(flush2Settled).toBe(false);
    expect(flush3Settled).toBe(false);
    expect(maxConcurrentPersists).toBe(1);

    deferreds[1]();
    await Promise.all([flush2, flush3]);

    expect(flush2Settled).toBe(true);
    expect(flush3Settled).toBe(true);
    expect(maxConcurrentPersists).toBe(1);
    expect(batches).toHaveLength(2);
    expect(batches[0]?.[0]).toMatchObject({ day: '2026-11-25', routeGroup: 'action', total: 1, status5xx: 0 });
    expect(batches[1]?.[0]).toMatchObject({ day: '2026-11-25', routeGroup: 'action', total: 1, status5xx: 1 });
  });
});

describe('서버 진입점 HTTP 지표 등록', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

  it('httpMetrics 미들웨어를 stageGate 앞에 등록하고 SIGTERM에서 플러시한다', () => {
    const metricsIdx = main.indexOf('app.use(httpMetrics.middleware)');
    const gateIdx = main.indexOf('app.use(stageGate())');
    expect(metricsIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(metricsIdx);
    expect(main).toContain('httpMetrics.stop()');
  });
});
