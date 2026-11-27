import { describe, expect, it } from 'vitest';
import type { AdminClientMetrics } from './types';
import {
  CLIENT_METRICS_SCOPE_NOTICE,
  selectClientMetricsView,
} from './clientMetrics';

const sampleMetrics = (over: Partial<AdminClientMetrics> = {}): AdminClientMetrics => ({
  days: 7,
  summary: {
    reports: 120,
    lcp: { p50Ms: 1120, p95Ms: 2450, avgMs: 1380, samples: 110 },
    inp: { p50Ms: 48, p95Ms: 185, avgMs: 64, samples: 95 },
    ttfb: { p50Ms: 130, p95Ms: 420, avgMs: 175, samples: 118 },
    clsAvg: 0.042,
    actionRtt: { p50Ms: 42, p95Ms: 160, avgMs: 58, samples: 840, timeouts: 2, conflicts409: 3 },
    meRtt: { p50Ms: 28, p95Ms: 95, avgMs: 36, samples: 240, timeouts: 1 },
    canvasFrames: 2000,
    canvasLongFrames: 30,
    longFramePct: 1.5,
    wsReconnects: 7,
    wsAbnormalCloses: 2,
  },
  daily: [
    {
      day: '2026-11-25',
      reports: 50,
      lcp: { p50Ms: 1000, p95Ms: 2200, avgMs: 1250, samples: 45 },
      inp: { p50Ms: 40, p95Ms: 160, avgMs: 55, samples: 40 },
      ttfb: { p50Ms: 120, p95Ms: 380, avgMs: 160, samples: 48 },
      clsAvg: 0.031,
      actionRtt: { p50Ms: 38, p95Ms: 145, avgMs: 52, samples: 350, timeouts: 1, conflicts409: 1 },
      meRtt: { p50Ms: 25, p95Ms: 88, avgMs: 33, samples: 100, timeouts: 0 },
      canvasFrames: 1000,
      canvasLongFrames: 12,
      longFramePct: 1.2,
      wsReconnects: 3,
      wsAbnormalCloses: 1,
    },
    {
      day: '2026-11-26',
      reports: 70,
      lcp: { p50Ms: 1200, p95Ms: 2600, avgMs: 1450, samples: 65 },
      inp: { p50Ms: 52, p95Ms: 195, avgMs: 70, samples: 55 },
      ttfb: { p50Ms: 140, p95Ms: 440, avgMs: 185, samples: 70 },
      clsAvg: null,
      actionRtt: { p50Ms: 45, p95Ms: 170, avgMs: 62, samples: 490, timeouts: 1, conflicts409: 2 },
      meRtt: { p50Ms: 30, p95Ms: 102, avgMs: 39, samples: 140, timeouts: 1 },
      canvasFrames: 1000,
      canvasLongFrames: 18,
      longFramePct: null,
      wsReconnects: 4,
      wsAbnormalCloses: 1,
    },
  ],
  ...over,
});

describe('클라이언트 체감 성능 모델 (selectClientMetricsView)', () => {
  it('안내 문구에 가운뎃점과 대시를 포함하지 않는다', () => {
    expect(CLIENT_METRICS_SCOPE_NOTICE).toBe(
      '실제 브라우저 세션 비콘 집계이며, 개인정보나 계정 식별자를 수집하지 않아요.',
    );
    expect(CLIENT_METRICS_SCOPE_NOTICE).not.toMatch(/[·—–]/);
  });

  it('데이터가 null이면 빈 표기(--)와 0건 기본 상태를 반환한다', () => {
    const view = selectClientMetricsView(null, 7);

    expect(view.days).toBe(7);
    expect(view.reports).toBe(0);
    expect(view.lcp).toEqual({ p50Text: '--', p95Text: '--', avgText: '--', samples: 0 });
    expect(view.inp).toEqual({ p50Text: '--', p95Text: '--', avgText: '--', samples: 0 });
    expect(view.ttfb).toEqual({ p50Text: '--', p95Text: '--', avgText: '--', samples: 0 });
    expect(view.clsText).toBe('--');
    expect(view.actionRtt).toEqual({
      p50Text: '--', p95Text: '--', avgText: '--', samples: 0, timeouts: 0, conflicts409: 0,
    });
    expect(view.meRtt).toEqual({
      p50Text: '--', p95Text: '--', avgText: '--', samples: 0, timeouts: 0,
    });
    expect(view.canvas).toEqual({ frames: 0, longFrames: 0, longFramePctText: '--' });
    expect(view.ws).toEqual({ reconnects: 0, abnormalCloses: 0 });
    expect(view.daily).toEqual([]);
  });

  it('요약 지표와 CLS, 긴 프레임 비율, RTT, WS, 일별 추이를 화면 표기용으로 변환한다', () => {
    const view = selectClientMetricsView(sampleMetrics(), 7);

    expect(view.days).toBe(7);
    expect(view.reports).toBe(120);
    expect(view.lcp).toEqual({ p50Text: '1120ms', p95Text: '2450ms', avgText: '1380ms', samples: 110 });
    expect(view.inp).toEqual({ p50Text: '48ms', p95Text: '185ms', avgText: '64ms', samples: 95 });
    expect(view.ttfb).toEqual({ p50Text: '130ms', p95Text: '420ms', avgText: '175ms', samples: 118 });
    expect(view.clsText).toBe('0.042');
    expect(view.actionRtt).toEqual({
      p50Text: '42ms', p95Text: '160ms', avgText: '58ms', samples: 840, timeouts: 2, conflicts409: 3,
    });
    expect(view.meRtt).toEqual({
      p50Text: '28ms', p95Text: '95ms', avgText: '36ms', samples: 240, timeouts: 1,
    });
    expect(view.canvas).toEqual({ frames: 2000, longFrames: 30, longFramePctText: '1.5%' });
    expect(view.ws).toEqual({ reconnects: 7, abnormalCloses: 2 });

    expect(view.daily).toEqual([
      {
        day: '2026-11-25',
        reports: 50,
        lcpP95Text: '2200ms',
        inpP95Text: '160ms',
        ttfbP95Text: '380ms',
        clsText: '0.031',
        actionP95Text: '145ms',
        meP95Text: '88ms',
        longFramePctText: '1.2%',
        conflicts409: 1,
        wsReconnects: 3,
        wsAbnormalCloses: 1,
      },
      {
        day: '2026-11-26',
        reports: 70,
        lcpP95Text: '2600ms',
        inpP95Text: '195ms',
        ttfbP95Text: '440ms',
        clsText: '--',
        actionP95Text: '170ms',
        meP95Text: '102ms',
        longFramePctText: '--',
        conflicts409: 2,
        wsReconnects: 4,
        wsAbnormalCloses: 1,
      },
    ]);
  });

  it('null이나 비정상 숫자 입력을 --로 안전하게 처리한다', () => {
    const view = selectClientMetricsView(sampleMetrics({
      summary: {
        reports: 0,
        lcp: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
        inp: { p50Ms: Number.NaN, p95Ms: -1, avgMs: Number.POSITIVE_INFINITY, samples: 0 },
        ttfb: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
        clsAvg: Number.NaN,
        actionRtt: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0, timeouts: 0, conflicts409: 0 },
        meRtt: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0, timeouts: 0 },
        canvasFrames: 0,
        canvasLongFrames: 0,
        longFramePct: -1,
        wsReconnects: 0,
        wsAbnormalCloses: 0,
      },
      daily: [],
    }), 14);

    expect(view.clsText).toBe('--');
    expect(view.canvas.longFramePctText).toBe('--');
    expect(view.lcp).toEqual({ p50Text: '--', p95Text: '--', avgText: '--', samples: 0 });
    expect(view.inp).toEqual({ p50Text: '--', p95Text: '--', avgText: '--', samples: 0 });

    const zeroView = selectClientMetricsView(sampleMetrics({
      summary: {
        reports: 0,
        lcp: { p50Ms: 0, p95Ms: 0, avgMs: 0, samples: 1 },
        inp: { p50Ms: 0, p95Ms: 0, avgMs: 0, samples: 1 },
        ttfb: { p50Ms: 0, p95Ms: 0, avgMs: 0, samples: 1 },
        clsAvg: 0,
        actionRtt: { p50Ms: 0, p95Ms: 0, avgMs: 0, samples: 1, timeouts: 0, conflicts409: 0 },
        meRtt: { p50Ms: 0, p95Ms: 0, avgMs: 0, samples: 1, timeouts: 0 },
        canvasFrames: 100,
        canvasLongFrames: 0,
        longFramePct: 0,
        wsReconnects: 0,
        wsAbnormalCloses: 0,
      },
      daily: [],
    }), 7);

    expect(zeroView.clsText).toBe('0.000');
    expect(zeroView.canvas.longFramePctText).toBe('0%');
    expect(zeroView.lcp.p95Text).toBe('0ms');
  });
});
