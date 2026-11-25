import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import UserDetail from './UserDetail';

const UID = 'aaaaaaaa-0000-0000-0000-000000000000';

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      spamFlags: vi.fn(async () => []),
      userEvents: vi.fn(async () => []),
      sessions: vi.fn(async () => []),
      userState: vi.fn(async () => ({
        hasSave: true,
        dex: { normal: 0, normalTotal: 120, variant: 0, variantTotal: 120, named: 0, namedTotal: 8 },
        bounty: { namedClears: 0, namedDistinctClears: 0, namedTotal: 8 },
        artifacts: { owned: [], total: 8 },
        hats: { owned: 0, total: 55, items: [], equipped: null },
        achievements: { claimed: 0, claimable: 0, total: 80, counters: {} },
        cooking: {
          energy: { common: 0, rare: 0, epic: 0, legendary: 0 },
          cooked: [{ id: 'cook-lunch-bite', name: '가루디야', kind: 'lunch', count: 1 }],
          inProgress: { id: 'cook-1', recipe: 'cook-lunch-rare', name: '민 몰리', count: 2, startedAt: '2026-11-25T00:00:00Z' },
          queue: [{ id: 'cook-2', recipe: 'cook-lunch-mutation', name: '생선 비리야니', count: 3 }],
          slots: { lunch: null, bait: null },
        },
        instances: { bag: 0, exhibit: 0, recentBag: [] },
        progression: { visited: ['village'], coupons: [], bountyProgress: [], bountyTickets: [], activeSessions: 0 },
      })),
    },
  },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('UserDetail 조리 상태 표시', () => {
  it('inProgress id와 cookingQueue 항목을 표시한다', async () => {
    render(
      <QueryProvider>
        <UserDetail
          user={{
            user_id: UID,
            email: 'u@example.com',
            nickname: '유저',
            is_anonymous: false,
            signed_up_at: null,
            last_sign_in_at: null,
            gold: 0,
            fame: 0,
            boat: 5,
            rod: 1,
            location_kind: 'base',
            location_id: 'home',
            visited: ['village'],
            restricted: false,
            save_version: 10,
            last_action_at: null,
            last_session_at: null,
            total_session_sec: 0,
          }}
          onClose={vi.fn()}
        />
      </QueryProvider>,
    );

    expect(await screen.findByText(/조리 중: 민 몰리 ×2 \(cook-1\)/)).toBeInTheDocument();
    expect(screen.getByText('조리 대기열 (1)')).toBeInTheDocument();
    expect(screen.getByText('생선 비리야니 ×3 (cook-2)')).toBeInTheDocument();
  });
});
