// 채팅 신고 구역 — granted에서 신고와 앞뒤 대화를 그리고, 신고 행에서 대상 유저 상세 열기와 원클릭 제재/해제를 수행한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import { api } from '../../../../platform/api';
import ChatReportsSection from './ChatReportsSection';

const REPORTER = 'aaaaaaaa-0000-0000-0000-000000000000';
const RUDE = 'bbbbbbbb-0000-0000-0000-000000000000';

const mocks = vi.hoisted(() => ({
  restrict: vi.fn(async (_uid: string, restricted: boolean) => ({ restricted })),
  compose: vi.fn(),
}));

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      chatReports: vi.fn(async () => [{
        id: 1, user_id: REPORTER, message_id: 11, target_id: RUDE, created_at: '2026-11-05T00:00:00Z',
        lines: [
          { id: 10, uid: REPORTER, nick: '가람', text: '안녕하세요', at: '2026-11-05T00:00:00.000Z' },
          { id: 11, uid: RUDE, nick: '무례', text: '나쁜 말', at: '2026-11-05T00:00:01.000Z' },
        ],
      }]),
      users: vi.fn(async () => [
        { user_id: REPORTER, email: 'reporter@example.com', nickname: '신고자', is_anonymous: false, restricted: false, total_session_sec: 0 },
      ]),
      userEvents: vi.fn(async () => []),
      spamFlags: vi.fn(async () => []),
      userState: vi.fn(async () => ({
        hasSave: false,
        dex: { normal: 0, normalTotal: 120, variant: 0, variantTotal: 120, named: 0, namedTotal: 8 },
        bounty: { namedClears: 0, namedDistinctClears: 0, namedTotal: 8 },
        artifacts: { owned: [], total: 8 },
        hats: { owned: 0, total: 46, items: [], equipped: null },
        achievements: { claimed: 0, claimable: 0, total: 71, counters: {} },
        cooking: { energy: { common: 0, rare: 0, epic: 0, legendary: 0 }, cooked: [], inProgress: null, slots: { lunch: null, bait: null } },
        instances: { bag: 0, exhibit: 0, recentBag: [] },
        progression: { visited: [], coupons: [], bountyProgress: [], bountyTickets: [], activeSessions: 0 },
      })),
      sessions: vi.fn(async () => []),
      restrict: mocks.restrict,
    },
  },
}));

describe('ChatReportsSection', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('granted — 신고한 메시지와 앞뒤 대화, 신고한 사람과 보낸 사람의 계정 식별 표기를 그린다', async () => {
    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'u', role: 'admin', showStaffBadge: false, setStaffBadge: async () => {} }}>
          <ChatReportsSection onCompose={mocks.compose} />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );
    expect(await screen.findByText('나쁜 말')).toBeTruthy();
    expect(screen.getByText('안녕하세요')).toBeTruthy();
    expect(screen.getByText('신고자(reporter@example.com)')).toBeTruthy();
    // 명부에 없는 보낸 사람도 같은 표기로 적는다
    expect(screen.getByText('이름 없음(—)')).toBeTruthy();
    expect(screen.getByText('bbbbbbbb')).toBeTruthy();
    // 명부에 없으면 제재 버튼은 비활성화되고 상세 보기는 열 수 있다
    expect(screen.getByRole('button', { name: '제재' })).toBeDisabled();
  });

  it('신고 행에서 대상 유저 상세를 바로 열고 원클릭 제재/해제를 실행한다', async () => {
    let isRestricted = false;
    vi.mocked(api.admin.users).mockImplementation(async () => [
      { user_id: REPORTER, email: 'reporter@example.com', nickname: '신고자', is_anonymous: false, restricted: false, total_session_sec: 0 } as never,
      { user_id: RUDE, email: 'rude@example.com', nickname: '무례유저', is_anonymous: false, restricted: isRestricted, total_session_sec: 0, boat: 1, rod: 2, gold: 10, fame: 5 } as never,
    ]);
    mocks.restrict.mockImplementation(async (_uid, next) => {
      isRestricted = next;
      return { restricted: next };
    });

    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'u', role: 'admin', showStaffBadge: false, setStaffBadge: async () => {} }}>
          <ChatReportsSection onCompose={mocks.compose} />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );

    const row = (await screen.findByText('무례유저(rude@example.com)')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: '제재' }));
    await waitFor(() => expect(mocks.restrict).toHaveBeenCalledWith(RUDE, true));
    expect(await within(row).findByRole('button', { name: '제재 해제' })).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: '상세 보기' }));
    expect(await screen.findByRole('dialog', { name: '유저 상세: 무례유저(rude@example.com)' })).toBeInTheDocument();
  });

  it('maintainer — 신고자 신원을 숨기고 opHandle로 피신고자를 표시하며 상세 보기·제재 버튼을 숨긴다', async () => {
    vi.mocked(api.admin.chatReports).mockResolvedValueOnce([{
      id: 2, user_id: '', message_id: 21, target_id: 'op-target01', opHandle: 'op-target01', created_at: '2026-11-05T00:00:00Z',
      lines: [
        { id: 21, uid: 'op-target01', nick: '도배꾼', text: '도배글', at: '2026-11-05T00:00:01.000Z' },
      ],
    }]);
    vi.mocked(api.admin.users).mockResolvedValueOnce([
      { user_id: 'op-target01', opHandle: 'op-target01', email: null, nickname: '도배꾼', is_anonymous: false, restricted: false, total_session_sec: 0 } as never,
    ]);

    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'm', role: 'maintainer', showStaffBadge: false, setStaffBadge: async () => {} }}>
          <ChatReportsSection />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );

    expect(await screen.findByText('도배글')).toBeInTheDocument();
    expect(screen.getByText('비공개')).toBeInTheDocument();
    expect(screen.getByText('도배꾼')).toBeInTheDocument();
    expect(screen.getByText('op-target01')).toBeInTheDocument();
    expect(screen.queryByText(/—/)).toBeNull();
    expect(screen.queryByRole('button', { name: '상세 보기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '제재' })).toBeNull();
    expect(screen.queryByRole('button', { name: '제재 해제' })).toBeNull();
    expect(vi.mocked(api.admin.userState)).not.toHaveBeenCalled();
    expect(vi.mocked(api.admin.userEvents)).not.toHaveBeenCalled();
    expect(vi.mocked(api.admin.sessions)).not.toHaveBeenCalled();
  });
});
