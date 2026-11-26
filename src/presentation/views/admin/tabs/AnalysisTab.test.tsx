// 경제·진행 탭 — granted에서 세 구역이 같은 조회로 채워지고, 기간 전환이 조회를 바꾸는지 확인한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import type { AdminRole } from '../../../../features/admin/model/types';
import { todayKST } from '../../../../features/admin/model/metrics';
import { api } from '../../../../platform/api';
import AnalysisTab from './AnalysisTab';
import type { AnalysisSection } from '../routes';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      overview: vi.fn(),
      users: vi.fn(async () => [
        { user_id: 'u1', email: 'a@example.com', nickname: '갈치', is_anonymous: false, gold: 100, fame: 100, boat: 1, rod: 1,
          visited: ['village'], restricted: false, last_action_at: null },
        { user_id: 'u2', email: 'b@example.com', gold: 300, fame: 5000, boat: 3, rod: 3,
          visited: ['village', 'world'], restricted: false, last_action_at: null },
      ]),
      economy: vi.fn(async () => [{
        day: todayKST(), sells: 2, sell_gold: 1000, coupon_gold: 200, mail_gold: 0,
        bounty_gold: 0, achievement_gold: 0,
        rod_cost: 300, boat_cost: 0, hat_cost: 100,
      }]),
      dailyStats: vi.fn(async () => [{
        day: todayKST(), dau: 5, newUsers: 2, newAccounts: 1, sessions: 7, sessionMinutes: 70,
        medianSessionMinutes: 8, catches: 40, goldIn: 1000, goldOut: 300, actions: 90,
      }]),
      retention: vi.fn(async () => [
        { day: '2026-10-01', size: 4, d1: 0.5, d7: null, d30: null },
      ]),
      bountyFunnel: vi.fn(async () => [{
        day: todayKST(), named_accepts: 3, tickets: 2, duels_won: 1, duels_lost: 1,
        named_rewards: 1, general_accepts: 4, general_rewards: 4,
      }]),
      onboardingFunnel: vi.fn(async () => ({
        eventsWindowDays: 7,
        conversion: {
          totalUsers: 10,
          guestUsers: 6,
          googleLinkedUsers: 4,
          conversionRate: 0.4,
          medianMinutes: 25,
          p90Minutes: 180,
          buckets: [
            { bucket: 'under_10m', count: 2, pct: 50 },
            { bucket: '10m_to_1h', count: 2, pct: 50 },
          ],
        },
        tutorials: {
          totalUsers: 10,
          totalWithSave: 9,
          stages: [
            { id: 'village', completed: 8, rate: 0.8, dropOffFromPrev: 0, stepRate: null },
            { id: 'sea', completed: 6, rate: 0.6, dropOffFromPrev: 2, stepRate: 0.75 },
            { id: 'bounty-quests', completed: 4, rate: 0.4, dropOffFromPrev: 2, stepRate: 0.667 },
            { id: 'bounty-named', completed: 2, rate: 0.2, dropOffFromPrev: 2, stepRate: 0.5 },
          ],
        },
        steps: [
          { id: 'first_visit', users: 10, rate: 1, stepRate: null, basis: 'lifetime' },
          { id: 'tutorial_complete', users: 2, rate: 0.2, stepRate: 0.2, basis: 'lifetime' },
          { id: 'first_catch', users: 7, rate: 0.7, stepRate: 3.5, basis: 'lifetime' },
          { id: 'first_sell', users: 5, rate: 0.5, stepRate: 0.714, basis: 'hybrid_7d' },
          { id: 'first_harbor', users: 4, rate: 0.4, stepRate: 0.8, basis: 'lifetime' },
          { id: 'first_upgrade', users: 3, rate: 0.3, stepRate: 0.75, basis: 'lifetime' },
        ],
      })),
    },
  },
}));

afterEach(cleanup);

function show(section: AnalysisSection, role: AdminRole = 'admin') {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={{ access: 'granted', uid: role, role, showStaffBadge: false, setStaffBadge: async () => {} }}>
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

  it('경제 구역 — events 7일 보관 한도 기준으로 고정 조회하고 30일·90일 전환 스위치를 두지 않는다', async () => {
    show('economy');
    await screen.findByRole('img', { name: '골드 유입 일별 추이' });
    expect(vi.mocked(api.admin.economy)).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('group', { name: '기간 선택' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/최근 7일\(이벤트 보관 한도\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/daily_stats/)).toBeInTheDocument();
  });

  it('진행 구역 — 분포 차트·오픈월드 존 해금(구 바다 6개 제외)·막힌 유저·바운티 퍼널을 채운다', async () => {
    show('progression');
    // 조각배(명성 100)는 다음 배 돛단배(하한 1,000)에 막혀 있다 — 명부가 들어오면 이 줄이 생긴다
    expect(await screen.findByText('돛단배(T2)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '배 단계별 유저 수' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '낚싯대 레벨별 유저 수' })).toBeInTheDocument();
    const zoneChart = screen.getByRole('img', { name: '오픈월드 존별 해금 유저 수' });
    expect(zoneChart).toBeInTheDocument();
    expect(screen.getByText(/마을 2\/2, 태평양 2\/2\(수배\), 동남아 1\/2\(수배\)/)).toBeInTheDocument();
    expect(screen.getByText(/visited 기준 현행 지역 도달: 마을 2\/2, 대양 1\/2/)).toBeInTheDocument();
    expect(screen.getByText('갈치(a@example.com)')).toBeInTheDocument();
    expect(await screen.findByText('바운티 퍼널 (최근 7일, 이벤트 보관 한도)')).toBeInTheDocument();
    expect(screen.getByText('결투 없이 남은 흔적')).toBeInTheDocument();
    expect(screen.getByText('결투까지 100%')).toBeInTheDocument();
    const convCell = (await screen.findByText('게스트 → 구글 계정 전환')).closest('section')!;
    expect(await within(convCell).findByText('40%')).toBeInTheDocument();
    expect(within(convCell).getByText('25분')).toBeInTheDocument();
    expect(within(convCell).getByText('3시간')).toBeInTheDocument();
    expect(screen.getByText('튜토리얼 4단계 완료·이탈')).toBeInTheDocument();
    const stepsCell = screen.getByText('초반 온보딩 6단계 퍼널').closest('section')!;
    expect(within(stepsCell).getByRole('cell', { name: '첫 판매' })).toBeInTheDocument();
    expect(within(stepsCell).getByText(/첫 판매\(first_sell\)처럼 hybrid_7d 기준 단계는/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '기간 선택' })).not.toBeInTheDocument();
  });

  it('활동 구역 — 일별 집계 차트와 리텐션 코호트를 채우고, 30일·90일 기간 전환을 제공한다', async () => {
    show('activity');
    // 막대의 title은 '월-일: 값', 집계되지 않은 날은 '월-일: 미집계'다
    const bar = (name: string) => screen.getByRole('img', { name })
      .querySelector(`[title^="${todayKST().slice(5)}:"]`)?.getAttribute('title');
    await waitFor(() => expect(bar('최근 30일 일별 활성 사람 수')).toBe(`${todayKST().slice(5)}: 5`));
    expect(bar('최근 30일 일별 접속 세션 수')).toBe(`${todayKST().slice(5)}: 7`);
    expect(screen.getByRole('img', { name: '최근 30일 일별 활성 사람 수' })
      .querySelectorAll('[title$=": 미집계"]')).toHaveLength(29);
    expect(screen.getByText(/최근 30일 중 1일이 집계되어 있어요/)).toBeInTheDocument();
    expect(await screen.findByText('2026-10-01')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    const [from, to] = vi.mocked(api.admin.dailyStats).mock.calls[0];
    expect(to).toBe(todayKST());
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBe(29);

    expect(screen.getAllByRole('group', { name: '기간 선택' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '90일' }));
    await waitFor(() => expect(vi.mocked(api.admin.dailyStats)).toHaveBeenCalledTimes(2));
  });

  it('maintainer 역할의 경제 구역은 명부 골드가 null이어도 userAggregates로 합계·대상 수·중앙값·상위 25%·최대를 표시한다', async () => {
    vi.mocked(api.admin.overview).mockResolvedValueOnce({
      users: [{
        user_id: 'op-1', opHandle: 'op-1', email: null, nickname: '어부', is_anonymous: false,
        signed_up_at: null, last_sign_in_at: null, gold: null, fame: null, boat: null, rod: null,
        location_kind: null, location_id: null, visited: [], restricted: false,
        save_version: null, last_action_at: null, last_session_at: null, total_session_sec: 0,
      }],
      userAggregates: {
        totalUsers: 20,
        activePlayers: 12,
        asOf: '2026-11-05T03:00:00Z',
        activeUsers: { today: 3, week: 7, month: 12 },
        newToday: { users: 2, accounts: 1 },
        gold: { count: 15, sum: 45000, median: 1500, p75: 5000, max: 20000 },
        progression: {
          boats: [], rods: [], regionReach: [], zoneUnlocks: [],
          fameGateStalled: { total: 0, byNextTier: [] },
        },
      },
      recentEvents: [], spamFlags: [], dailyStats: [], retention: [], sessions: [],
      live: { count: 0, online: [] },
    } as never);

    show('economy', 'maintainer');
    expect(await screen.findByText('4.5만')).toBeInTheDocument();
    expect(screen.getByText('저장된 골드 총합, 대상 15명')).toBeInTheDocument();
    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    expect(screen.getByText('2만')).toBeInTheDocument();
    expect(screen.getByText('4.5만G')).toBeInTheDocument();
  });

  it('maintainer 역할의 진행 구역은 명부 진행 필드가 null이어도 userAggregates로 분포·도달·존 해금·명성 게이트 내역을 표시한다', async () => {
    vi.mocked(api.admin.overview).mockResolvedValueOnce({
      users: [{
        user_id: 'op-1', opHandle: 'op-1', email: null, nickname: '어부', is_anonymous: false,
        signed_up_at: null, last_sign_in_at: null, gold: null, fame: null, boat: null, rod: null,
        location_kind: null, location_id: null, visited: [], restricted: false,
        save_version: null, last_action_at: null, last_session_at: null, total_session_sec: 0,
      }],
      userAggregates: {
        totalUsers: 10,
        activePlayers: 4,
        asOf: '2026-11-05T03:00:00Z',
        activeUsers: { today: 2, week: 3, month: 4 },
        newToday: { users: 1, accounts: 1 },
        gold: { count: 4, sum: 1000, median: 200, p75: 300, max: 500 },
        progression: {
          boats: [{ tier: 0, count: 1 }, { tier: 1, count: 2 }, { tier: 3, count: 1 }],
          rods: [{ level: 1, count: 2 }, { level: 4, count: 2 }],
          regionReach: [{ id: 'village', count: 4 }, { id: 'world', count: 3 }],
          zoneUnlocks: [{ id: 'village', count: 4 }, { id: 'pacific', count: 3 }, { id: 'seasia', count: 1 }],
          fameGateStalled: {
            total: 3,
            byNextTier: [{ nextTier: 2, count: 2 }, { nextTier: 4, count: 1 }],
          },
        },
      },
      recentEvents: [], spamFlags: [], dailyStats: [], retention: [], sessions: [],
      live: { count: 0, online: [] },
    } as never);

    show('progression', 'maintainer');
    expect(await screen.findByText(/전체 10명 중 휴면 게스트 6명을 제외한 활성 플레이어 4명/)).toBeInTheDocument();
    expect(screen.getByText(/맨발 1, 1 조각배 2, 3 정크선 1/)).toBeInTheDocument();
    expect(screen.getByText('Lv1 ~ Lv4')).toBeInTheDocument();
    expect(screen.getByText(/마을 4\/4, 태평양 3\/4\(수배\), 동남아 1\/4\(수배\)/)).toBeInTheDocument();
    expect(screen.getByText(/visited 기준 현행 지역 도달: 마을 4\/4, 대양 3\/4/)).toBeInTheDocument();
    expect(screen.getByText('총 3명이 다음 배 명성 조건에 막혀 있어요.')).toBeInTheDocument();
    expect(screen.getByText('돛단배(T2)')).toBeInTheDocument();
    expect(screen.getByText('2명')).toBeInTheDocument();
    expect(screen.getByText('범선(T4)')).toBeInTheDocument();
    expect(screen.getByText('1명')).toBeInTheDocument();
  });

  it('maintainer 역할의 진행 구역에서 명성 게이트 정체 인원이 0명일 때만 완료 안내를 표시한다', async () => {
    vi.mocked(api.admin.overview).mockResolvedValueOnce({
      users: [],
      userAggregates: {
        totalUsers: 5,
        activePlayers: 3,
        asOf: '2026-11-05T03:00:00Z',
        activeUsers: { today: 1, week: 2, month: 3 },
        newToday: { users: 0, accounts: 0 },
        gold: { count: 3, sum: 300, median: 100, p75: 150, max: 200 },
        progression: {
          boats: [{ tier: 9, count: 3 }],
          rods: [{ level: 10, count: 3 }],
          regionReach: [{ id: 'village', count: 3 }, { id: 'world', count: 3 }],
          zoneUnlocks: [{ id: 'village', count: 3 }],
          fameGateStalled: { total: 0, byNextTier: [] },
        },
      },
      recentEvents: [], spamFlags: [], dailyStats: [], retention: [], sessions: [],
      live: { count: 0, online: [] },
    } as never);

    show('progression', 'maintainer');
    expect(await screen.findByText('모두 다음 배의 명성 하한을 넘었어요.')).toBeInTheDocument();
  });
});
