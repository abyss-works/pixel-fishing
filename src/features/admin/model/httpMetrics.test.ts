import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminHttpMetrics } from './types';
import { formatErrorRate, formatLatencyMs, HTTP_SCOPE_NOTICE, selectHttpMetricsView } from './httpMetrics';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-05T03:00:00Z')); // 2026-11-05 KST
});
afterEach(() => vi.useRealTimers());

const sample = (over: Partial<AdminHttpMetrics> = {}): AdminHttpMetrics => ({
  days: 7,
  scope: 'app_server',
  summary: {
    total: 1000,
    status426: 5,
    status429: 25,
    status5xx: 10,
    rate426: 0.005,
    rate429: 0.025,
    rate5xx: 0.01,
  },
  daily: [
    { day: '2026-11-03', total: 400, status426: 2, status429: 10, status5xx: 4, rate426: 0.005, rate429: 0.025, rate5xx: 0.01 },
    { day: '2026-11-05', total: 600, status426: 3, status429: 15, status5xx: 6, rate426: 0.005, rate429: 0.025, rate5xx: 0.01 },
  ],
  byRoute: [
    { routeGroup: 'action', total: 800, status426: 4, status429: 20, status5xx: 8, rate426: 0.005, rate429: 0.025, rate5xx: 0.01 },
    { routeGroup: 'web', total: 200, status426: 1, status429: 5, status5xx: 2, rate426: 0.005, rate429: 0.025, rate5xx: 0.01 },
  ],
  rows: [
    { day: '2026-11-05', routeGroup: 'action', total: 600, status426: 3, status429: 15, status5xx: 6 },
  ],
  ...over,
});

describe('httpMetrics 모델', () => {
  it('오류율(0~1)을 소수 둘째 자리 퍼센트 문자열로 포맷한다', () => {
    expect(formatErrorRate(0)).toBe('0%');
    expect(formatErrorRate(0.01)).toBe('1%');
    expect(formatErrorRate(0.005)).toBe('0.5%');
    expect(formatErrorRate(0.0125)).toBe('1.25%');
    expect(formatErrorRate(null)).toBe('--');
    expect(formatErrorRate(Number.NaN)).toBe('--');
    expect(formatErrorRate(Number.POSITIVE_INFINITY)).toBe('--');
  });

  it('요약·경로 묶음·일별 날짜 축(미집계 날 NaN 보존)을 계산하고 scope 안내를 제공한다', () => {
    expect(HTTP_SCOPE_NOTICE).toContain('ingress-nginx');
    const view = selectHttpMetricsView(sample(), 7);
    expect(view.summary).toMatchObject({
      total: 1000,
      status426: 5,
      status429: 25,
      status5xx: 10,
      errorTotal: 40,
      rate426Text: '0.5%',
      rate429Text: '2.5%',
      rate5xxText: '1%',
      errorRateText: '4%',
    });
    expect(view.byRoute[0]).toMatchObject({
      routeGroup: 'action',
      label: '게임 액션',
      rate429Text: '2.5%',
      rate5xxText: '1%',
    });
    expect(view.series.labels).toHaveLength(7);
    expect(view.series.collected).toBe(2);
    // 2026-11-04는 미집계라 NaN 유지
    expect(Number.isNaN(view.series.status429[5])).toBe(true);
    expect(view.series.status429[6]).toBe(15);
    expect(view.series.status5xx[6]).toBe(6);
  });

  it('데이터가 null이면 빈 요약과 전체 미집계 날짜 축을 반환한다', () => {
    const view = selectHttpMetricsView(null, 7);
    expect(view.summary.total).toBeNull();
    expect(view.summary).toMatchObject({
      rate409Text: '--',
      rate426Text: '--',
      rate429Text: '--',
      rate4xxText: '--',
      rate5xxText: '--',
      errorRateText: '--',
      latency: { p50Text: '--', p95Text: '--', p99Text: '--', avgText: '--', samples: 0 },
    });
    expect(view.series.collected).toBe(0);
    expect(view.series.labels).toHaveLength(7);
  });

  it('지연 시간(ms)을 정수 문자열 또는 빈 표기(--)로 포맷한다', () => {
    expect(formatLatencyMs(0)).toBe('0ms');
    expect(formatLatencyMs(42)).toBe('42ms');
    expect(formatLatencyMs(42.6)).toBe('43ms');
    expect(formatLatencyMs(null)).toBe('--');
    expect(formatLatencyMs(undefined)).toBe('--');
    expect(formatLatencyMs(Number.NaN)).toBe('--');
    expect(formatLatencyMs(-5)).toBe('--');
  });

  it('409/4xx 세부 상태, 지연 백분위(p50/p95/p99/평균), 429 사유와 경로별 지연을 계산한다', () => {
    const view = selectHttpMetricsView(sample({
      summary: {
        total: 1000,
        status409: 12,
        status426: 5,
        status429: 25,
        status4xx: 50,
        status5xx: 10,
        rate409: 0.012,
        rate426: 0.005,
        rate429: 0.025,
        rate4xx: 0.05,
        rate5xx: 0.01,
        latency: { p50Ms: 24, p95Ms: 180, p99Ms: 420, avgMs: 48.4, samples: 950 },
        rateLimitReasons: { catchTooSoon: 15, letterGap: 7, other: 3 },
      },
      byRoute: [
        {
          routeGroup: 'action',
          total: 800,
          status409: 10,
          status426: 4,
          status429: 20,
          status4xx: 40,
          status5xx: 8,
          rate409: 0.0125,
          rate426: 0.005,
          rate429: 0.025,
          rate4xx: 0.05,
          rate5xx: 0.01,
          latency: { p50Ms: 20, p95Ms: 160, p99Ms: 390, avgMs: 41, samples: 780 },
        },
      ],
    }), 7);

    expect(view.summary).toMatchObject({
      status409: 12,
      status4xx: 50,
      rate409Text: '1.2%',
      rate4xxText: '5%',
      latency: {
        p50Text: '24ms',
        p95Text: '180ms',
        p99Text: '420ms',
        avgText: '48ms',
        samples: 950,
      },
      rateLimitReasons: {
        catchTooSoon: 15,
        letterGap: 7,
        other: 3,
      },
    });
    expect(view.byRoute[0]).toMatchObject({
      status409: 10,
      status4xx: 40,
      rate409Text: '1.25%',
      p95Text: '160ms',
      avgText: '41ms',
    });
  });

  it('확장 선택 필드가 없거나 데이터가 null이어도 안전하게 기본값을 반환한다', () => {
    const partial = selectHttpMetricsView(sample(), 7);
    expect(partial.summary).toMatchObject({
      status409: 0,
      status4xx: 0,
      rate409Text: '0%',
      rate4xxText: '0%',
      latency: { p50Text: '--', p95Text: '--', p99Text: '--', avgText: '--', samples: 0 },
      rateLimitReasons: { catchTooSoon: 0, letterGap: 0, other: 0 },
    });
    expect(partial.byRoute[0]).toMatchObject({
      status409: 0,
      status4xx: 0,
      rate409Text: '0%',
      p95Text: '--',
      avgText: '--',
    });

    const empty = selectHttpMetricsView(null, 7);
    expect(empty.summary).toMatchObject({
      status409: null,
      status4xx: null,
      rate409Text: '--',
      rate4xxText: '--',
      latency: { p50Text: '--', p95Text: '--', p99Text: '--', avgText: '--', samples: 0 },
      rateLimitReasons: { catchTooSoon: 0, letterGap: 0, other: 0 },
    });
  });
});
