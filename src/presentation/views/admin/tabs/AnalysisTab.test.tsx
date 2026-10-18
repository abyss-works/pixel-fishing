// 경제·진행 탭 — granted에서 세 구역이 같은 조회로 채워지고, 기간 전환이 조회를 바꾸는지 확인한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import { todayKST } from '../../../../features/admin/model/metrics';
import { api } from '../../../../platform/api';
import AnalysisTab from './AnalysisTab';
import type { AnalysisSection } from '../routes';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      users: vi.fn(async () => [
        { user_id: 'u1', email: 'a@example.com', gold: 100, fame: 100, boat: 1, rod: 1,
          visited: ['village'], restricted: false, last_action_at: null },
        { user_id: 'u2', email: 'b@example.com', gold: 300, fame: 5000, boat: 2, rod: 3,
          visited: ['village', 'ocean'], restricted: false, last_action_at: null },
      ]),
      economy: vi.fn(async () => [{
        day: todayKST(), sells: 2, sell_gold: 1000, coupon_gold: 200,
        rod_cost: 300, boat_cost: 0, bait_cost: 100,
      }]),
      dailyActive: vi.fn(async () => [{ day: todayKST(), dau: 5, wau7: 9 }]),
      retention: vi.fn(async () => [
        { cohort: '2026-10-01', users: 4, d1: 50, d3: null, d7: null, d14: null, d30: null },
      ]),
      bountyFunnel: vi.fn(async () => [{
        day: todayKST(), named_accepts: 3, tickets: 2, duels_won: 1, duels_lost: 1,
        named_rewards: 1, general_accepts: 4, general_rewards: 4,
      }]),
    },
  },
}));

afterEach(cleanup);

function show(section: AnalysisSection) {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'admin' }}>
        <AnalysisTab section={section} onSection={() => {}} />
      </AdminAuthCtx.Provider>
    </QueryProvider>,
  );
}

describe('경제·진행 탭', () => {
  it('경제 구역 — 잔고 지표·유입·유출 차트·원장 대차대조를 채운다', async () => {
    show('economy');
    // 차트는 조회 전에도 빈 골격으로 그려지므로, 값이 들어오길 기다린다
    const today = (name: string) => within(screen.getByRole('img', { name })).getByText(/금일/).textContent;
    await waitFor(() => expect(today('골드 유입 일별 추이')).toContain('1,200'));
    expect(today('골드 유출 일별 추이')).toContain('400');
    // 유입 1,200G − 유출 400G = 순유입 800G, 잔고 합은 400G(유출합과 값이 같아 두 줄에 나온다)
    expect(screen.getByText('1,200G')).toBeInTheDocument();
    expect(screen.getByText('800G')).toBeInTheDocument();
    expect(screen.getAllByText('400G')).toHaveLength(2);
  });

  it('기간 전환은 그 기간으로 다시 조회한다 — 머리에 하나만 있다', async () => {
    show('economy');
    await screen.findByRole('img', { name: '골드 유입 일별 추이' });
    expect(vi.mocked(api.admin.economy)).toHaveBeenCalledWith(30);
    expect(screen.getAllByRole('group', { name: '기간 선택' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '90일' }));
    await waitFor(() => expect(vi.mocked(api.admin.economy)).toHaveBeenCalledWith(90));
  });

  it('진행 구역 — 분포 차트·지역 도달·막힌 유저·바운티 퍼널을 채우고 기간 전환은 없다', async () => {
    show('progression');
    // 조각배(명성 100)는 다음 배 돛단배(하한 1,000)에 막혀 있다 — 명부가 들어오면 이 줄이 생긴다
    expect(await screen.findByText('돛단배(T2)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '배 단계별 유저 수' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '낚싯대 레벨별 유저 수' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '지역별 도달한 유저 수' })).toBeInTheDocument();
    expect(screen.getByText(/마을 2\/2 · 태평양 1\/2/)).toBeInTheDocument();
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
    expect(await screen.findByText('바운티 퍼널 (최근 7일)')).toBeInTheDocument();
    expect(screen.getByText('결투 없이 남은 흔적')).toBeInTheDocument();
    expect(screen.getByText('결투까지 100%')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '기간 선택' })).not.toBeInTheDocument();
  });

  it('활동 구역 — 금일 DAU·WAU 차트와 리텐션 코호트를 채운다', async () => {
    show('activity');
    const chart = await screen.findByRole('img', { name: /일별 활성 유저, 최근 30일의 DAU와 WAU, 금일 DAU 5/ });
    expect(within(chart).getByText(/금일 DAU/).textContent).toBe('금일 DAU 5 · WAU 9');
    expect(await screen.findByText('2026-10-01')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(vi.mocked(api.admin.dailyActive)).toHaveBeenCalledWith(30);
  });
});
