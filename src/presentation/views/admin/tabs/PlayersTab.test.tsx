// 플레이어 탭 — granted에서 명부·이상탐지 구역이 같은 조회로 채워지고, 상세 모달이 칸 밖에 뜨는지 확인한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import PlayersTab from './PlayersTab';

const UID = 'aaaaaaaa-0000-0000-0000-000000000000';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      users: vi.fn(async () => [{
        user_id: 'aaaaaaaa-0000-0000-0000-000000000000', email: 'friend@example.com', is_anonymous: false,
        signed_up_at: '2026-10-01T00:00:00Z', last_sign_in_at: '2026-10-07T00:00:00Z',
        gold: 1200, fame: 30, boat: 1, rod: 3, location_kind: 'region', location_id: 'ocean',
        visited: ['village'], restricted: true, save_version: 8, last_action_at: '2026-10-07T00:00:00Z',
      }]),
      spamFlags: vi.fn(async () => [{
        user_id: 'aaaaaaaa-0000-0000-0000-000000000000', catches_7d: 40, fast_gap_7d: 12,
        perfect_pct: 90, perfect_pct_global: 30,
      }]),
      imports: vi.fn(async () => [{
        id: 1, user_id: 'aaaaaaaa-0000-0000-0000-000000000000', gold: 500, fame: 5, created_at: '2026-10-06T00:00:00Z',
      }]),
      dexMismatch: vi.fn(async () => [{
        user_id: 'aaaaaaaa-0000-0000-0000-000000000000', fish_id: 'f1', form: 'base',
        dex_count: 3, event_count: 1, missing_events: 2,
      }]),
      userEvents: vi.fn(async () => [{
        id: 7, user_id: 'aaaaaaaa-0000-0000-0000-000000000000', type: 'sell',
        payload: { count: 2, gold: 300 }, created_at: '2026-10-07T00:00:00Z',
      }]),
    },
  },
}));

afterEach(cleanup);

function show(section: 'roster' | 'abuse' | 'letters') {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={{ access: 'granted', uid: UID }}>
        <PlayersTab section={section} onSection={() => {}} />
      </AdminAuthCtx.Provider>
    </QueryProvider>,
  );
}

describe('플레이어 탭', () => {
  it('명부 구역 — 유저 행을 그리고, 누르면 상세 모달이 오목한 칸 밖에 뜬다', async () => {
    show('roster');
    expect(await screen.findByText('friend@example.com')).toBeInTheDocument();
    expect(screen.getByText('1/1명')).toBeInTheDocument();

    fireEvent.click(screen.getByText('friend@example.com'));
    const dialog = await screen.findByRole('dialog', { name: '유저 상세 — friend@example.com' });
    // 오목한 칸(pf-notch)은 clip-path로 안쪽을 잘라서, 그 안에 모달을 두면 화면 전체를 덮지 못한다
    expect(dialog.closest('.pf-notch')).toBeNull();
    expect(await within(dialog).findByText('도감 ↔ 이벤트 대조')).toBeInTheDocument();
    expect(within(dialog).getByText('판매')).toBeInTheDocument();
  });

  it('이상탐지 구역 — 신호 건수 지표와 제재 계정이 같은 조회로 채워진다', async () => {
    show('abuse');
    // 지표 타일은 오목한 칸(pf-notch) 하나다 — 같은 글자가 칸 제목에도 있어서 타일만 고른다
    const tile = (label: string) => screen.getAllByText(label)
      .map(el => el.parentElement as HTMLElement).find(el => el.classList.contains('pf-notch'))!;
    expect(await within(tile('연타 유저')).findByText('1')).toBeInTheDocument();
    expect(within(tile('PERFECT 이상치')).getByText('1')).toBeInTheDocument();
    expect(within(tile('이사 코드 반입')).getByText('1')).toBeInTheDocument();
    expect(within(tile('도감 차액')).getByText('1')).toBeInTheDocument();
    expect(within(tile('제재 계정')).getByText('1')).toBeInTheDocument();
    // 제재 계정 칸은 명부 라벨과 지표 줄(골드·명성·마지막 행동)을 함께 보인다
    expect(screen.getAllByText('friend@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText(/골드 1,200 · 명성 30 · 마지막 행동/)).toBeInTheDocument();
  });
});
