// WebSocket 메모리 지표 수집기 단위 테스트.
import { describe, expect, it, vi } from 'vitest';
import type { WsMetricIncrement } from '../_data/wsMetrics.js';
import { createWsMetrics } from './wsMetrics.js';

describe('createWsMetrics', () => {
  it('업그레이드·거부·종료 이벤트를 KST 일별로 누적하고 stop 시 플러시한다', async () => {
    const saved: WsMetricIncrement[][] = [];
    const wsMetrics = createWsMetrics({
      flushIntervalMs: 60_000,
      now: () => Date.parse('2026-11-25T15:30:00.000Z'), // KST 2026-11-26
      persist: async rows => { saved.push(rows); },
    });

    wsMetrics.onUpgradeOk();
    wsMetrics.onUpgradeOk();
    wsMetrics.onReject(401);
    wsMetrics.onReject(403);
    wsMetrics.onReject(500);
    wsMetrics.onClose('normal');
    wsMetrics.onClose('abnormal');
    wsMetrics.onClose('idle_timeout');

    expect(wsMetrics.recentSnapshot()).toEqual({
      upgradesOk: 2,
      reject401: 1,
      reject403: 1,
      reject500: 1,
      closeNormal: 1,
      closeAbnormal: 1,
      closeIdleTimeout: 1,
    });

    await wsMetrics.stop();
    expect(saved).toEqual([[{
      day: '2026-11-26',
      upgradesOk: 2,
      reject401: 1,
      reject403: 1,
      reject500: 1,
      closeNormal: 1,
      closeAbnormal: 1,
      closeIdleTimeout: 1,
    }]]);
  });

  it('저장 실패 시 버퍼를 복구해 다음 플러시에 합산하고 recentSnapshot은 창 만료를 따른다', async () => {
    let nowMs = Date.parse('2026-11-25T05:00:00.000Z');
    let fail = true;
    const onError = vi.fn();
    const saved: WsMetricIncrement[][] = [];
    const wsMetrics = createWsMetrics({
      flushIntervalMs: 60_000,
      windowMs: 30_000,
      now: () => nowMs,
      persist: async rows => {
        if (fail) throw new Error('db-down');
        saved.push(rows);
      },
      onError,
    });

    wsMetrics.onReject(500);
    await wsMetrics.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(0);

    fail = false;
    wsMetrics.onClose('abnormal');
    await wsMetrics.flush();
    expect(saved).toEqual([[{
      day: '2026-11-25',
      upgradesOk: 0,
      reject401: 0,
      reject403: 0,
      reject500: 1,
      closeNormal: 0,
      closeAbnormal: 1,
      closeIdleTimeout: 0,
    }]]);

    expect(wsMetrics.recentSnapshot().reject500).toBe(1);
    nowMs += 31_000;
    expect(wsMetrics.recentSnapshot()).toEqual({
      upgradesOk: 0, reject401: 0, reject403: 0, reject500: 0, closeNormal: 0, closeAbnormal: 0, closeIdleTimeout: 0,
    });
    await wsMetrics.stop();
  });
});
