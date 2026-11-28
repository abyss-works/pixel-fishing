import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import type { AdminAccess } from '../../../../features/admin/service/accessContext';
import type { AdminClientMetrics, AdminRole } from '../../../../features/admin/model/types';
import { api } from '../../../../platform/api';
import ClientMetricsSection from './ClientMetricsSection';

const sampleClientMetrics = (over: Partial<AdminClientMetrics> = {}): AdminClientMetrics => ({
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
      day: '2026-11-26',
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
  ],
  ...over,
});

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      clientMetrics: vi.fn(async (days = 7) => sampleClientMetrics({ days })),
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const show = (access: AdminAccess, role: AdminRole = 'admin', days = 7, mode: 'summary' | 'detail' = 'detail') => render(
  <QueryProvider>
    <AdminAuthCtx.Provider value={{ access, uid: null, role, canViewEmail: role === 'admin', showStaffBadge: false, setStaffBadge: async () => {} }}>
      <ClientMetricsSection granted={access === 'granted'} days={days} mode={mode} />
    </AdminAuthCtx.Provider>
  </QueryProvider>,
);

describe('클라이언트 체감 성능 섹션', () => {
  it('권한이 없으면 조회하지 않고 빈 표기와 안내 문구를 보여 준다', () => {
    const { container } = show('local');
    expect(screen.getByText('클라이언트 체감 성능 및 단절')).toBeInTheDocument();
    expect(screen.getByText(/실제 브라우저 세션 비콘 집계이며/)).toBeInTheDocument();
    expect(screen.getByText('수집된 클라이언트 성능 지표가 아직 없어요.')).toBeInTheDocument();
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(7);
    expect(container.textContent).not.toContain('—');
    expect(vi.mocked(api.admin.clientMetrics)).not.toHaveBeenCalled();
  });

  it('요약 KPI, 보조 요약, 일별 추이 표를 렌더링한다', async () => {
    show('granted');
    await waitFor(() => expect(vi.mocked(api.admin.clientMetrics)).toHaveBeenCalledWith(7));

    const table = await screen.findByRole('table', { name: '일별 클라이언트 체감 성능' });
    expect(screen.getAllByText('LCP p95').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('INP p95').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('CLS 평균')).toBeInTheDocument();
    expect(screen.getAllByText('TTFB p95').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('액션 RTT p95')).toBeInTheDocument();
    expect(screen.getByText('조회 RTT p95')).toBeInTheDocument();
    expect(screen.getByText('긴 프레임 비율')).toBeInTheDocument();
    expect(screen.getByText('WS 재연결 / 비정상')).toBeInTheDocument();

    expect(screen.getAllByText('2450ms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('185ms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0.042').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('420ms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('160ms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('95ms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1.5%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('7 / 2')).toBeInTheDocument();

    expect(screen.getByText(/수집 보고/)).toHaveTextContent('수집 보고 120건');
    expect(screen.getByText(/타임아웃 \(액션 2 \/ 조회 1\)/)).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '409 재시도 3건')).toBeInTheDocument();
    expect(screen.getByText(/긴 프레임 \(30 \/ 2,000\)/)).toBeInTheDocument();

    const row = within(table).getByText('2026-11-26').closest('tr')!;
    expect(within(row).getByText('2450ms')).toBeInTheDocument();
    expect(within(row).getByText('1.5%')).toBeInTheDocument();
  });

  it('일별 추이가 비어 있으면 빈 안내 문구를 표시한다', async () => {
    vi.mocked(api.admin.clientMetrics).mockResolvedValueOnce(sampleClientMetrics({ daily: [] }));
    show('granted');
    expect(await screen.findByText('수집된 클라이언트 성능 지표가 아직 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: '일별 클라이언트 체감 성능' })).toBeNull();
  });

  it('요약 보기에서는 간결한 오류·체감 요약 카드만 노출하고 8 KPI와 일별 표를 숨긴다', async () => {
    show('granted', 'admin', 7, 'summary');
    await waitFor(() => expect(vi.mocked(api.admin.clientMetrics)).toHaveBeenCalledWith(7));
    expect(screen.getByText('클라이언트 오류·체감 요약 (최근 7일)')).toBeInTheDocument();
    expect(screen.getByText('WebSocket 재연결 및 비정상 종료')).toBeInTheDocument();
    expect(screen.queryByText('INP p95')).toBeNull();
    expect(screen.queryByRole('table', { name: '일별 클라이언트 체감 성능' })).toBeNull();
  });

  it('상위에서 내려준 days(14일/30일)에 맞춰 clientMetrics를 조회한다', async () => {
    const { rerender } = show('granted', 'admin', 14);
    await waitFor(() => expect(vi.mocked(api.admin.clientMetrics)).toHaveBeenCalledWith(14));
    rerender(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: null, role: 'admin', canViewEmail: true, showStaffBadge: false, setStaffBadge: async () => {} }}>
          <ClientMetricsSection granted days={30} mode="detail" />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );
    await waitFor(() => expect(vi.mocked(api.admin.clientMetrics)).toHaveBeenCalledWith(30));
  });

  it('조회 실패 시 오류 메시지와 다시 시도 버튼을 표시한다', async () => {
    vi.mocked(api.admin.clientMetrics).mockRejectedValueOnce(new Error('조회 실패'));
    show('granted');
    expect(await screen.findByText('조회 실패')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(vi.mocked(api.admin.clientMetrics)).toHaveBeenCalledTimes(2));
  });
});
