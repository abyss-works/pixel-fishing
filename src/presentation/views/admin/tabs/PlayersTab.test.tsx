// 플레이어 탭 — granted에서 명부·이상탐지 구역이 같은 조회로 채워지고, 상세 모달이 칸 밖에 뜨는지 확인한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import { api } from '../../../../platform/api';
import type { AdminRole } from '../../../../features/admin/model/types';
import PlayersTab from './PlayersTab';

const UID = 'aaaaaaaa-0000-0000-0000-000000000000';
const mocks = vi.hoisted(() => ({
  restrict: vi.fn(async (_userId: string, restricted: boolean) => ({ restricted })),
  revokeSessions: vi.fn(async () => ({ revoked: 2 })),
  compose: vi.fn(),
}));

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      users: vi.fn(async () => [{
        user_id: 'aaaaaaaa-0000-0000-0000-000000000000', email: 'friend@example.com', nickname: '바다친구', is_anonymous: false,
        signed_up_at: '2026-10-01T00:00:00Z', last_sign_in_at: '2026-10-07T00:00:00Z',
        gold: 1200, fame: 30, boat: 1, rod: 3, location_kind: 'region', location_id: 'ocean',
        visited: ['village'], restricted: true, save_version: 8, last_action_at: '2026-10-07T00:00:00Z',
        last_session_at: '2026-10-07T00:30:00Z', total_session_sec: 5000,
      }]),
      spamFlags: vi.fn(async () => [{
        user_id: 'aaaaaaaa-0000-0000-0000-000000000000', catches_7d: 40, fast_gap_7d: 12,
        perfect_pct: 90, perfect_pct_global: 30,
      }]),
      userEvents: vi.fn(async () => [{
        id: 7, user_id: 'aaaaaaaa-0000-0000-0000-000000000000', type: 'sell',
        payload: { count: 2, gold: 300 }, created_at: '2026-10-07T00:00:00Z',
      }]),
      userState: vi.fn(async () => ({
        hasSave: true,
        dex: { normal: 12, normalTotal: 120, variant: 3, variantTotal: 120, named: 1, namedTotal: 8 },
        bounty: { namedClears: 2, namedDistinctClears: 1, namedTotal: 8 },
        artifacts: { owned: [{ id: 'wreck-compass', name: '침선의 나침반', grade: 'rare', level: 2 }], total: 8 },
        hats: {
          owned: 1,
          total: 46,
          items: [{ id: 'cap-red', name: '빨간 모자', source: 'gold' as const }],
          equipped: { id: 'cap-red', name: '빨간 모자' },
        },
        achievements: { claimed: 5, claimable: 1, total: 71, counters: { 'sell.gold': 1200 } },
        cooking: {
          energy: { common: 25, rare: 10, epic: 0, legendary: 0 },
          cooked: [{ id: 'cook-lunch-bite', name: '가루디야', kind: 'lunch', count: 2 }],
          inProgress: null,
          slots: { lunch: null, bait: null },
        },
        instances: {
          bag: 8,
          exhibit: 3,
          recentBag: [
            { uid: 'fish-1', fishId: 'carp', name: '잉어', form: 'normal', grade: 'common', size: 22.5, caughtAt: '2026-10-07T00:10:00Z', spot: '마을 연못', locked: false },
          ],
        },
        progression: {
          visited: ['village'],
          coupons: ['OPEN100'],
          bountyProgress: [{ questId: 'pacific-easy-common', zone: '태평양', progress: 12, target: 250, startedAt: '2026-10-07T00:00:00Z' }],
          bountyTickets: [],
          activeSessions: 2,
        },
      })),
      sessions: vi.fn(async () => [
        { id: 2, userId: 'aaaaaaaa-0000-0000-0000-000000000000', nick: null,
          startedAt: '2026-10-07T00:00:00Z', endedAt: '2026-10-07T00:30:00Z', durationSec: 1800 },
        { id: 1, userId: 'aaaaaaaa-0000-0000-0000-000000000000', nick: null,
          startedAt: '2026-10-06T00:00:00Z', endedAt: '2026-10-06T00:04:10Z', durationSec: 250 },
      ]),
      restrict: mocks.restrict,
      revokeSessions: mocks.revokeSessions,
      live: vi.fn(async () => ({ count: 0, online: [] })),
      searchAdminUsers: vi.fn(async () => []),
      readIntegrityStages: vi.fn(async () => [
        { stage: 0, count: 10, accounts: [] },
        { stage: 1, count: 1, accounts: [{ userId: UID, pressure: 1.5, stage: 1, modifier: 0.75, updatedAt: '2026-10-07T00:00:00Z' }] },
        { stage: 2, count: 0, accounts: [] },
      ]),
      readIntegrityEvents: vi.fn(async () => []),
      readIntegrityMetrics: vi.fn(async () => ({
        days: 7,
        clean: {
          total: 100,
          counts: { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 },
          shares: { common: 0.6, uncommon: 0.25, rare: 0.1, epic: 0.04, legendary: 0.01 },
          expectedShares: { common: 0.6, uncommon: 0.25, rare: 0.1, epic: 0.04, legendary: 0.01 },
        },
        pressured: {
          total: 20,
          counts: { common: 14, uncommon: 4, rare: 2, epic: 0, legendary: 0 },
          shares: { common: 0.7, uncommon: 0.2, rare: 0.1, epic: 0, legendary: 0 },
          expectedShares: { common: 0.7, uncommon: 0.2, rare: 0.1, epic: 0, legendary: 0 },
        },
      })),
      releaseIntegrityStage: vi.fn(async () => ({ released: true as const })),
    },
  },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function show(section: 'directory' | 'sanctions', role: AdminRole = 'admin') {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={{ access: 'granted', uid: UID, role, canViewEmail: role === 'admin', showStaffBadge: false, setStaffBadge: async () => {} }}>
        <PlayersTab section={section} onSection={() => {}} onCompose={mocks.compose} />
      </AdminAuthCtx.Provider>
    </QueryProvider>,
  );
}

describe('플레이어 탭', () => {
  it('검색·명부 구역 — 유저 행·빠른 액션(우편·제재·상세)을 그리고, 누르면 상세 모달이 오목한 칸 밖에 뜬다', async () => {
    show('directory');
    expect(await screen.findByText('바다친구(friend@example.com)')).toBeInTheDocument();
    expect(screen.getByText('1/1명')).toBeInTheDocument();
    const row = screen.getByText('바다친구(friend@example.com)').closest('tr')!;
    expect(within(row).getByText('태평양')).toBeInTheDocument();
    expect(within(row).getByText('10-07 09:30')).toBeInTheDocument();
    expect(within(row).getByText('1시간 23분')).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: '우편' }));
    expect(mocks.compose).toHaveBeenCalledWith(UID);

    fireEvent.click(screen.getByText('바다친구(friend@example.com)'));
    const dialog = await screen.findByRole('dialog', { name: '유저 상세: 바다친구(friend@example.com)' });
    expect(dialog.closest('.pf-notch')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '상세' }));
    expect(await within(dialog).findByText('판매')).toBeInTheDocument();
    expect(await within(dialog).findByText(/일반 12\/120, 돌연변이 3\/120, 네임드 1\/8/)).toBeInTheDocument();
    expect(within(dialog).getByText(/침선의 나침반/)).toBeInTheDocument();
    expect(within(dialog).getByText(/빨간 모자/)).toBeInTheDocument();
    expect(within(dialog).getByText(/착용 중/)).toBeInTheDocument();
    expect(within(dialog).getByText('가방 8마리, 전시 3마리')).toBeInTheDocument();
    expect(within(dialog).getByText(/잉어 22.5cm/)).toBeInTheDocument();
    expect(within(dialog).getByText('2건')).toBeInTheDocument();
    expect(within(dialog).getByText('OPEN100')).toBeInTheDocument();
    const sessions = within(dialog).getByText('세션 기록').closest('section')!;
    expect(within(sessions).getByText('1시간 23분')).toBeInTheDocument();
    expect(await within(sessions).findByText('30분')).toBeInTheDocument();
    expect(within(sessions).getByText('4분')).toBeInTheDocument();
    expect(within(sessions).getByText('10-07 09:00')).toBeInTheDocument();
    expect(within(dialog).queryByText('도감 ↔ 이벤트 대조')).toBeNull();
  });

  it('제재·무결성 구역 — 신호 건수·무결성 감등 현황·오탐 해제와 제재 계정이 채워진다', async () => {
    show('sanctions');
    const tile = (label: string) => screen.getAllByText(label)
      .map(el => el.parentElement as HTMLElement).find(el => el.classList.contains('pf-notch'))!;
    expect(await within(tile('연타 유저')).findByText('1')).toBeInTheDocument();
    expect(within(tile('PERFECT 이상치')).getByText('1')).toBeInTheDocument();
    expect(within(tile('제재 계정')).getByText('1')).toBeInTheDocument();
    expect(within(tile('무결성 감등')).getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText('바다친구(friend@example.com)').length).toBeGreaterThan(0);
    expect(screen.getByText(/골드 1,200 \/ 명성 30 \/ 마지막 행동/)).toBeInTheDocument();
    expect(screen.getByText('단계 1 (주의): 1명')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '오탐 해제' }));
    await waitFor(() => expect(vi.mocked(api.admin.releaseIntegrityStage)).toHaveBeenCalledWith(UID));
  });

  it('사용자 상세의 관리 조치 — 우편 보내기, 확인을 거친 제재 해제, 세션 강제 종료', async () => {
    show('directory');
    fireEvent.click(await screen.findByText('바다친구(friend@example.com)'));
    const dialog = await screen.findByRole('dialog', { name: '유저 상세: 바다친구(friend@example.com)' });

    fireEvent.click(within(dialog).getByRole('button', { name: '우편 보내기' }));
    expect(mocks.compose).toHaveBeenCalledWith(UID);

    fireEvent.click(within(dialog).getByRole('button', { name: '제재 해제' }));
    await screen.findByRole('button', { name: '해제하기' });
    fireEvent.click(screen.getAllByRole('button', { name: '닫기' }).at(-1)!);
    expect(screen.queryByRole('button', { name: '해제하기' })).toBeNull();
    expect(mocks.restrict).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '제재 해제' }));
    fireEvent.click(await screen.findByRole('button', { name: '해제하기' }));
    await waitFor(() => expect(mocks.restrict).toHaveBeenCalledWith(UID, false));

    expect(within(dialog).queryByRole('button', { name: '재설정 링크 만들기' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: '세션 강제 종료' }));
    fireEvent.click(await screen.findByRole('button', { name: '종료하기' }));
    await waitFor(() => expect(mocks.revokeSessions).toHaveBeenCalledWith(UID));
    expect(await within(dialog).findByText('활성 세션 2건을 종료했어요.')).toBeInTheDocument();
  });

  it('maintainer 역할도 검색·명부·상세 모달을 동일하게 사용하고 이메일·가입일 메타만 미노출한다', async () => {
    vi.mocked(api.admin.users).mockResolvedValueOnce([{
      user_id: UID, email: null, nickname: '원양어부', is_anonymous: false,
      signed_up_at: null, last_sign_in_at: null, gold: 500, fame: 10, boat: 1, rod: 2,
      location_kind: null, location_id: null, visited: null, restricted: true, save_version: 10,
      last_action_at: null, last_session_at: null, total_session_sec: 0,
    }]);

    show('directory', 'maintainer');
    expect(screen.getByRole('button', { name: '검색·명부', pressed: true })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('닉네임·UUID 검색')).toBeInTheDocument();
    expect(await screen.findByText('원양어부')).toBeInTheDocument();
    expect(screen.getByText('aaaaaaaa')).toBeInTheDocument();
    expect(screen.queryByText(/원양어부\(/)).toBeNull();

    fireEvent.click(screen.getByText('원양어부'));
    const dialog = await screen.findByRole('dialog', { name: '유저 상세: 원양어부' });
    expect(within(dialog).queryByText('가입')).toBeNull();
    expect(within(dialog).queryByText('마지막 로그인')).toBeNull();
    expect(within(dialog).getByText(UID)).toBeInTheDocument();
  });
});
