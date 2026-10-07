// 편지 탭 — granted에서 목록을 그리고, uid를 명부 email로 라벨링한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AdminAuthCtx } from '../accessContext';
import LettersTab from './LettersTab';

vi.mock('../../api', () => ({
  api: {
    admin: {
      letters: vi.fn(async () => [
        { id: 1, user_id: 'aaaaaaaa-0000-0000-0000-000000000000', text: '바다가 좋아요', created_at: '2026-10-07T00:00:00Z' },
      ]),
      users: vi.fn(async () => [
        { user_id: 'aaaaaaaa-0000-0000-0000-000000000000', email: 'friend@example.com' },
      ]),
    },
  },
}));

describe('LettersTab', () => {
  afterEach(cleanup);
  it('granted — 편지 본문과 보낸 사람 email을 그린다', async () => {
    render(
      <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'u' }}>
        <LettersTab />
      </AdminAuthCtx.Provider>,
    );
    expect(await screen.findByText('바다가 좋아요')).toBeTruthy();
    expect(await screen.findByText('friend@example.com')).toBeTruthy();
  });
});
