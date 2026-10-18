// 라이브 탭 — 접속 추정 구간(10분·1시간·24시간)과 온라인 명부의 "n분 전" 표시가 같은 기준 시각을 쓰는지 확인한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import LiveTab from './LiveTab';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      users: vi.fn(async () => [
        { user_id: 'u1', email: 'near@example.com', boat: 1, location_kind: 'region', location_id: 'ocean',
          last_action_at: '2026-10-18T11:55:00Z' },
        { user_id: 'u2', email: 'far@example.com', boat: 0, location_kind: 'region', location_id: 'village',
          last_action_at: '2026-10-18T09:00:00Z' },
      ]),
    },
  },
}));

// 시계는 Date만 고정한다 — 조회의 비동기 흐름은 그대로 흐른다
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('라이브 탭', () => {
  it('10분 안에 행동한 유저만 온라인 명부에 올리고 몇 분 전인지 적는다', async () => {
    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'admin' }}>
          <LiveTab />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );
    expect(await screen.findByText('5분 전')).toBeInTheDocument();
    expect(screen.getByText('near@example.com')).toBeInTheDocument();
    expect(screen.queryByText('far@example.com')).not.toBeInTheDocument();

    // 지표 타일은 오목한 칸(pf-notch) 하나다 — 같은 글자가 다른 곳에도 있을 수 있어 타일만 고른다
    const tile = (label: string) => screen.getAllByText(label)
      .map(el => el.parentElement as HTMLElement).find(el => el.classList.contains('pf-notch'))!;
    expect(within(tile('접속 중')).getByText('1')).toBeInTheDocument();
    expect(within(tile('최근 1시간')).getByText('1')).toBeInTheDocument();
    expect(within(tile('최근 24시간')).getByText('2')).toBeInTheDocument();
    expect(within(tile('등록 유저')).getByText('2')).toBeInTheDocument();
  });
});
