// 실시간 탭 — 실시간 접속 목록을 오래 연결된 순으로 놓고, 위치 이름·게스트 표시·접속 시간을 같은 기준 시각으로 적는지 확인한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import { api } from '../../../../platform/api';
import { AdminViewModeCtx } from '../viewMode';
import LiveTab from './LiveTab';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      live: vi.fn(async () => ({
        count: 2,
        online: [
          { uid: 'u2', nick: '새내기', nickname: '새내기', email: null, region: 'village', zone: null, connectedAt: '2026-11-05T02:56:00Z', guest: true },
          { uid: 'u1', nick: '고참', nickname: '고참', email: 'old@example.com', region: 'world', zone: 'indian', connectedAt: '2026-11-05T01:37:00Z', guest: false },
        ],
      })),
      chatReports: vi.fn(async () => []),
      users: vi.fn(async () => []),
    },
  },
}));

// 시계는 Date만 고정한다 — 조회의 비동기 흐름은 그대로 흐른다
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T03:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('실시간 탭', () => {
  it('접속 목록·위치 분포·지표 줄을 실시간 접속으로 채운다', async () => {
    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'admin', role: 'admin', canViewEmail: true, showStaffBadge: false, setStaffBadge: async () => {} }}>
          <AdminViewModeCtx.Provider value={{ viewMode: 'detail', setViewMode: () => {} }}>
            <LiveTab onCompose={() => {}} />
          </AdminViewModeCtx.Provider>
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );
    await screen.findAllByText('고참(old@example.com)');
    const rows = screen.getAllByRole('row').slice(1, 3);
    // 오래 연결된 사람이 위에 온다
    expect(within(rows[0]).getByText('고참(old@example.com)')).toBeInTheDocument();
    expect(within(rows[0]).getByText('u1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('인도양')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1시간 23분')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: '우편' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: '상세' })).toBeInTheDocument();
    expect(within(rows[1]).getByText('새내기(게스트)')).toBeInTheDocument();
    expect(within(rows[1]).getByText('마을')).toBeInTheDocument();
    expect(within(rows[1]).getByText('4분')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '접속 중인 사람의 위치 분포' })).toBeInTheDocument();

    // 지표 카드는 .pf-admin-kpi-card다
    const tile = (label: string) => screen.getAllByText(label)
      .map(el => el.closest('.pf-admin-kpi-card') as HTMLElement | null)
      .find((el): el is HTMLElement => el !== null)!;
    expect(within(tile('지금 접속')).getByText('2')).toBeInTheDocument();
    expect(within(tile('가입 계정')).getByText('1')).toBeInTheDocument();
    expect(within(tile('게스트')).getByText('1')).toBeInTheDocument();
    expect(within(tile('가장 오래 접속')).getByText('1시간 23분')).toBeInTheDocument();
    expect(within(tile('가장 오래 접속')).getByText('고참(old@example.com)')).toBeInTheDocument();
  });

  it('maintainer 비식별 투영에서는 opHandle과 닉네임을 표시하고 이메일 빈칸(—)을 출력하지 않는다', async () => {
    vi.mocked(api.admin.live).mockResolvedValueOnce({
      count: 1,
      online: [
        { uid: 'op-live01', opHandle: 'op-live01', nick: '선장', nickname: '선장', region: 'world', zone: 'indian', connectedAt: '2026-11-05T02:00:00Z', guest: false } as never,
      ],
    });

    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'maintainer', role: 'maintainer', canViewEmail: false, showStaffBadge: false, setStaffBadge: async () => {} }}>
          <LiveTab />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );

    await screen.findAllByText('선장');
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('선장')).toBeInTheDocument();
    expect(within(rows[1]).getByText('op-live01')).toBeInTheDocument();
    expect(screen.queryByText(/—/)).toBeNull();
  });
});
