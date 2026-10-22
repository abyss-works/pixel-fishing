import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MailItem } from '../../../../platform/api';

const state = vi.hoisted(() => ({ mails: null as MailItem[] | null, read: [] as number[] }));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return {
    ...mod,
    readMails: async () => state.mails,
    markMailRead: async (id: number) => { state.read.push(id); },
  };
});

import MailboxButton from './MailboxButton';
import MailboxModal from './MailboxModal';

const mail = (over: Partial<MailItem>): MailItem => ({
  id: 1, title: '우편', body: '본문', gold: 0, createdAt: '2026-10-23T00:00:00.000Z', readAt: null, claimedAt: null, ...over,
});

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return { ...view, again: (next: ReactNode) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}

afterEach(() => { cleanup(); state.mails = null; state.read = []; });

describe('우편함 버튼', () => {
  it('로컬 모드(우편함 없음)에서는 그리지 않는다', async () => {
    const toast = vi.fn();
    wrap(<MailboxButton onOpen={() => {}} setToast={toast} />);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /우편함/ })).not.toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });

  it('남은 우편 수를 붙이고, 처음 확인했을 때 안내를 한 번만 띄운다', async () => {
    state.mails = [mail({ id: 1, gold: 100 }), mail({ id: 2, readAt: '2026-10-23T01:00:00.000Z' }), mail({ id: 3 })];
    const toast = vi.fn();
    const onOpen = vi.fn();
    const view = wrap(<MailboxButton onOpen={onOpen} setToast={toast} />);
    const button = await screen.findByRole('button', { name: '우편함, 받지 않은 우편 2통' });
    expect(button).toHaveTextContent('2');
    view.again(<MailboxButton onOpen={onOpen} setToast={toast} />);
    await screen.findByRole('button', { name: '우편함, 받지 않은 우편 2통' });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('받지 않은 우편이 있어요. 오른쪽 위 우편함에서 확인해 주세요.', 'gold');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
  });
});

describe('우편함 창', () => {
  it('우편을 고르면 본문을 보이고 읽음을 남긴다. 골드 우편은 받기로 받는다', async () => {
    state.mails = [mail({ id: 7, title: '강화비 차액', body: '돌려드려요.', gold: 6309483 })];
    const dispatch = vi.fn(() => ({ status: 'ok', state: {}, result: { type: 'mail', gold: 6309483 } }) as never);
    const toast = vi.fn();
    wrap(<MailboxModal dispatch={dispatch} setToast={toast} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('option', { name: /강화비 차액/ }));
    expect(screen.getByText('돌려드려요.')).toBeInTheDocument();
    await waitFor(() => expect(state.read).toEqual([7]));
    fireEvent.click(screen.getByRole('button', { name: '받기' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'claimMail', id: 7 });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('우편에서 6,309,483G를 받았어요!', 'gold'));
  });

  it('받을 수 없으면 거부 사유를 안내하고, 받은 우편에는 받기 버튼이 없다', async () => {
    state.mails = [
      mail({ id: 8, title: '이미 받음', gold: 10, claimedAt: '2026-10-23T01:00:00.000Z', readAt: '2026-10-23T01:00:00.000Z' }),
      mail({ id: 9, title: '받을 우편', gold: 10 }),
    ];
    const dispatch = vi.fn(() => ({ status: 'rejected', error: 'mail-unavailable' }) as never);
    const toast = vi.fn();
    wrap(<MailboxModal dispatch={dispatch} setToast={toast} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('option', { name: /이미 받음/ }));
    expect(screen.queryByRole('button', { name: '받기' })).not.toBeInTheDocument();
    expect(screen.getByText('받음')).toBeInTheDocument();
    expect(state.read).toEqual([]);
    fireEvent.click(screen.getByRole('option', { name: /받을 우편/ }));
    fireEvent.click(screen.getByRole('button', { name: '받기' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('이미 받았거나 받을 수 없는 우편이에요.', 'warn'));
  });

  it('우편이 없으면 빈 상태를 안내한다', async () => {
    state.mails = [];
    wrap(<MailboxModal dispatch={vi.fn() as never} setToast={vi.fn()} onClose={() => {}} />);
    expect(await screen.findByText('받은 우편이 없어요.')).toBeInTheDocument();
  });
});
