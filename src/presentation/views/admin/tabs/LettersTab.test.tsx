// 편지 탭 — granted에서 목록을 그리고, uid를 명부의 계정 식별 표기로 보이며, 답장과 처리 표시를 보낸다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import LettersTab from './LettersTab';

const UID = 'aaaaaaaa-0000-0000-0000-000000000000';
const mocks = vi.hoisted(() => ({
  letterHandled: vi.fn(async (_id: number, handled: boolean) => ({ handled })),
  compose: vi.fn(),
}));

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      letters: vi.fn(async () => [
        { id: 1, user_id: 'aaaaaaaa-0000-0000-0000-000000000000', text: '바다가 좋아요', created_at: '2026-10-07T00:00:00Z', handled_at: null },
        { id: 2, user_id: 'aaaaaaaa-0000-0000-0000-000000000000', text: '고마워요', created_at: '2026-10-06T00:00:00Z', handled_at: '2026-10-06T03:00:00Z' },
      ]),
      users: vi.fn(async () => [
        { user_id: 'aaaaaaaa-0000-0000-0000-000000000000', email: 'friend@example.com', nickname: '바다친구', is_anonymous: false },
      ]),
      letterHandled: mocks.letterHandled,
    },
  },
}));

function show() {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'u' }}>
        <LettersTab onCompose={mocks.compose} />
      </AdminAuthCtx.Provider>
    </QueryProvider>,
  );
}

describe('LettersTab', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('granted — 편지 본문과 보낸 사람의 닉네임(이메일), 처리 전 편지 수를 그린다', async () => {
    show();
    expect(await screen.findByText('바다가 좋아요')).toBeTruthy();
    expect((await screen.findAllByText('바다친구(friend@example.com)')).length).toBe(2);
    expect(screen.getByText('편지 (2, 처리 전 1)')).toBeTruthy();
  });

  it('우편으로 답장은 보낸 사람을 받는 사람으로 넘기고, 처리 표시는 편지 id와 바뀐 상태를 보낸다', async () => {
    show();
    const row = (await screen.findByText('바다가 좋아요')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: '우편으로 답장' }));
    expect(mocks.compose).toHaveBeenCalledWith(UID);
    fireEvent.click(within(row).getByRole('button', { name: '처리 완료' }));
    await waitFor(() => expect(mocks.letterHandled).toHaveBeenCalledWith(1, true));
    const done = screen.getByText('고마워요').closest('tr')!;
    fireEvent.click(within(done).getByRole('button', { name: '처리 취소' }));
    await waitFor(() => expect(mocks.letterHandled).toHaveBeenLastCalledWith(2, false));
  });
});
