// HTTP 지표 데이터 계층(버킷 백분위 추정·합산 upsert·조회 집계) 단위 테스트.
import { describe, expect, it, vi } from 'vitest';
import type { Executor } from '../_db/client.js';
import { estimateLatencyPercentiles, flushHttpMetrics, readHttpMetrics } from './httpMetrics.js';

describe('estimateLatencyPercentiles', () => {
  it('표본이 0건이면 null과 samples=0을 돌려준다', () => {
    expect(estimateLatencyPercentiles({
      le50: 0, le100: 0, le250: 0, le500: 0, le1000: 0, le2500: 0, gt2500: 0,
    }, 0)).toEqual({
      p50Ms: null, p95Ms: null, p99Ms: null, avgMs: null, samples: 0,
    });
  });

  it('버킷 상한 기반으로 p50·p95·p99·평균을 추정한다', () => {
    const out = estimateLatencyPercentiles({
      le50: 50, le100: 30, le250: 14, le500: 3, le1000: 2, le2500: 1, gt2500: 0,
    }, 10_000);
    expect(out).toEqual({
      p50Ms: 50,
      p95Ms: 500,
      p99Ms: 1000,
      avgMs: 100,
      samples: 100,
    });
  });

  it('2500ms 초과 버킷은 최소 2500으로 계산하되 avgMs가 더 크면 avgMs로 상한을 보정한다', () => {
    const withLowAvg = estimateLatencyPercentiles({
      le50: 94, le100: 0, le250: 0, le500: 0, le1000: 0, le2500: 0, gt2500: 6,
    }, 30_000);
    expect(withLowAvg).toEqual({
      p50Ms: 50,
      p95Ms: 2500,
      p99Ms: 2500,
      avgMs: 300,
      samples: 100,
    });

    const withHighAvg = estimateLatencyPercentiles({
      le50: 0, le100: 0, le250: 0, le500: 0, le1000: 0, le2500: 0, gt2500: 10,
    }, 42_000);
    expect(withHighAvg).toEqual({
      p50Ms: 4200,
      p95Ms: 4200,
      p99Ms: 4200,
      avgMs: 4200,
      samples: 10,
    });
  });
});

describe('flushHttpMetrics / readHttpMetrics', () => {
  it('선택 필드가 생략된 기존 형식 증분과 확장 필드를 함께 병합해 SQL로 전송한다', async () => {
    const execute = vi.fn(async (_query: unknown) => ({ rows: [] }));
    const db = { execute } as unknown as Executor;

    await flushHttpMetrics(db, [
      { day: '2026-11-26', routeGroup: 'action', total: 0, status426: 0, status429: 0, status5xx: 0 },
      { day: '2026-11-26', routeGroup: 'action', total: 10, status426: 1, status429: 2, status5xx: 0 },
      {
        day: '2026-11-26',
        routeGroup: 'action',
        total: 5,
        status409: 2,
        status426: 0,
        status429: 1,
        status4xx: 3,
        status5xx: 1,
        latencyBuckets: { le50: 3, le100: 1, gt2500: 1, sumMs: 3200 },
        rateLimitReasons: { catchTooSoon: 1 },
      },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    const queryChunks = execute.mock.calls[0]?.[0];
    const serialized = JSON.stringify(queryChunks).replaceAll('\\"', '"');
    expect(serialized).toContain('"total":15');
    expect(serialized).toContain('"status_409":2');
    expect(serialized).toContain('"status_426":1');
    expect(serialized).toContain('"status_429":3');
    expect(serialized).toContain('"status_4xx":3');
    expect(serialized).toContain('"status_5xx":1');
    expect(serialized).toContain('"lat_le_50":3');
    expect(serialized).toContain('"lat_le_100":1');
    expect(serialized).toContain('"lat_gt_2500":1');
    expect(serialized).toContain('"lat_sum_ms":3200');
    expect(serialized).toContain('"rl_catch_too_soon":1');
    expect(serialized).toContain('"rl_letter_gap":0');
    expect(serialized).toContain('"rl_other":0');
  });

  it('readHttpMetrics가 summary·daily·byRoute·rows에 409·4xx·지연 백분위·429 사유를 집계한다', async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          day: '2026-11-26', route_group: 'action',
          total: '100', status_409: '5', status_426: '1', status_429: '4', status_4xx: '10', status_5xx: '2',
          lat_le_50: '80', lat_le_100: '10', lat_le_250: '5', lat_le_500: '3', lat_le_1000: '2', lat_le_2500: '0', lat_gt_2500: '0',
          lat_sum_ms: '7500', rl_catch_too_soon: '3', rl_letter_gap: '1', rl_other: '0',
        },
        {
          day: '2026-11-25', route_group: 'api',
          total: '50', status_409: '0', status_426: '0', status_429: '1', status_4xx: '2', status_5xx: '0',
          lat_le_50: '40', lat_le_100: '10', lat_le_250: '0', lat_le_500: '0', lat_le_1000: '0', lat_le_2500: '0', lat_gt_2500: '0',
          lat_sum_ms: '1500', rl_catch_too_soon: '0', rl_letter_gap: '0', rl_other: '1',
        },
      ],
    }));
    const db = { execute } as unknown as Executor;
    const report = await readHttpMetrics(db, 7);

    expect(report.summary).toEqual({
      total: 150,
      status409: 5,
      status426: 1,
      status429: 5,
      status4xx: 12,
      status5xx: 2,
      rate409: 0.033333,
      rate426: 0.006667,
      rate429: 0.033333,
      rate4xx: 0.08,
      rate5xx: 0.013333,
      latency: { p50Ms: 50, p95Ms: 250, p99Ms: 1000, avgMs: 60, samples: 150 },
      rateLimitReasons: { catchTooSoon: 3, letterGap: 1, other: 1 },
    });
    expect(report.daily.map(d => d.day)).toEqual(['2026-11-25', '2026-11-26']);
    expect(report.byRoute.map(r => r.routeGroup)).toEqual(['action', 'api']);
    expect(report.rows[0]).toMatchObject({
      day: '2026-11-26',
      routeGroup: 'action',
      status409: 5,
      status4xx: 10,
      latencyBuckets: { le50: 80, le100: 10, le250: 5, le500: 3, le1000: 2, le2500: 0, gt2500: 0, sumMs: 7500 },
      rateLimitReasons: { catchTooSoon: 3, letterGap: 1, other: 0 },
    });
  });
});
