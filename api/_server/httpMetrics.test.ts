// HTTP 지표 수집 미들웨어 단위·통합 테스트.
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpMetricIncrement } from '../_data/httpMetrics.js';
import { createHttpMetrics, kstDayOf, routeGroupOf } from './httpMetrics.js';

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

  it('Express 응답 완료 시 상태 코드(전체·426·429·5xx)를 경로 묶음별로 집계하고 stop 시 플러시한다', async () => {
    const persisted: HttpMetricIncrement[][] = [];
    const metrics = createHttpMetrics({
      flushIntervalMs: 60_000,
      now: () => Date.parse('2026-11-25T05:00:00.000Z'), // KST 2026-11-25 14:00
      persist: async rows => { persisted.push(rows); },
    });

    const app = express();
    app.use(metrics.middleware);
    app.get('/api/action', (_req, res) => { res.status(200).json({ ok: true }); });
    app.post('/api/action', (req, res) => {
      const code = Number(req.query.status ?? 200);
      res.status(code).json({ code });
    });
    app.post('/api/auth/sign-in/anonymous', (_req, res) => { res.status(429).json({ message: 'limited' }); });
    app.get('/api/me', (_req, res) => { res.status(503).json({ error: 'down' }); });
    app.get('/', (_req, res) => { res.status(200).send('ok'); });

    server = app.listen(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await fetch(`${base}/api/action`);
    await fetch(`${base}/api/action?status=426`, { method: 'POST' });
    await fetch(`${base}/api/action?status=429`, { method: 'POST' });
    await fetch(`${base}/api/action?status=500`, { method: 'POST' });
    await fetch(`${base}/api/auth/sign-in/anonymous`, { method: 'POST' });
    await fetch(`${base}/api/me`);
    await fetch(`${base}/`);

    await metrics.stop();

    expect(persisted).toHaveLength(1);
    const byGroup = new Map(persisted[0].map(r => [r.routeGroup, r]));
    expect(byGroup.get('action')).toEqual({
      day: '2026-11-25', routeGroup: 'action', total: 4, status426: 1, status429: 1, status5xx: 1,
    });
    expect(byGroup.get('auth')).toEqual({
      day: '2026-11-25', routeGroup: 'auth', total: 1, status426: 0, status429: 1, status5xx: 0,
    });
    expect(byGroup.get('api')).toEqual({
      day: '2026-11-25', routeGroup: 'api', total: 1, status426: 0, status429: 0, status5xx: 1,
    });
    expect(byGroup.get('web')).toEqual({
      day: '2026-11-25', routeGroup: 'web', total: 1, status426: 0, status429: 0, status5xx: 0,
    });
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
    expect(saved[0]).toEqual([{
      day: '2026-11-25', routeGroup: 'action', total: 3, status426: 1, status429: 1, status5xx: 1,
    }]);
  });

  it('버퍼가 비어 있으면 persist를 호출하지 않는다', async () => {
    const persist = vi.fn(async () => {});
    const metrics = createHttpMetrics({ flushIntervalMs: 60_000, persist });
    await metrics.flush();
    await metrics.stop();
    expect(persist).not.toHaveBeenCalled();
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
