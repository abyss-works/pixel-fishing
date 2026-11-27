// 클라이언트 지표 서버 수집기·비콘 파서 단위 테스트.
import { describe, expect, it, vi } from 'vitest';
import type { ClientMetricIncrement } from '../_data/clientMetrics.js';
import { createClientMetrics, parseClientMetricBeacon } from './clientMetrics.js';

describe('parseClientMetricBeacon', () => {
  it('정상 비콘을 검증하고 미지 필드·문자열·PII를 제거한 수치 페이로드만 반환한다', () => {
    const parsed = parseClientMetricBeacon({
      lcpMs: 1850.6,
      inpMs: 95,
      ttfbMs: 320,
      cls: 0.042,
      actionRttsMs: [80, 140, 400, 1200],
      actionTimeouts: 1,
      actionConflicts409: 2,
      meRttsMs: [90, 260],
      meTimeouts: 1,
      canvasFrames: 1200,
      canvasLongFrames: 4,
      wsReconnects: 1,
      wsAbnormalCloses: 2,
      email: 'user@example.test',
      uid: '00000000-0000-4000-8000-000000000001',
      url: 'https://example.test/?token=secret',
      unknownTag: 'ignored',
    });

    expect(parsed).toEqual({
      lcpMs: 1851,
      inpMs: 95,
      ttfbMs: 320,
      clsX1000: 42,
      actionRttsMs: [80, 140, 400, 1200],
      actionTimeouts: 1,
      actionConflicts409: 2,
      meRttsMs: [90, 260],
      meTimeouts: 1,
      canvasFrames: 1200,
      canvasLongFrames: 4,
      wsReconnects: 1,
      wsAbnormalCloses: 2,
    });
  });

  it('빈 객체나 모든 값이 0인 비콘, 비객체, 음수·비유한수·상한 초과·배열 32개 초과는 null로 거부한다', () => {
    for (const bad of [
      null,
      undefined,
      'string',
      [],
      {},
      { email: 'only-pii@example.test' },
      { canvasFrames: 0, lcpMs: undefined },
      { lcpMs: -1 },
      { lcpMs: 120_001 },
      { inpMs: Number.NaN },
      { ttfbMs: '100' },
      { cls: -0.1 },
      { cls: 101 },
      { canvasFrames: 500_001 },
      { canvasFrames: 1.5 },
      { actionTimeouts: 10_001 },
      { actionRttsMs: [10, -5] },
      { actionRttsMs: [120_001] },
      { actionRttsMs: Array.from({ length: 33 }, () => 50) },
      { meRttsMs: Array.from({ length: 33 }, () => 50) },
      { meRttsMs: 'bad' },
    ]) {
      expect(parseClientMetricBeacon(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('createClientMetrics', () => {
  it('비콘을 KST 일별 버퍼에 버킷팅해 누적하고 stop 시 플러시한다', async () => {
    const saved: ClientMetricIncrement[][] = [];
    const collector = createClientMetrics({
      flushIntervalMs: 60_000,
      now: () => Date.parse('2026-11-25T15:30:00.000Z'), // KST 2026-11-26
      persist: async rows => { saved.push(rows); },
    });

    const first = parseClientMetricBeacon({
      lcpMs: 1200,
      inpMs: 150,
      ttfbMs: 600,
      cls: 0.025,
      actionRttsMs: [50, 200, 450, 900, 1500],
      actionTimeouts: 1,
      actionConflicts409: 2,
      meRttsMs: [80, 1500],
      meTimeouts: 1,
      canvasFrames: 600,
      canvasLongFrames: 3,
      wsReconnects: 1,
      wsAbnormalCloses: 2,
    })!;
    collector.record(first);
    await collector.stop();

    expect(saved).toEqual([[{
      day: '2026-11-26',
      reports: 1,
      lcpLe1500: 1, lcpLe2500: 0, lcpLe4000: 0, lcpGt4000: 0, lcpSumMs: 1200, lcpCount: 1,
      inpLe100: 0, inpLe200: 1, inpLe500: 0, inpGt500: 0, inpSumMs: 150, inpCount: 1,
      ttfbLe200: 0, ttfbLe500: 0, ttfbLe1000: 1, ttfbGt1000: 0, ttfbSumMs: 600, ttfbCount: 1,
      clsSumX1000: 25, clsCount: 1,
      actionRttLe100: 1, actionRttLe250: 1, actionRttLe500: 1, actionRttLe1000: 1, actionRttGt1000: 1,
      actionRttSumMs: 3100, actionRttCount: 5, actionTimeouts: 1, actionConflicts409: 2,
      meRttLe100: 1, meRttLe250: 0, meRttLe500: 0, meRttLe1000: 0, meRttGt1000: 1,
      meRttSumMs: 1580, meRttCount: 2, meTimeouts: 1,
      canvasFrames: 600, canvasLongFrames: 3,
      wsReconnects: 1, wsAbnormalCloses: 2,
    }]]);
  });

  it('저장 실패 시 버퍼를 복구해 다음 플러시에 합산 재전송하고 빈 버퍼면 호출하지 않는다', async () => {
    const onError = vi.fn();
    let fail = true;
    const saved: ClientMetricIncrement[][] = [];
    const collector = createClientMetrics({
      flushIntervalMs: 60_000,
      now: () => Date.parse('2026-11-26T00:00:00.000Z'),
      persist: async rows => {
        if (fail) throw new Error('db-error');
        saved.push(rows);
      },
      onError,
    });

    await collector.flush();
    expect(saved).toHaveLength(0);

    collector.record(parseClientMetricBeacon({ canvasFrames: 100 })!);
    await collector.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(0);

    fail = false;
    collector.record(parseClientMetricBeacon({ canvasFrames: 50 })!);
    await collector.stop();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.[0]).toMatchObject({ reports: 2, canvasFrames: 150 });
  });
});
