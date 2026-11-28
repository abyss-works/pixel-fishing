import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import type { AdminAccess } from '../../../../features/admin/service/accessContext';
import type { AdminOpsHealth, AdminRole } from '../../../../features/admin/model/types';
import { api } from '../../../../platform/api';
import ServerHealthSection from './ServerHealthSection';

const sampleHealth = (over: Partial<AdminOpsHealth> = {}): AdminOpsHealth => ({
  runtime: {
    uptimeSec: 7260,
    rssMb: 240,
    heapUsedMb: 120,
    heapTotalMb: 180,
  },
  database: {
    poolTotal: 8,
    poolIdle: 5,
    poolWaiting: 0,
    poolMax: 20,
    dbSizeBytes: 104_857_600,
    activeConnections: 3,
  },
  httpSummary: {
    total: 500,
    status409: 1,
    status426: 1,
    status429: 5,
    status4xx: 8,
    status5xx: 2,
    rate409: 0.002,
    rate426: 0.002,
    rate429: 0.01,
    rate4xx: 0.016,
    rate5xx: 0.004,
  },
  ws: {
    onlineCount: 12,
    summary: {
      upgradesOk: 150,
      reject401: 2,
      reject403: 0,
      reject500: 1,
      closeNormal: 130,
      closeAbnormal: 10,
      closeIdleTimeout: 5,
    },
    daily: [
      {
        day: '2026-11-05',
        upgradesOk: 150,
        reject401: 2,
        reject403: 0,
        reject500: 1,
        closeNormal: 130,
        closeAbnormal: 10,
        closeIdleTimeout: 5,
      },
    ],
  },
  slowRequests: [],
  alerts: [],
  ...over,
});

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      opsHealth: vi.fn(async () => sampleHealth()),
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const show = (access: AdminAccess, role: AdminRole = 'admin') => render(
  <QueryProvider>
    <AdminAuthCtx.Provider value={{ access, uid: null, role, canViewEmail: role === 'admin', showStaffBadge: false, setStaffBadge: async () => {} }}>
      <ServerHealthSection granted={access === 'granted'} />
    </AdminAuthCtx.Provider>
  </QueryProvider>,
);

describe('서버 상태 및 경보 섹션', () => {
  it('권한이 없으면 조회하지 않고 로컬 안내와 빈 상태를 표시한다', () => {
    const { container } = show('local');
    expect(screen.getByText('서버, 소켓, DB 상태 및 경보')).toBeInTheDocument();
    expect(screen.getByText(/운영 DB에 연결하면/)).toBeInTheDocument();
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(7);
    expect(container.textContent).not.toContain('—');
    expect(vi.mocked(api.admin.opsHealth)).not.toHaveBeenCalled();
  });

  it('경보가 없으면 긍정 배지와 런타임, DB, 소켓 지표를 표시하고 슬로우 요청 안내를 보여 준다', async () => {
    show('granted');
    expect(await screen.findByText('활성 경보 없음')).toBeInTheDocument();
    expect(vi.mocked(api.admin.opsHealth)).toHaveBeenCalledWith(7);
    expect(screen.getByText('2시간 1분')).toBeInTheDocument();
    expect(screen.getByText('120 / 240 MB')).toBeInTheDocument();
    expect(screen.getByText('3/20 (대기 0)')).toBeInTheDocument();
    expect(screen.getByText('100 MB')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('최근 슬로우 요청이 없어요.')).toBeInTheDocument();
    expect(screen.getByText('11-05')).toBeInTheDocument();
  });

  it('활성 경보와 슬로우 요청이 있으면 심각도 배지와 요청 목록을 표시한다', async () => {
    vi.mocked(api.admin.opsHealth).mockResolvedValueOnce(sampleHealth({
      alerts: [
        {
          code: 'http-5xx-rate',
          severity: 'crit',
          title: '5xx 오류율 임계 초과',
          detail: '최근 5xx 비율이 기준을 넘었어요.',
          observed: 0.08,
          threshold: 0.02,
        },
        {
          code: 'ws-abnormal-close',
          severity: 'warn',
          title: '소켓 비정상 종료 증가',
          detail: '비정상 종료가 늘었어요.',
          observed: 0.15,
          threshold: 0.1,
        },
      ],
      slowRequests: [
        {
          at: '2026-11-05T03:04:05.000Z',
          method: 'POST',
          routeGroup: 'action',
          path: '/api/game/catch',
          statusCode: 200,
          durationMs: 740,
        },
      ],
    }));

    show('granted');
    expect(await screen.findByText('5xx 오류율 임계 초과')).toBeInTheDocument();
    expect(screen.getByText('위험')).toBeInTheDocument();
    expect(screen.getByText('주의')).toBeInTheDocument();
    expect(screen.getByText('소켓 비정상 종료 증가')).toBeInTheDocument();

    const slowRow = screen.getByText('/api/game/catch').closest('tr')!;
    expect(within(slowRow).getByText('POST')).toBeInTheDocument();
    expect(within(slowRow).getByText('게임 액션')).toBeInTheDocument();
    expect(within(slowRow).getByText('740ms')).toBeInTheDocument();
  });

  it('기간 전환 버튼(14일/30일)을 누르면 해당 기간으로 opsHealth를 다시 조회한다', async () => {
    show('granted');
    await screen.findByText('활성 경보 없음');
    fireEvent.click(screen.getByRole('button', { name: '14일' }));
    await waitFor(() => expect(vi.mocked(api.admin.opsHealth)).toHaveBeenCalledWith(14));
  });
});
