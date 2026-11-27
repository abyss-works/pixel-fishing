// WebSocket 일별 지표(ws_metrics_daily) 데이터 계층 단위 테스트.
import { describe, expect, it, vi } from 'vitest';
import type { Executor } from '../_db/client.js';
import { flushWsMetrics, readWsMetrics } from './wsMetrics.js';

describe('flushWsMetrics / readWsMetrics', () => {
  it('빈 배치·전부 0인 증분은 SQL을 실행하지 않고, 같은 날짜 증분은 합산 upsert한다', async () => {
    const execute = vi.fn(async (_query: unknown) => ({ rows: [] }));
    const db = { execute } as unknown as Executor;

    await flushWsMetrics(db, [
      { day: '2026-11-26', upgradesOk: 0, reject401: 0, reject403: 0, reject500: 0, closeNormal: 0, closeAbnormal: 0, closeIdleTimeout: 0 },
    ]);
    expect(execute).not.toHaveBeenCalled();

    await flushWsMetrics(db, [
      { day: '2026-11-26', upgradesOk: 3, reject401: 1, reject403: 0, reject500: 0, closeNormal: 2, closeAbnormal: 1, closeIdleTimeout: 0 },
      { day: '2026-11-26', upgradesOk: 2, reject401: 0, reject403: 1, reject500: 1, closeNormal: 1, closeAbnormal: 0, closeIdleTimeout: 2 },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(execute.mock.calls[0]?.[0]).replaceAll('\\"', '"');
    expect(serialized).toContain('"upgrades_ok":5');
    expect(serialized).toContain('"reject_401":1');
    expect(serialized).toContain('"reject_403":1');
    expect(serialized).toContain('"reject_500":1');
    expect(serialized).toContain('"close_normal":3');
    expect(serialized).toContain('"close_abnormal":1');
    expect(serialized).toContain('"close_idle_timeout":2');
  });

  it('readWsMetrics가 summary와 일별 추이를 합산 반환한다', async () => {
    const execute = vi.fn(async () => ({
      rows: [
        { day: '2026-11-25', upgrades_ok: '10', reject_401: '2', reject_403: '1', reject_500: '0', close_normal: '8', close_abnormal: '1', close_idle_timeout: '1' },
        { day: '2026-11-26', upgrades_ok: '20', reject_401: '1', reject_403: '0', reject_500: '1', close_normal: '15', close_abnormal: '3', close_idle_timeout: '2' },
      ],
    }));
    const db = { execute } as unknown as Executor;
    const report = await readWsMetrics(db, 7);

    expect(report).toEqual({
      days: 7,
      summary: {
        upgradesOk: 30, reject401: 3, reject403: 1, reject500: 1, closeNormal: 23, closeAbnormal: 4, closeIdleTimeout: 3,
      },
      daily: [
        { day: '2026-11-25', upgradesOk: 10, reject401: 2, reject403: 1, reject500: 0, closeNormal: 8, closeAbnormal: 1, closeIdleTimeout: 1 },
        { day: '2026-11-26', upgradesOk: 20, reject401: 1, reject403: 0, reject500: 1, closeNormal: 15, closeAbnormal: 3, closeIdleTimeout: 2 },
      ],
    });
  });
});
