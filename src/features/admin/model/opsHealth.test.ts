import { describe, expect, it } from 'vitest';
import type { AdminOpsHealth } from './types';
import {
  formatDbSize,
  formatUptime,
  OPS_ALERT_SEVERITY_LABELS,
  OPS_WS_CLOSE_LABELS,
  OPS_WS_REJECT_LABELS,
  selectOpsHealthView,
} from './opsHealth';

const sampleHealth = (over: Partial<AdminOpsHealth> = {}): AdminOpsHealth => ({
  runtime: {
    uptimeSec: 90_065,
    rssMb: 256,
    heapUsedMb: 128,
    heapTotalMb: 192,
  },
  database: {
    poolTotal: 10,
    poolIdle: 7,
    poolWaiting: 1,
    poolMax: 20,
    dbSizeBytes: 157_286_400,
    activeConnections: 4,
  },
  httpSummary: {
    total: 1000,
    status409: 2,
    status426: 1,
    status429: 5,
    status4xx: 10,
    status5xx: 2,
    rate409: 0.002,
    rate426: 0.001,
    rate429: 0.005,
    rate4xx: 0.01,
    rate5xx: 0.002,
  },
  ws: {
    onlineCount: 14,
    summary: {
      upgradesOk: 200,
      reject401: 3,
      reject403: 1,
      reject500: 2,
      closeNormal: 180,
      closeAbnormal: 15,
      closeIdleTimeout: 5,
    },
    daily: [
      {
        day: '2026-11-05',
        upgradesOk: 120,
        reject401: 2,
        reject403: 0,
        reject500: 1,
        closeNormal: 100,
        closeAbnormal: 10,
        closeIdleTimeout: 2,
      },
    ],
  },
  slowRequests: [
    {
      at: '2026-11-05T03:04:05.000Z',
      method: 'POST',
      routeGroup: 'action',
      path: '/api/game/catch',
      statusCode: 200,
      durationMs: 620,
    },
  ],
  alerts: [
    {
      code: 'http-p95-high',
      severity: 'crit',
      title: 'HTTP p95 지연 초과',
      detail: '최근 요청 p95 지연이 임계치를 넘었어요.',
      observed: 820,
      threshold: 500,
    },
    {
      code: 'ws-abnormal-close',
      severity: 'warn',
      title: 'WebSocket 비정상 종료 증가',
      detail: '비정상 종료 비율이 높아요.',
      observed: 0.12,
      threshold: 0.1,
    },
  ],
  ...over,
});

describe('opsHealth 모델', () => {
  it('경보 심각도와 소켓 상태 라벨을 제공한다', () => {
    expect(OPS_ALERT_SEVERITY_LABELS).toEqual({ crit: '위험', warn: '주의' });
    expect(OPS_WS_REJECT_LABELS.reject401).toContain('401');
    expect(OPS_WS_CLOSE_LABELS.closeAbnormal).toContain('비정상');
  });

  it('가동 시간과 DB 용량을 읽기 쉬운 문자열로 포맷한다', () => {
    expect(formatUptime(45)).toBe('45초');
    expect(formatUptime(300)).toBe('5분');
    expect(formatUptime(3660)).toBe('1시간 1분');
    expect(formatUptime(90_065)).toBe('1일 1시간 1분');
    expect(formatDbSize(157_286_400)).toBe('150 MB');
    expect(formatDbSize(1_610_612_736)).toBe('1.5 GB');
    expect(formatDbSize(null)).toBe('확인 불가');
  });

  it('런타임, DB 풀, WebSocket, 슬로우 요청, 경보를 화면 뷰 모델로 변환한다', () => {
    const view = selectOpsHealthView(sampleHealth());

    expect(view.runtime).toMatchObject({
      uptimeText: '1일 1시간 1분',
      memoryText: '128 / 256 MB',
    });
    expect(view.database).toMatchObject({
      poolText: '3/10/20 (대기 1)',
      poolCompactText: '3/20 (대기 1)',
      dbSizeText: '150 MB',
      activeConnectionsText: '4',
    });
    expect(view.ws).toMatchObject({
      onlineCount: 14,
      onlineCountText: '14',
      upgradesOk: 200,
      rejectTotal: 6,
      closeNormal: 180,
      closeAbnormal: 15,
      closeIdleTimeout: 5,
      abnormalRateText: '7.5%',
    });
    expect(view.ws.daily[0]).toMatchObject({
      day: '2026-11-05',
      dayLabel: '11-05',
      rejectTotal: 3,
      abnormalRateText: '8.93%',
    });
    expect(view.slowRequests[0]).toMatchObject({
      atText: '11-05 12:04:05',
      method: 'POST',
      routeLabel: '게임 액션',
      path: '/api/game/catch',
      statusCode: 200,
      durationText: '620ms',
    });
    expect(view.alerts).toEqual([
      {
        code: 'http-p95-high',
        severity: 'crit',
        severityLabel: '위험',
        title: 'HTTP p95 지연 초과',
        detail: '최근 요청 p95 지연이 임계치를 넘었어요.',
        observed: 820,
        threshold: 500,
      },
      {
        code: 'ws-abnormal-close',
        severity: 'warn',
        severityLabel: '주의',
        title: 'WebSocket 비정상 종료 증가',
        detail: '비정상 종료 비율이 높아요.',
        observed: 0.12,
        threshold: 0.1,
      },
    ]);
  });

  it('DB 용량이나 활성 연결이 권한 제한(null)이면 안내 문구로 변환한다', () => {
    const view = selectOpsHealthView(sampleHealth({
      database: {
        poolTotal: 5,
        poolIdle: 5,
        poolWaiting: 0,
        poolMax: 10,
        dbSizeBytes: null,
        activeConnections: null,
      },
    }));

    expect(view.database.dbSizeText).toBe('확인 불가');
    expect(view.database.activeConnectionsText).toBe('권한 제한');
    expect(view.database.poolText).toBe('0/5/10 (대기 0)');
  });

  it('데이터가 null이면 빈 뷰를 안전하게 반환한다', () => {
    const view = selectOpsHealthView(null);
    expect(view.runtime.uptimeText).toBe('--');
    expect(view.runtime.memoryText).toBe('--');
    expect(view.database.poolText).toBe('--');
    expect(view.database.dbSizeText).toBe('--');
    expect(view.database.activeConnectionsText).toBe('--');
    expect(view.ws.onlineCount).toBeNull();
    expect(view.ws.onlineCountText).toBe('--');
    expect(view.ws.abnormalRateText).toBe('--');
    expect(view.ws.daily).toEqual([]);
    expect(view.slowRequests).toEqual([]);
    expect(view.alerts).toEqual([]);
  });
});
