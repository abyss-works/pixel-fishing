// 우편 구역 — 보낸 우편 목록, 미리보기 뒤에만 열리는 보내기, 확인 뒤 보내기를 검사한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryProvider } from '../../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import MailTab from './MailTab';

const USER = '30e63c95-12de-4ba6-b397-e8b69ce0311c';
const mocks = vi.hoisted(() => ({
  mail: vi.fn(),
}));
vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      sentMails: vi.fn(async () => [
        { id: 1, userId: '30e63c95-12de-4ba6-b397-e8b69ce0311c', title: '지난 우편', body: 'b', gold: 500,
          createdAt: '2026-10-22T00:00:00Z', readAt: '2026-10-22T01:00:00Z', claimedAt: null },
      ]),
      users: vi.fn(async () => [{ user_id: '30e63c95-12de-4ba6-b397-e8b69ce0311c', email: 'friend@example.com' }]),
      mail: mocks.mail,
    },
  },
}));

function show() {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'u' }}>
        <MailTab />
      </AdminAuthCtx.Provider>
    </QueryProvider>,
  );
}

describe('MailTab', () => {
  afterEach(() => { cleanup(); mocks.mail.mockReset(); });

  it('보낸 우편을 받는 사람 email과 상태로 그린다', async () => {
    show();
    expect(await screen.findByText('지난 우편')).toBeTruthy();
    expect(screen.getByText('friend@example.com')).toBeTruthy();
    expect(screen.getByText('읽음')).toBeTruthy();
  });

  it('보내기는 미리보기 뒤에만 열리고, 확인하면 같은 요청으로 보낸다', async () => {
    mocks.mail.mockImplementation(async (op: string) => (op === 'preview'
      ? { problems: [], preview: { count: 1, totalGold: 6309483, missing: [] } }
      : { problems: [], preview: { count: 1, totalGold: 6309483, missing: [] }, sent: 1 }));
    show();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '강화비 차액' } });
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '돌려드려요.' } });
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: `${USER} 6309483` } });
    const send = screen.getByRole('button', { name: '보내기' });
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    expect(await screen.findByText(/대상 1명, 골드 합계 6,309,483G/)).toBeTruthy();
    const request = { title: '강화비 차액', body: '돌려드려요.', target: { kind: 'users', recipients: [{ userId: USER, gold: 6309483 }] } };
    expect(mocks.mail).toHaveBeenLastCalledWith('preview', request);

    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    const dialogs = await screen.findAllByRole('button', { name: '보내기' });
    fireEvent.click(dialogs[dialogs.length - 1]);
    await waitFor(() => expect(mocks.mail).toHaveBeenLastCalledWith('send', request));
  });

  it('받는 사람 형식이 틀리면 줄 번호를 알려 주고 미리보기를 막는다', async () => {
    show();
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: 'nope 1' } });
    expect(screen.getByText('형식이 틀린 줄: 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();
  });
});
