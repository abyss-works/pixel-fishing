// 운영 상태(opsHealth) 데이터 계층 단위 테스트 — DB 크기·활성 연결 fallback·임계 경보·Zero-PII를 검증한다.
import { describe, expect, it, vi } from 'vitest';
import type { Executor } from '../_db/client.js';
import { readOpsHealth } from './opsHealth.js';

describe('readOpsHealth', () => {
  it('런타임·DB 풀·DB 크기·pg_stat_activity·HTTP/WS 요약·슬로우 요청·경보를 조합한다', async () => {
    let callIdx = 0;
    const execute = vi.fn(async () => {
      callIdx += 1;
      if (callIdx === 1) {
        // readHttpMetrics
        return {
          rows: [{
            day: '2026-11-26', route_group: 'action',
            total: '100', status_409: '1', status_426: '0', status_429: '2', status_4xx: '4', status_5xx: '6',
            lat_le_50: '80', lat_le_100: '10', lat_le_250: '4', lat_le_500: '0', lat_le_1000: '0', lat_le_2500: '6', lat_gt_2500: '0',
            lat_sum_ms: '12000', rl_catch_too_soon: '2', rl_letter_gap: '0', rl_other: '0',
          }],
        };
      }
      if (callIdx === 2) {
        // readWsMetrics
        return {
          rows: [{
            day: '2026-11-26', upgrades_ok: '30', reject_401: '1', reject_403: '0', reject_500: '1',
            close_normal: '10', close_abnormal: '1', close_idle_timeout: '1',
          }],
        };
      }
      if (callIdx === 3) {
        return { rows: [{ size_bytes: '10485760' }] };
      }
      return { rows: [{ active_connections: '7' }] };
    });
    const db = { execute } as unknown as Executor;
    const pool = { totalCount: 8, idleCount: 1, waitingCount: 2, options: { max: 10 } };

    const report = await readOpsHealth(db, pool, {
      days: 7,
      onlineCount: 12,
      slowRequests: [
        { at: '2026-11-26T00:00:00.000Z', method: 'POST', routeGroup: 'action', path: '/api/action', statusCode: 200, durationMs: 650 },
      ],
    });

    expect(report.runtime.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(report.runtime.rssMb).toBeGreaterThan(0);
    expect(report.database).toEqual({
      poolTotal: 8,
      poolIdle: 1,
      poolWaiting: 2,
      poolMax: 10,
      dbSizeBytes: 10485760,
      activeConnections: 7,
    });
    expect(report.httpSummary.total).toBe(100);
    expect(report.httpSummary.status5xx).toBe(6);
    expect(report.ws.onlineCount).toBe(12);
    expect(report.ws.summary.reject500).toBe(1);
    expect(report.ws.daily).toHaveLength(1);
    expect(report.slowRequests).toHaveLength(1);
    expect(report.alerts.map(a => a.code)).toEqual([
      'http-5xx-rate',
      'http-p95-high',
      'db-pool-pressure',
      'ws-upgrade-500',
    ]);
  });

  it('pg_stat_activity 조회 권한 오류가 나도 activeConnections=null로 폴백한다', async () => {
    let callIdx = 0;
    const execute = vi.fn(async () => {
      callIdx += 1;
      if (callIdx <= 2) return { rows: [] };
      if (callIdx === 3) return { rows: [{ size_bytes: '4096' }] };
      throw new Error('permission denied for view pg_stat_activity');
    });
    const db = { execute } as unknown as Executor;
    const pool = { totalCount: 2, idleCount: 2, waitingCount: 0, options: { max: 10 } };

    const report = await readOpsHealth(db, pool, {
      days: 7,
      onlineCount: 0,
      slowRequests: [],
    });

    expect(report.database.dbSizeBytes).toBe(4096);
    expect(report.database.activeConnections).toBeNull();
    expect(report.alerts).toEqual([]);
  });

  it('원격 API 파드 runtime/pool 스냅샷이 주어지면 로컬 프로세스·풀 대신 해당 값을 사용한다', async () => {
    let callIdx = 0;
    const execute = vi.fn(async () => {
      callIdx += 1;
      if (callIdx <= 2) return { rows: [] };
      if (callIdx === 3) return { rows: [{ size_bytes: '4096' }] };
      return { rows: [{ active_connections: '3' }] };
    });
    const db = { execute } as unknown as Executor;
    const localPool = { totalCount: 1, idleCount: 1, waitingCount: 0, options: { max: 4 } };

    const report = await readOpsHealth(db, localPool, {
      days: 7,
      onlineCount: 0,
      slowRequests: [],
      runtime: { uptimeSec: 999, rssMb: 321.5, heapUsedMb: 111.1, heapTotalMb: 222.2 },
      pool: { total: 18, idle: 1, waiting: 2, max: 20 },
    });

    expect(report.runtime).toEqual({ uptimeSec: 999, rssMb: 321.5, heapUsedMb: 111.1, heapTotalMb: 222.2 });
    expect(report.database.poolTotal).toBe(18);
    expect(report.database.poolIdle).toBe(1);
    expect(report.database.poolWaiting).toBe(2);
    expect(report.database.poolMax).toBe(20);
    expect(report.alerts.map(a => a.code)).toContain('db-pool-pressure');
  });
});
