import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MailItem } from '../../../../platform/api';

const state = vi.hoisted(() => ({ mails: null as MailItem[] | null, read: [] as number[], fail: false }));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return {
    ...mod,
    readMails: async () => {
      if (state.fail) throw new Error('mail error');
      return state.mails;
    },
    markMailRead: async (id: number) => { state.read.push(id); },
  };
});

import MailboxModal from './MailboxModal';

const mail = (over: Partial<MailItem>): MailItem => ({
  id: 1, title: '우편', body: '본문', gold: 0, items: [], createdAt: '2026-10-23T00:00:00.000Z', readAt: null, claimedAt: null, ...over,
});

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return { ...view, again: (next: ReactNode) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}

afterEach(() => { cleanup(); state.mails = null; state.read = []; state.fail = false; });

describe('우편함 창', () => {
  it('우편을 고르면 본문을 보이고 읽음을 남긴다. 골드 우편은 받기로 받는다', async () => {
    state.mails = [mail({ id: 7, title: '강화비 차액', body: '돌려드려요.', gold: 6309483 })];
    // 서버처럼 받은 뒤의 조회에는 받은 시각이 들어 있다
    const dispatch = vi.fn(() => {
      state.mails = state.mails!.map(m => ({ ...m, claimedAt: '2026-10-23T02:00:00.000Z' }));
      return { status: 'ok', state: {}, result: { type: 'mail', gold: 6309483 } } as never;
    });
    const toast = vi.fn();
    wrap(<MailboxModal dispatch={dispatch} setToast={toast} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('row', { name: /강화비 차액/ }));
    expect(screen.getByText('돌려드려요.')).toBeInTheDocument();
    await waitFor(() => expect(state.read).toEqual([7]));
    fireEvent.click(screen.getByRole('button', { name: '받기' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'claimMail', id: 7 });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('우편에서 6,309,483G를 받았어요!', 'gold'));
    // 받으면 다시 읽기 전에도 바로 받은 것으로 보인다
    expect(screen.queryByRole('button', { name: '받기' })).not.toBeInTheDocument();
    expect(screen.getByText('받음')).toBeInTheDocument();
  });

  it('받을 수 없으면 거부 사유를 안내하고, 받은 우편에는 받기 버튼이 없다', async () => {
    state.mails = [
      mail({ id: 8, title: '이미 받음', gold: 10, claimedAt: '2026-10-23T01:00:00.000Z', readAt: '2026-10-23T01:00:00.000Z' }),
      mail({ id: 9, title: '받을 우편', gold: 10 }),
    ];
    const dispatch = vi.fn(() => ({ status: 'rejected', error: 'mail-unavailable' }) as never);
    const toast = vi.fn();
    wrap(<MailboxModal dispatch={dispatch} setToast={toast} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('row', { name: /이미 받음/ }));
    expect(screen.queryByRole('button', { name: '받기' })).not.toBeInTheDocument();
    expect(screen.getByText('받음')).toBeInTheDocument();
    expect(state.read).toEqual([]);
    fireEvent.click(screen.getByRole('row', { name: /받을 우편/ }));
    fireEvent.click(screen.getByRole('button', { name: '받기' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('이미 받았거나 받을 수 없는 우편이에요.', 'warn'));
  });

  it('고르기 전에는 본문 칸에 고르라는 안내를 두고, 할 일이 남은 우편 제목은 굵게 쓴다', async () => {
    state.mails = [
      mail({ id: 3, title: '새 소식' }),
      mail({ id: 4, title: '읽은 소식', readAt: '2026-10-23T01:00:00.000Z' }),
    ];
    wrap(<MailboxModal dispatch={vi.fn() as never} setToast={vi.fn()} onClose={() => {}} />);
    expect(await screen.findByText('위에서 우편을 골라 주세요.')).toBeInTheDocument();
    expect(screen.getByText('새 소식')).toHaveClass('font-bold');
    expect(screen.getByText('읽은 소식')).toHaveClass('font-normal');
    fireEvent.keyDown(screen.getByRole('row', { name: /새 소식/ }), { key: 'Enter' });
    expect(screen.getByRole('row', { name: /새 소식/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('본문')).toBeInTheDocument();
  });

  it('골드 없이 아이템만 첨부된 우편도 배지와 받기 버튼을 보이고 한 번에 받는다', async () => {
    state.mails = [
      mail({
        id: 11,
        title: '보상 선물',
        body: '비약을 보내드려요.',
        gold: 0,
        items: [{ id: 'luck-small', qty: 2 }, { id: 'mat-abyss-lantern', qty: 1 }],
      }),
    ];
    const dispatch = vi.fn(() => {
      state.mails = state.mails!.map(m => ({ ...m, claimedAt: '2026-10-23T02:00:00.000Z' }));
      return { status: 'ok', state: {}, result: { type: 'mail', gold: 0, items: { 'luck-small': 2, 'mat-abyss-lantern': 1 } } } as never;
    });
    const toast = vi.fn();
    wrap(<MailboxModal dispatch={dispatch} setToast={toast} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('row', { name: /보상 선물/ }));
    expect(screen.getByText('작은 바다 영약')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
    expect(screen.getByText('돌이 된 이빨')).toBeInTheDocument();
    expect(screen.getByText('×1')).toBeInTheDocument();
    const claimBtns = screen.getAllByRole('button', { name: '받기' });
    expect(claimBtns).toHaveLength(1);
    fireEvent.click(claimBtns[0]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'claimMail', id: 11 });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('우편에서 작은 바다 영약 2개, 돌이 된 이빨 1개를 받았어요!', 'gold'));
    expect(screen.queryByRole('button', { name: '받기' })).not.toBeInTheDocument();
    expect(screen.getByText('받음')).toBeInTheDocument();
  });

  it('골드와 아이템이 함께 첨부된 우편은 둘 다 보이고 받기 한 번으로 함께 받는다', async () => {
    state.mails = [
      mail({
        id: 12,
        title: '특별 보급',
        body: '골드와 비약이에요.',
        gold: 500,
        items: [{ id: 'luck-small', qty: 2 }],
      }),
    ];
    const dispatch = vi.fn(() => {
      state.mails = state.mails!.map(m => ({ ...m, claimedAt: '2026-10-23T02:00:00.000Z' }));
      return { status: 'ok', state: {}, result: { type: 'mail', gold: 500, items: { 'luck-small': 2 } } } as never;
    });
    const toast = vi.fn();
    wrap(<MailboxModal dispatch={dispatch} setToast={toast} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('row', { name: /특별 보급/ }));
    expect(screen.getByText('500G')).toBeInTheDocument();
    expect(screen.getByText('작은 바다 영약')).toBeInTheDocument();
    const claimBtns = screen.getAllByRole('button', { name: '받기' });
    expect(claimBtns).toHaveLength(1);
    fireEvent.click(claimBtns[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('우편에서 500G, 작은 바다 영약 2개를 받았어요!', 'gold'));
  });

  it('첨부 아이템 배지를 올리면 툴팁을, 누르면 효과와 지속 시간이 담긴 상세 창을 보인다', async () => {
    state.mails = [
      mail({
        id: 13,
        title: '행운 보급',
        body: '작은 행운 물약이에요.',
        gold: 0,
        items: [{ id: 'luck-small', qty: 2 }],
      }),
    ];
    wrap(<MailboxModal dispatch={vi.fn() as never} setToast={vi.fn()} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('row', { name: /행운 보급/ }));

    const itemBtn = screen.getByRole('button', { name: /작은 바다 영약/ });
    fireEvent.mouseEnter(itemBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('비약');
    fireEvent.mouseLeave(itemBtn.parentElement!);

    fireEvent.click(itemBtn);
    const dialogs = screen.getAllByRole('dialog');
    const detailDialog = dialogs[dialogs.length - 1];
    expect(detailDialog.parentElement!.className).toContain('z-(--z-stage-modal)');
    expect(detailDialog.parentElement!.className).not.toContain('z-(--z-app-modal)');
    expect(detailDialog).toHaveTextContent('작은 바다 영약');
    expect(detailDialog).toHaveTextContent('모든 행운 효과');
    expect(detailDialog).toHaveTextContent('×1.05');
    expect(detailDialog).toHaveTextContent('하루 동안');
  });

  it('우편이 없으면 빈 상태를 안내한다', async () => {
    state.mails = [];
    wrap(<MailboxModal dispatch={vi.fn() as never} setToast={vi.fn()} onClose={() => {}} />);
    expect(await screen.findByText('받은 우편이 없어요.')).toBeInTheDocument();
  });

  it('우편 조회 실패 시 다시 시도 버튼을 보이고 누르면 우편을 다시 읽는다', async () => {
    state.fail = true;
    state.mails = [mail({ id: 21, title: '복구된 우편' })];
    wrap(<MailboxModal dispatch={vi.fn() as never} setToast={vi.fn()} onClose={() => {}} />);
    expect(await screen.findByText(/우편을 열지 못했어요/)).toBeInTheDocument();

    state.fail = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('복구된 우편')).toBeInTheDocument();
  });
});
