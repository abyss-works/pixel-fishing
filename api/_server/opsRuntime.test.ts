// 운영 관측 런타임 게터(async/sync) 및 다중 파드 지표 합산(aggregatePodMetrics) 단위 테스트.
import { afterEach, describe, expect, it } from 'vitest';
import {
  aggregatePodMetrics,
  provideRecentHttpSummary,
  provideRecentWsSnapshot,
  provideSlowRequests,
  recentHttpSummary,
  recentWsSnapshot,
  slowRequests,
} from './opsRuntime.js';
import type { PodMetricsSnapshot } from './realtimeBus.js';

describe('opsRuntime providers', () => {
  afterEach(() => {
    provideSlowRequests(() => []);
    provideRecentHttpSummary(() => null);
    provideRecentWsSnapshot(() => null);
  });

  it('동기·비동기 프로바이더를 모두 지원하고 Promise를 반환한다', async () => {
    provideSlowRequests(() => [
      { at: '2026-11-27T10:00:00.000Z', method: 'POST', routeGroup: 'action', path: '/api/action', statusCode: 200, durationMs: 620 },
    ]);
    await expect(slowRequests()).resolves.toHaveLength(1);

    provideSlowRequests(async () => [
      { at: '2026-11-27T10:01:00.000Z', method: 'GET', routeGroup: 'api', path: '/api/me', statusCode: 200, durationMs: 750 },
    ]);
    await expect(slowRequests()).resolves.toMatchObject([{ path: '/api/me', durationMs: 750 }]);

    provideRecentHttpSummary(async () => ({
      total: 10,
      status409: 1,
      status426: 0,
      status429: 0,
      status4xx: 1,
      status5xx: 0,
      rate409: 0.1,
      rate426: 0,
      rate429: 0,
      rate4xx: 0.1,
      rate5xx: 0,
      latency: { p50Ms: 50, p95Ms: 100, p99Ms: 100, avgMs: 45, samples: 10 },
      rateLimitReasons: { catchTooSoon: 0, letterGap: 0, other: 0 },
    }));
    await expect(recentHttpSummary()).resolves.toMatchObject({ total: 10, status409: 1 });

    provideRecentWsSnapshot(async () => ({
      upgradesOk: 5,
      reject401: 0,
      reject403: 0,
      reject500: 0,
      closeNormal: 2,
      closeAbnormal: 0,
      closeIdleTimeout: 1,
    }));
    await expect(recentWsSnapshot()).resolves.toMatchObject({ upgradesOk: 5, closeIdleTimeout: 1 });
  });
});

describe('aggregatePodMetrics', () => {
  it('빈 스냅샷 배열이면 null 지표와 빈 목록을 반환한다', () => {
    expect(aggregatePodMetrics([])).toEqual({
      http: null,
      ws: null,
      slowRequests: [],
      connections: 0,
      onlineUsers: 0,
    });
  });

  it('API 2파드 + WS 2파드 스냅샷을 합산하고 지연 백분위수와 슬로우 요청 순서를 재계산한다', () => {
    const snapshots: PodMetricsSnapshot[] = [
      {
        podId: 'api-1',
        updatedAt: '2026-11-27T10:00:00.000Z',
        http: {
          total: 100,
          status409: 2,
          status426: 1,
          status429: 3,
          status4xx: 6,
          status5xx: 1,
          latencyBuckets: { le50: 80, le100: 15, le250: 5, le500: 0, le1000: 0, le2500: 0, gt2500: 0, sumMs: 4500 },
          rateLimitReasons: { catchTooSoon: 2, letterGap: 1, other: 0 },
        },
        slowRequests: [
          { at: '2026-11-27T09:58:00.000Z', method: 'POST', routeGroup: 'action', path: '/api/action', statusCode: 200, durationMs: 650 },
          { at: '2026-11-27T09:59:30.000Z', method: 'GET', routeGroup: 'api', path: '/api/rank', statusCode: 200, durationMs: 820 },
        ],
      },
      {
        podId: 'api-2',
        updatedAt: '2026-11-27T10:00:01.000Z',
        http: {
          total: 100,
          status409: 0,
          status426: 1,
          status429: 1,
          status4xx: 4,
          status5xx: 3,
          latencyBuckets: { le50: 20, le100: 30, le250: 30, le500: 10, le1000: 5, le2500: 5, gt2500: 0, sumMs: 45500 },
          rateLimitReasons: { catchTooSoon: 0, letterGap: 0, other: 1 },
        },
        slowRequests: [
          { at: '2026-11-27T09:59:45.000Z', method: 'POST', routeGroup: 'action', path: '/api/action', statusCode: 500, durationMs: 1400 },
        ],
      },
      {
        podId: 'ws-1',
        updatedAt: '2026-11-27T10:00:00.000Z',
        connections: 12,
        onlineUsers: 10,
        ws: {
          upgradesOk: 20,
          reject401: 1,
          reject403: 0,
          reject500: 0,
          closeNormal: 8,
          closeAbnormal: 1,
          closeIdleTimeout: 2,
        },
      },
      {
        podId: 'ws-2',
        updatedAt: '2026-11-27T10:00:01.000Z',
        connections: 8,
        onlineUsers: 7,
        ws: {
          upgradesOk: 15,
          reject401: 0,
          reject403: 2,
          reject500: 1,
          closeNormal: 5,
          closeAbnormal: 2,
          closeIdleTimeout: 1,
        },
      },
    ];

    const agg = aggregatePodMetrics(snapshots, Date.parse('2026-11-27T10:00:30.000Z'));

    expect(agg.connections).toBe(20);
    expect(agg.onlineUsers).toBe(17);

    // HTTP 합산: total 200, status409 2, status426 2, status429 4, status4xx 10, status5xx 4
    // 버킷 합계: le50=100, le100=45, le250=35, le500=10, le1000=5, le2500=5, gt2500=0, sumMs=50000 (samples=200)
    // p50: rank=100 -> 50, p95: rank=190 -> cum(100+45+35+10=190) -> 500, p99: rank=198 -> 2500, avg=250
    expect(agg.http).toEqual({
      total: 200,
      status409: 2,
      status426: 2,
      status429: 4,
      status4xx: 10,
      status5xx: 4,
      rate409: 0.01,
      rate426: 0.01,
      rate429: 0.02,
      rate4xx: 0.05,
      rate5xx: 0.02,
      latency: { p50Ms: 50, p95Ms: 500, p99Ms: 2500, avgMs: 250, samples: 200 },
      rateLimitReasons: { catchTooSoon: 2, letterGap: 1, other: 1 },
    });

    expect(agg.ws).toEqual({
      upgradesOk: 35,
      reject401: 1,
      reject403: 2,
      reject500: 1,
      closeNormal: 13,
      closeAbnormal: 3,
      closeIdleTimeout: 3,
    });

    expect(agg.slowRequests.map(r => r.at)).toEqual([
      '2026-11-27T09:59:45.000Z',
      '2026-11-27T09:59:30.000Z',
      '2026-11-27T09:58:00.000Z',
    ]);
  });

  it('슬로우 요청은 최대 20건까지만 유지한다', () => {
    const mkSlow = (idx: number) => ({
      at: `2026-11-27T10:${String(idx).padStart(2, '0')}:00.000Z`,
      method: 'GET',
      routeGroup: 'api' as const,
      path: `/api/item/${idx}`,
      statusCode: 200,
      durationMs: 600 + idx,
    });
    const snapshots: PodMetricsSnapshot[] = [
      { podId: 'api-1', updatedAt: '2026-11-27T10:30:00.000Z', slowRequests: Array.from({ length: 15 }, (_, i) => mkSlow(i * 2)) },
      { podId: 'api-2', updatedAt: '2026-11-27T10:30:00.000Z', slowRequests: Array.from({ length: 15 }, (_, i) => mkSlow(i * 2 + 1)) },
    ];
    const agg = aggregatePodMetrics(snapshots, Date.parse('2026-11-27T10:30:30.000Z'));
    expect(agg.slowRequests).toHaveLength(20);
    expect(agg.slowRequests[0]?.path).toBe('/api/item/29');
    expect(agg.slowRequests[19]?.path).toBe('/api/item/10');
  });

  it('90초를 초과한 유령 파드와 유효하지 않은 updatedAt 항목을 합산에서 제외한다', () => {
    const nowMs = Date.parse('2026-11-28T02:00:00.000Z');
    const snapshots: PodMetricsSnapshot[] = [
      {
        podId: 'api-fresh',
        updatedAt: new Date(nowMs - 30_000).toISOString(),
        connections: 5,
        onlineUsers: 4,
        http: {
          total: 50,
          status409: 0,
          status426: 0,
          status429: 0,
          status4xx: 0,
          status5xx: 1,
          latencyBuckets: { le50: 40, le100: 10, le250: 0, le500: 0, le1000: 0, le2500: 0, gt2500: 0, sumMs: 2000 },
        },
      },
      {
        podId: 'api-boundary',
        updatedAt: new Date(nowMs - 90_000).toISOString(),
        connections: 3,
        onlineUsers: 2,
      },
      {
        podId: 'api-ghost',
        updatedAt: new Date(nowMs - 90_001).toISOString(),
        connections: 99,
        onlineUsers: 88,
        http: {
          total: 500,
          status5xx: 50,
          latencyBuckets: { le50: 0, le100: 0, le250: 0, le500: 0, le1000: 0, le2500: 0, gt2500: 500, sumMs: 1_500_000 },
        },
      },
      {
        podId: 'api-invalid-date',
        updatedAt: 'not-a-timestamp',
        connections: 77,
        onlineUsers: 66,
      },
    ];

    const agg = aggregatePodMetrics(snapshots, nowMs);
    expect(agg.connections).toBe(8);
    expect(agg.onlineUsers).toBe(6);
    expect(agg.http?.total).toBe(50);
    expect(agg.http?.status5xx).toBe(1);
    expect(agg.http?.latency).toEqual({ p50Ms: 50, p95Ms: 100, p99Ms: 100, avgMs: 40, samples: 50 });
  });
});
