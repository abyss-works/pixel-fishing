// 편지 탭 — granted에서 목록을 그리고, uid를 명부의 계정 식별 표기로 보이며, 답장과 처리 표시를 보낸다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import LettersTab from './LettersTab';

const UID = 'aaaaaaaa-0000-0000-0000-000000000000';
const UID_NO_REPLY = 'bbbbbbbb-0000-0000-0000-000000000000';
const mocks = vi.hoisted(() => ({
  letters: vi.fn(async () => [
    { id: 1, user_id: 'aaaaaaaa-0000-0000-0000-000000000000', text: '바다가 좋아요', created_at: '2026-10-07T00:00:00Z', handled_at: null },
    { id: 2, user_id: 'aaaaaaaa-0000-0000-0000-000000000000', text: '고마워요', created_at: '2026-10-06T00:00:00Z', handled_at: '2026-10-06T03:00:00Z' },
  ]),
  sentMails: vi.fn(async () => [
    {
      id: 11,
      userId: 'aaaaaaaa-0000-0000-0000-000000000000',
      title: '첫 답장',
      body: '응원 감사합니다.',
      gold: 0,
      items: [],
      createdAt: '2026-10-06T02:00:00Z',
      readAt: null,
      claimedAt: null,
    },
    {
      id: 12,
      userId: 'aaaaaaaa-0000-0000-0000-000000000000',
      title: '두 번째 답장',
      body: '선물을 보냈어요.\n확인해 주세요.',
      gold: 1000,
      items: [{ id: 'luck-small', qty: 2 }],
      hats: ['santa-hat'],
      createdAt: '2026-10-07T01:00:00Z',
      readAt: '2026-10-07T02:00:00Z',
      claimedAt: '2026-10-07T03:00:00Z',
    },
  ]),
  letterHandled: vi.fn(async (_id: number, handled: boolean) => ({ handled })),
  compose: vi.fn(),
}));

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      letters: mocks.letters,
      sentMails: mocks.sentMails,
      users: vi.fn(async () => [
        { user_id: 'aaaaaaaa-0000-0000-0000-000000000000', email: 'friend@example.com', nickname: '바다친구', is_anonymous: false },
        { user_id: 'bbbbbbbb-0000-0000-0000-000000000000', email: null, nickname: '새유저', is_anonymous: true },
      ]),
      letterHandled: mocks.letterHandled,
    },
  },
}));

function show() {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'u', role: 'admin', canViewEmail: true, showStaffBadge: false, setStaffBadge: async () => {} }}>
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

  it('보낸 우편 답장이 있는 편지 행에만 답장 N건 버튼을 보이고, 누르면 최근 답장 우편 목록과 상세를 연다', async () => {
    mocks.letters.mockResolvedValueOnce([
      { id: 1, user_id: UID, text: '바다가 좋아요', created_at: '2026-10-07T00:00:00Z', handled_at: null },
      { id: 3, user_id: UID_NO_REPLY, text: '처음 편지해요', created_at: '2026-10-08T00:00:00Z', handled_at: null },
    ]);
    show();

    const rowWithReply = (await screen.findByText('바다가 좋아요')).closest('tr')!;
    const rowWithoutReply = screen.getByText('처음 편지해요').closest('tr')!;

    expect(within(rowWithoutReply).queryByRole('button', { name: /^답장 \d+건$/ })).toBeNull();

    const repliesBtn = await within(rowWithReply).findByRole('button', { name: '답장 2건' });
    fireEvent.click(repliesBtn);

    const dialog = await screen.findByRole('dialog', { name: '보낸 답장 우편 (2건): 바다친구(friend@example.com)' });
    const titles = within(dialog).getAllByText(/답장$/);
    expect(titles.map(el => el.textContent)).toEqual(['두 번째 답장', '첫 답장']);
    expect(within(dialog).getByText((_, node) => node?.textContent === '선물을 보냈어요.\n확인해 주세요.' && node.className.includes('whitespace-pre-wrap'))).toBeTruthy();
    expect(within(dialog).getByText('1,000G')).toBeTruthy();
    expect(within(dialog).getByText('작은 바다 영약')).toBeTruthy();
    expect(within(dialog).getByText('×2')).toBeTruthy();
    expect(within(dialog).getByText('모자 산타모자')).toBeTruthy();
    expect(within(dialog).queryByText('작은 바다 영약 2개')).toBeNull();
    expect(within(dialog).getByText('10-07 10:00')).toBeTruthy();
    expect(within(dialog).getByText('10-07 11:00')).toBeTruthy();
    expect(within(dialog).getByText('10-07 12:00')).toBeTruthy();
    expect(within(dialog).getAllByText('안 읽음')).toHaveLength(2);
    expect(within(dialog).getByText('미수령')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: '새 우편 쓰기' }));
    expect(mocks.compose).toHaveBeenCalledWith(UID);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
