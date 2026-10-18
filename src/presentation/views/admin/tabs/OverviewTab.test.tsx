// 개요 탭 — granted에서 지표 줄·이벤트 피드·위험 신호가 같은 조회로 채워지는지 확인한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import OverviewTab from './OverviewTab';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      users: vi.fn(async () => [
        { user_id: 'u1', email: 'a@example.com', gold: 100, fame: 10, restricted: true },
        { user_id: 'u2', email: 'b@example.com', gold: 300, fame: 20, restricted: false },
      ]),
      dailyActive: vi.fn(async () => [{ day: '2026-10-18', dau: 5, wau7: 9 }]),
      catchQuality: vi.fn(async () => [
        { day: '2026-10-18', catches: 7, perfect: 1, with_bait: 0, avg_size: 10 },
        { day: '2026-10-17', catches: 3, perfect: 0, with_bait: 0, avg_size: 9 },
      ]),
      recentEvents: vi.fn(async () => [{
        id: 1, user_id: 'u1-aaaaaaaa-bbbb', type: 'catch',
        payload: { fishId: 'x', judgment: 'good', size: 12.3, spot: 's' }, created_at: '2026-10-18T03:00:00Z',
      }]),
      spamFlags: vi.fn(async () => [{
        user_id: 'u1', catches_7d: 40, fast_gap_7d: 3, perfect_pct: 10, perfect_pct_global: 10,
      }]),
      imports: vi.fn(async () => []),
    },
  },
}));

afterEach(cleanup);

// 지표 타일과 위험 신호 줄은 이름이 겹칠 수 있어, 타일은 오목한 칸(pf-notch) 하나로 고른다
const tile = (label: string) => screen.getAllByText(label)
  .map(el => el.parentElement as HTMLElement).find(el => el.classList.contains('pf-notch'))!;

describe('개요 탭', () => {
  it('지표 줄·최근 이벤트 피드·위험 신호를 채운다', async () => {
    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'admin' }}>
          <OverviewTab />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );
    expect(await screen.findByText('낚시')).toBeInTheDocument(); // 피드의 유형 이름(catch)
    expect(within(tile('등록 유저')).getByText('2')).toBeInTheDocument();
    expect(within(tile('금일 DAU')).getByText('5')).toBeInTheDocument();
    expect(within(tile('금일 DAU')).getByText('최근 7일 WAU 9')).toBeInTheDocument();
    expect(within(tile('최근 7일 낚시')).getByText('10')).toBeInTheDocument();
    expect(within(tile('보유 골드 합')).getByText('400')).toBeInTheDocument();
    expect(within(tile('명성 합')).getByText('30')).toBeInTheDocument();

    // 위험 신호 — 제재 1건, 연타 1명, 반입 0건. 신호가 있으면 이상탐지 안내가 붙는다
    const risk = screen.getByText('위험 신호').closest('section')!;
    expect(within(risk).getByText('제재 계정').nextElementSibling).toHaveTextContent('1');
    expect(within(risk).getByText('연타 플래그 유저').nextElementSibling).toHaveTextContent('1');
    expect(within(risk).getByText('이사 코드 반입').nextElementSibling).toHaveTextContent('0');
    expect(within(risk).getByText(/이상탐지/)).toBeInTheDocument();
  });

  it('권한이 없으면 조회하지 않고 빈 골격과 안내를 그린다', () => {
    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'local', uid: null }}>
          <OverviewTab />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );
    expect(within(tile('금일 DAU')).getByText('—')).toBeInTheDocument();
    expect(screen.getByText('운영 DB에 연결하면 채워져요.')).toBeInTheDocument();
  });
});
