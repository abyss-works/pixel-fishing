// 개요 탭 — granted에서 지표 줄(명부·실시간·세션·리텐션), 일별 집계 차트, 이벤트 피드, 위험 신호가 채워지는지 확인한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import { api } from '../../../../platform/api';
import OverviewTab from './OverviewTab';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      users: vi.fn(async () => [
        { user_id: 'u1', email: 'a@example.com', restricted: true, is_anonymous: false,
          signed_up_at: '2026-11-05T01:00:00Z', last_action_at: '2026-11-05T02:00:00Z', last_session_at: null },
        { user_id: 'u2', email: 'b@example.com', restricted: false, is_anonymous: true,
          signed_up_at: '2026-10-01T00:00:00Z', last_action_at: '2026-11-01T00:00:00Z', last_session_at: null },
        { user_id: 'u3', email: null, restricted: false, is_anonymous: true,
          signed_up_at: '2026-09-01T00:00:00Z', last_action_at: '2026-10-20T00:00:00Z', last_session_at: null },
      ]),
      recentEvents: vi.fn(async () => [{
        id: 1, user_id: 'u1-aaaaaaaa-bbbb', type: 'catch',
        payload: { fishId: 'x', judgment: 'good', size: 12.3, spot: 's' }, created_at: '2026-11-05T02:00:00Z',
      }]),
      spamFlags: vi.fn(async () => [{
        user_id: 'u1', catches_7d: 40, fast_gap_7d: 3, perfect_pct: 10, perfect_pct_global: 10,
      }]),
      live: vi.fn(async () => ({ count: 4, online: [] })),
      dailyStats: vi.fn(async () => [{
        day: '2026-11-04', dau: 6, newUsers: 1, newAccounts: 0, sessions: 9, sessionMinutes: 90,
        medianSessionMinutes: 7, catches: 50, goldIn: 2000, goldOut: 500, actions: 120,
      }]),
      retention: vi.fn(async () => [
        { day: '2026-11-04', size: 2, d1: null, d7: null, d30: null },
        { day: '2026-11-03', size: 4, d1: 0.5, d7: null, d30: null },
      ]),
      sessions: vi.fn(async () => [
        { id: 2, userId: 'u1', nick: null, startedAt: '2026-11-05T01:00:00Z', endedAt: '2026-11-05T01:20:00Z', durationSec: 1200 },
        { id: 1, userId: 'u2', nick: null, startedAt: '2026-11-05T00:00:00Z', endedAt: '2026-11-05T00:40:00Z', durationSec: 2400 },
      ]),
    },
  },
}));

// 시계는 Date만 고정한다 — 조회의 비동기 흐름은 그대로 흐른다. 2026-11-05 12:00 KST
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T03:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); cleanup(); vi.clearAllMocks(); });

// 지표 타일과 위험 신호 줄은 이름이 겹칠 수 있어, 타일은 오목한 칸(pf-notch) 하나로 고른다
const tile = (label: string) => screen.getAllByText(label)
  .map(el => el.parentElement as HTMLElement).find(el => el.classList.contains('pf-notch'))!;

function show(access: 'granted' | 'local') {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={{ access, uid: access === 'granted' ? 'admin' : null }}>
        <OverviewTab />
      </AdminAuthCtx.Provider>
    </QueryProvider>,
  );
}

describe('개요 탭', () => {
  it('지표 줄·일별 집계 차트·최근 이벤트 피드·위험 신호를 채운다', async () => {
    show('granted');
    expect(await screen.findByText('낚시')).toBeInTheDocument(); // 피드의 유형 이름(catch)
    await waitFor(() => expect(within(tile('지금 접속')).getByText('4')).toBeInTheDocument());
    expect(within(tile('오늘 DAU')).getByText('1')).toBeInTheDocument();
    expect(within(tile('WAU')).getByText('2')).toBeInTheDocument();
    expect(within(tile('MAU')).getByText('3')).toBeInTheDocument();
    expect(within(tile('MAU')).getByText(/등록 3명/)).toBeInTheDocument();
    expect(within(tile('오늘 신규')).getByText('1')).toBeInTheDocument();
    expect(within(tile('오늘 신규')).getByText('그중 가입 계정 1')).toBeInTheDocument();
    await waitFor(() => expect(within(tile('오늘 평균 세션')).getByText('30분')).toBeInTheDocument());
    expect(within(tile('D1 리텐션')).getByText('50%')).toBeInTheDocument();
    expect(within(tile('D1 리텐션')).getByText('2026-11-03 가입 4명 기준')).toBeInTheDocument();
    expect(within(tile('D7 리텐션')).getByText('—')).toBeInTheDocument();

    // 어제 집계는 막대로, 오늘(미집계)은 빈 칸으로 그린다
    const dau = screen.getByRole('img', { name: '최근 30일 일별 활성 사람 수' });
    await waitFor(() => expect(dau.querySelector('[title="11-04: 6"]')).not.toBeNull());
    expect(dau.querySelector('[title="11-05: 미집계"]')).not.toBeNull();
    expect(screen.getByRole('img', { name: '최근 30일 일별 평균 세션 길이(분)' })
      .querySelector('[title="11-04: 10분"]')).not.toBeNull();
    expect(screen.getByText(/최근 30일 중 1일이 집계되어 있어요/)).toBeInTheDocument();
    expect(vi.mocked(api.admin.dailyStats)).toHaveBeenCalledWith('2026-10-07', '2026-11-05');

    // 위험 신호 — 제재 1건, 연타 1명. 신호가 있으면 이상탐지 안내가 붙는다
    const risk = screen.getByText('위험 신호').closest('section')!;
    expect(within(risk).getByText('제재 계정').nextElementSibling).toHaveTextContent('1');
    expect(within(risk).getByText('연타 플래그 유저').nextElementSibling).toHaveTextContent('1');
    expect(within(risk).getByText(/이상탐지/)).toBeInTheDocument();
  });

  it('기간 전환은 그 기간의 일별 집계를 다시 읽는다', async () => {
    show('granted');
    await screen.findByText('낚시');
    fireEvent.click(screen.getByRole('button', { name: '7일' }));
    await waitFor(() => expect(vi.mocked(api.admin.dailyStats)).toHaveBeenCalledWith('2026-10-30', '2026-11-05'));
    expect(screen.getByRole('img', { name: '최근 7일 일별 활성 사람 수' })).toBeInTheDocument();
  });

  it('권한이 없으면 조회하지 않고 빈 골격과 안내를 그린다', () => {
    show('local');
    expect(within(tile('오늘 DAU')).getByText('—')).toBeInTheDocument();
    expect(within(tile('지금 접속')).getByText('—')).toBeInTheDocument();
    expect(screen.getAllByText('운영 DB에 연결하면 채워져요.').length).toBeGreaterThan(0);
    expect(vi.mocked(api.admin.users)).not.toHaveBeenCalled();
  });
});
