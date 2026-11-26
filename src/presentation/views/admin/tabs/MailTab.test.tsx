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
        { id: 1, userId: '30e63c95-12de-4ba6-b397-e8b69ce0311c', title: '지난 우편', body: 'b', gold: 500, items: [],
          createdAt: '2026-10-22T00:00:00Z', readAt: '2026-10-22T01:00:00Z', claimedAt: null },
        { id: 2, userId: '30e63c95-12de-4ba6-b397-e8b69ce0311c', title: '비약 지급', body: 'b2', gold: 0,
          items: [{ id: 'luck-small', qty: 2 }],
          createdAt: '2026-10-23T00:00:00Z', readAt: null, claimedAt: null },
      ]),
      users: vi.fn(async () => [
        { user_id: '30e63c95-12de-4ba6-b397-e8b69ce0311c', email: 'friend@example.com', nickname: '바다친구', is_anonymous: false },
        { user_id: 'e747e6c9-f0c2-4192-a462-9cd26e8a812a', email: null, nickname: '민물러', is_anonymous: true },
      ]),
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

  it('보낸 우편을 받는 사람의 닉네임(이메일)과 첨부 아이템, 상태로 그린다', async () => {
    show();
    expect(await screen.findByText('지난 우편')).toBeTruthy();
    expect(screen.getAllByText('바다친구(friend@example.com)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('비약 지급')).toBeTruthy();
    expect(screen.getByText('작은 바다 영약')).toBeTruthy();
    expect(screen.getByText('×2')).toBeTruthy();
    expect(screen.getByText('읽음')).toBeTruthy();
  });

  it('보내기는 미리보기 뒤에만 열리고, 확인하면 같은 멱등 키 요청으로 보낸다', async () => {
    mocks.mail.mockImplementation(async (op: string) => (op === 'preview'
      ? { problems: [], preview: { count: 1, recipientCount: 1, totalGold: 6309483, capExceeded: false, maxTotalGold: 500_000_000, missing: [] } }
      : { problems: [], preview: { count: 1, recipientCount: 1, totalGold: 6309483, capExceeded: false, maxTotalGold: 500_000_000, missing: [] }, sent: 1 }));
    show();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '강화비 차액' } });
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '돌려드려요.' } });
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: `${USER} 6309483` } });
    const send = screen.getByRole('button', { name: '보내기' });
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    expect(await screen.findByText(/대상 1명, 골드 합계 6,309,483G/)).toBeTruthy();
    const request = {
      title: '강화비 차액', body: '돌려드려요.',
      target: { kind: 'users', recipients: [{ userId: USER, gold: 6309483 }] },
      idempotencyKey: expect.any(String),
    };
    expect(mocks.mail).toHaveBeenLastCalledWith('preview', request);
    const previewKey = mocks.mail.mock.calls[0][1].idempotencyKey;

    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    const dialogs = await screen.findAllByRole('button', { name: '보내기' });
    fireEvent.click(dialogs[dialogs.length - 1]);
    await waitFor(() => expect(mocks.mail).toHaveBeenLastCalledWith('send', { ...request, idempotencyKey: previewKey }));
  });

  it('중복 수신자와 배치 골드 상한 초과는 경고와 함께 미리보기·보내기를 막는다', async () => {
    show();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '안내' } });
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '본문' } });
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: `${USER} 10\n${USER.toUpperCase()} 20` } });
    expect(screen.getByText(/중복된 계정 id/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();

    mocks.mail.mockResolvedValueOnce({
      problems: ['totalGold'],
      preview: { count: 1, recipientCount: 1, totalGold: 600_000_000, capExceeded: true, maxTotalGold: 500_000_000, missing: [] },
    });
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: `${USER} 600000000` } });
    expect(screen.getByText(/일괄 발송 상한.*초과해 발송할 수 없어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    expect(await screen.findByText(/600,000,000G.*500,000,000G.*초과해 발송할 수 없어요/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('받는 사람 형식이 틀리면 줄 번호를 알려 주고 미리보기를 막는다', async () => {
    show();
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: 'nope 1' } });
    expect(screen.getByText('형식이 틀린 줄: 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();
  });

  it('이메일·닉네임으로 찾은 계정을 받는 사람 목록에 더하고, 계정 id로 보낸다', async () => {
    mocks.mail.mockResolvedValue({
      problems: [],
      preview: { count: 2, recipientCount: 2, totalGold: 0, capExceeded: false, maxTotalGold: 500_000_000, missing: [] },
    });
    show();
    await screen.findByText('지난 우편');
    const search = screen.getByLabelText(/계정 찾기/);
    fireEvent.change(search, { target: { value: '바다' } });
    fireEvent.click(screen.getByRole('option', { name: /^바다친구\(friend@example\.com\)/ }));
    fireEvent.change(search, { target: { value: '민물' } });
    fireEvent.click(screen.getByRole('option', { name: /^민물러\(게스트\)/ }));
    const list = screen.getByLabelText(/받는 사람\(/) as HTMLTextAreaElement;
    expect(list.value).toBe(`${USER} 0\ne747e6c9-f0c2-4192-a462-9cd26e8a812a 0`);
    expect(screen.getByText('받는 사람 2명: 바다친구(friend@example.com), 민물러(게스트)')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'nobody' } });
    expect(screen.getByText('찾는 계정이 없어요.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '안내' } });
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '본문' } });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await waitFor(() => expect(mocks.mail).toHaveBeenLastCalledWith('preview', {
      title: '안내', body: '본문',
      target: { kind: 'users', recipients: [{ userId: USER, gold: 0 }, { userId: 'e747e6c9-f0c2-4192-a462-9cd26e8a812a', gold: 0 }] },
      idempotencyKey: expect.any(String),
    }));
  });

  it('다른 화면의 우편 보내기로 열리면 그 계정을 받는 사람으로 넣어 둔다', async () => {
    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{ access: 'granted', uid: 'u' }}>
          <MailTab to={USER} />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );
    expect((screen.getByLabelText(/받는 사람\(/) as HTMLTextAreaElement).value).toBe(`${USER} 0`);
    expect(await screen.findByText('받는 사람 1명: 바다친구(friend@example.com)')).toBeTruthy();
  });

  it('아이템을 찾아 수량과 함께 첨부하고 빼며, items 포함 요청으로 보낸다', async () => {
    mocks.mail.mockImplementation(async (op: string) => (op === 'preview'
      ? { problems: [], preview: { count: 1, recipientCount: 1, totalGold: 0, capExceeded: false, maxTotalGold: 500_000_000, missing: [] } }
      : { problems: [], preview: { count: 1, recipientCount: 1, totalGold: 0, capExceeded: false, maxTotalGold: 500_000_000, missing: [] }, sent: 1 }));
    show();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '비약 선물' } });
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '행운이 함께하길!' } });
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: `${USER} 0` } });

    fireEvent.change(screen.getByLabelText(/첨부 수량/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/첨부 아이템 찾기/), { target: { value: '바다 영약' } });
    fireEvent.click(screen.getByRole('option', { name: /작은 바다 영약/ }));

    expect(screen.getByLabelText('첨부된 아이템')).toHaveTextContent('작은 바다 영약×3');

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    expect(await screen.findByText(/작은 바다 영약 3개/)).toBeTruthy();
    expect(mocks.mail).toHaveBeenLastCalledWith('preview', {
      title: '비약 선물',
      body: '행운이 함께하길!',
      target: { kind: 'users', recipients: [{ userId: USER, gold: 0 }] },
      items: [{ id: 'luck-small', qty: 3 }],
      idempotencyKey: expect.any(String),
    });

    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    const sendButtons = await screen.findAllByRole('button', { name: '보내기' });
    fireEvent.click(sendButtons[sendButtons.length - 1]);
    await waitFor(() => expect(mocks.mail).toHaveBeenLastCalledWith('send', expect.objectContaining({
      items: [{ id: 'luck-small', qty: 3 }],
    })));
  });

  it('골드·아이템·모자가 모두 없는 우편은 empty 안내를 보이고 보내기를 막는다', async () => {
    mocks.mail.mockResolvedValueOnce({
      problems: ['empty'],
      preview: { count: 1, recipientCount: 1, totalGold: 0, capExceeded: false, maxTotalGold: 500_000_000, missing: [] },
    });
    show();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '빈 보상' } });
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '본문' } });
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: `${USER} 0` } });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    expect(await screen.findByText('골드, 아이템, 모자 중 하나 이상을 보내야 해요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('모자를 찾아 첨부하고 빼며, hats 포함 요청으로 미리보기와 보내기를 실행한다', async () => {
    mocks.mail.mockImplementation(async (op: string) => (op === 'preview'
      ? { problems: [], preview: { count: 1, recipientCount: 1, totalGold: 0, capExceeded: false, maxTotalGold: 500_000_000, missing: [] } }
      : { problems: [], preview: { count: 1, recipientCount: 1, totalGold: 0, capExceeded: false, maxTotalGold: 500_000_000, missing: [] }, sent: 1 }));
    show();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '산타 선물' } });
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '산타모자를 드려요.' } });
    fireEvent.change(screen.getByLabelText(/받는 사람/), { target: { value: `${USER} 0` } });

    fireEvent.change(screen.getByLabelText(/첨부 모자 찾기/), { target: { value: '산타' } });
    fireEvent.click(screen.getByRole('option', { name: /산타모자/ }));
    expect(screen.getByLabelText('첨부된 모자')).toHaveTextContent('모자 산타모자');

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    expect(await screen.findByText(/1인당 첨부 모자 산타모자/)).toBeTruthy();
    expect(mocks.mail).toHaveBeenLastCalledWith('preview', {
      title: '산타 선물',
      body: '산타모자를 드려요.',
      target: { kind: 'users', recipients: [{ userId: USER, gold: 0 }] },
      hats: ['santa-hat'],
      idempotencyKey: expect.any(String),
    });

    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    const sendButtons = await screen.findAllByRole('button', { name: '보내기' });
    fireEvent.click(sendButtons[sendButtons.length - 1]);
    await waitFor(() => expect(mocks.mail).toHaveBeenLastCalledWith('send', expect.objectContaining({
      hats: ['santa-hat'],
    })));
  });
});
