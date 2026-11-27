// 클라이언트 체감 지표 데이터 계층(단일 문장 합산 upsert·일별 추이·요약 통계) 단위 테스트.
import { describe, expect, it, vi } from 'vitest';
import type { Executor } from '../_db/client.js';
import {
  emptyClientCounts,
  flushClientMetrics,
  readClientMetrics,
  type ClientMetricIncrement,
} from './clientMetrics.js';

describe('flushClientMetrics', () => {
  it('빈 증분은 DB를 호출하지 않는다', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const db = { execute } as unknown as Executor;

    await flushClientMetrics(db, []);
    await flushClientMetrics(db, [{ day: '2026-11-26', ...emptyClientCounts() }]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('같은 day 증분을 하나로 합쳐 json_to_recordset 단일 문장으로 upsert한다', async () => {
    const execute = vi.fn(async (_query: unknown) => ({ rows: [] }));
    const db = { execute } as unknown as Executor;

    const a: ClientMetricIncrement = {
      day: '2026-11-26',
      ...emptyClientCounts(),
      reports: 1,
      lcpLe1500: 1,
      lcpSumMs: 1200,
      lcpCount: 1,
      actionRttLe100: 2,
      actionRttSumMs: 120,
      actionRttCount: 2,
      actionConflicts409: 1,
      canvasFrames: 300,
      canvasLongFrames: 3,
      wsReconnects: 1,
    };
    const b: ClientMetricIncrement = {
      day: '2026-11-26',
      ...emptyClientCounts(),
      reports: 2,
      lcpLe2500: 1,
      lcpSumMs: 2000,
      lcpCount: 1,
      clsSumX1000: 45,
      clsCount: 1,
      meRttLe250: 1,
      meRttSumMs: 180,
      meRttCount: 1,
      meTimeouts: 1,
      canvasFrames: 200,
      canvasLongFrames: 2,
      wsAbnormalCloses: 2,
    };

    await flushClientMetrics(db, [a, b]);
    expect(execute).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(execute.mock.calls[0]?.[0]).replaceAll('\\"', '"');
    expect(serialized).toContain('"day":"2026-11-26"');
    expect(serialized).toContain('"reports":3');
    expect(serialized).toContain('"lcp_le_1500":1');
    expect(serialized).toContain('"lcp_le_2500":1');
    expect(serialized).toContain('"lcp_sum_ms":3200');
    expect(serialized).toContain('"lcp_count":2');
    expect(serialized).toContain('"cls_sum_x1000":45');
    expect(serialized).toContain('"cls_count":1');
    expect(serialized).toContain('"action_rtt_le_100":2');
    expect(serialized).toContain('"action_conflicts_409":1');
    expect(serialized).toContain('"me_rtt_le_250":1');
    expect(serialized).toContain('"me_timeouts":1');
    expect(serialized).toContain('"canvas_frames":500');
    expect(serialized).toContain('"canvas_long_frames":5');
    expect(serialized).toContain('"ws_reconnects":1');
    expect(serialized).toContain('"ws_abnormal_closes":2');
  });
});

describe('readClientMetrics', () => {
  it('표본이 없으면 요약의 백분위·평균·CLS·장프레임 비율을 null로 돌려준다', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const db = { execute } as unknown as Executor;

    const report = await readClientMetrics(db, 7);
    expect(report).toEqual({
      days: 7,
      summary: {
        reports: 0,
        lcp: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
        inp: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
        ttfb: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
        clsAvg: null,
        actionRtt: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0, timeouts: 0, conflicts409: 0 },
        meRtt: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0, timeouts: 0 },
        canvasFrames: 0,
        canvasLongFrames: 0,
        longFramePct: null,
        wsReconnects: 0,
        wsAbnormalCloses: 0,
      },
      daily: [],
    });
  });

  it('일별 행과 기간 요약을 히스토그램 백분위·CLS 평균·장프레임 비율로 집계하고 days를 1~90으로 제한한다', async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          day: '2026-11-25',
          reports: '10',
          lcp_le_1500: '6', lcp_le_2500: '3', lcp_le_4000: '1', lcp_gt_4000: '0', lcp_sum_ms: '14000', lcp_count: '10',
          inp_le_100: '8', inp_le_200: '1', inp_le_500: '1', inp_gt_500: '0', inp_sum_ms: '900', inp_count: '10',
          ttfb_le_200: '9', ttfb_le_500: '1', ttfb_le_1000: '0', ttfb_gt_1000: '0', ttfb_sum_ms: '1200', ttfb_count: '10',
          cls_sum_x1000: '120', cls_count: '10',
          action_rtt_le_100: '10', action_rtt_le_250: '8', action_rtt_le_500: '2', action_rtt_le_1000: '0', action_rtt_gt_1000: '0',
          action_rtt_sum_ms: '3000', action_rtt_count: '20', action_timeouts: '1', action_conflicts_409: '2',
          me_rtt_le_100: '5', me_rtt_le_250: '5', me_rtt_le_500: '0', me_rtt_le_1000: '0', me_rtt_gt_1000: '0',
          me_rtt_sum_ms: '1100', me_rtt_count: '10', me_timeouts: '0',
          canvas_frames: '1000', canvas_long_frames: '25',
          ws_reconnects: '3', ws_abnormal_closes: '4',
        },
        {
          day: '2026-11-26',
          reports: '10',
          lcp_le_1500: '0', lcp_le_2500: '4', lcp_le_4000: '4', lcp_gt_4000: '2', lcp_sum_ms: '32000', lcp_count: '10',
          inp_le_100: '0', inp_le_200: '5', inp_le_500: '4', inp_gt_500: '1', inp_sum_ms: '3100', inp_count: '10',
          ttfb_le_200: '1', ttfb_le_500: '7', ttfb_le_1000: '2', ttfb_gt_1000: '0', ttfb_sum_ms: '3800', ttfb_count: '10',
          cls_sum_x1000: '80', cls_count: '10',
          action_rtt_le_100: '0', action_rtt_le_250: '10', action_rtt_le_500: '8', action_rtt_le_1000: '2', action_rtt_gt_1000: '0',
          action_rtt_sum_ms: '6000', action_rtt_count: '20', action_timeouts: '2', action_conflicts_409: '1',
          me_rtt_le_100: '0', me_rtt_le_250: '5', me_rtt_le_500: '4', me_rtt_le_1000: '1', me_rtt_gt_1000: '0',
          me_rtt_sum_ms: '2900', me_rtt_count: '10', me_timeouts: '1',
          canvas_frames: '1000', canvas_long_frames: '75',
          ws_reconnects: '1', ws_abnormal_closes: '2',
        },
      ],
    }));
    const db = { execute } as unknown as Executor;

    const report = await readClientMetrics(db, 120);
    expect(report.days).toBe(90);
    expect(report.daily).toHaveLength(2);
    expect(report.daily[0]).toMatchObject({
      day: '2026-11-25',
      reports: 10,
      lcp: { p50Ms: 1500, p95Ms: 4000, avgMs: 1400, samples: 10 },
      clsAvg: 0.012,
      longFramePct: 2.5,
      wsReconnects: 3,
      wsAbnormalCloses: 4,
    });
    expect(report.summary).toEqual({
      reports: 20,
      lcp: { p50Ms: 2500, p95Ms: 4000, avgMs: 2300, samples: 20 },
      inp: { p50Ms: 200, p95Ms: 500, avgMs: 200, samples: 20 },
      ttfb: { p50Ms: 200, p95Ms: 1000, avgMs: 250, samples: 20 },
      clsAvg: 0.01,
      actionRtt: { p50Ms: 250, p95Ms: 500, avgMs: 225, samples: 40, timeouts: 3, conflicts409: 3 },
      meRtt: { p50Ms: 250, p95Ms: 500, avgMs: 200, samples: 20, timeouts: 1 },
      canvasFrames: 2000,
      canvasLongFrames: 100,
      longFramePct: 5,
      wsReconnects: 4,
      wsAbnormalCloses: 6,
    });
  });
});
