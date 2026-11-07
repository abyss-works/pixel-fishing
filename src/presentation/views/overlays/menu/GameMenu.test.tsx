import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MailItem } from '../../../../platform/api';

const state = vi.hoisted(() => ({ mails: null as MailItem[] | null }));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return { ...mod, readMails: async () => state.mails };
});

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../../../layouts/useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import GameMenu from './GameMenu';

const mail = (over: Partial<MailItem>): MailItem => ({
  id: 1, title: '우편', body: '본문', gold: 0, createdAt: '2026-10-23T00:00:00.000Z', readAt: null, claimedAt: null, ...over,
});

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return { ...view, again: (next: ReactNode) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}

const handlers = () => ({ onGuild: vi.fn(), onFriends: vi.fn(), onMailbox: vi.fn(), setToast: vi.fn() });

afterEach(() => { cleanup(); state.mails = null; layout.mobile = false; });

describe('게임 메뉴', () => {
  it('열 수 있는 입구가 하나도 없으면(로컬 모드, 게스트) 메뉴 버튼을 그리지 않는다', async () => {
    const h = handlers();
    wrap(<GameMenu account={null} {...h} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /메뉴/ })).not.toBeInTheDocument());
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /메뉴/ })).not.toBeInTheDocument();
    expect(h.setToast).not.toHaveBeenCalled();
  });

  // 접속 안내는 계정마다 한 번만 판정한다(모듈 단위 기록). 우편이 있는 테스트 가운데 가장 먼저 둔다
  it('받지 않은 우편이 있으면 처음 확인했을 때 안내를 한 번만 띄운다', async () => {
    state.mails = [mail({ id: 1, gold: 100 })];
    const h = handlers();
    const view = wrap(<GameMenu account={null} {...h} />);
    await screen.findByRole('button', { name: '메뉴 열기, 새 알림 있음' });
    view.again(<GameMenu account={null} {...h} />);
    await waitFor(() => expect(h.setToast).toHaveBeenCalledTimes(1));
    expect(h.setToast).toHaveBeenCalledWith('받지 않은 우편이 있어요. 오른쪽 위 메뉴의 우편함에서 확인해 주세요.', 'gold');
  });
  it('접힌 상태에서는 메뉴 버튼 하나만 보이고, 알릴 것이 있으면 버튼 이름에 싣는다', async () => {
    state.mails = [mail({ id: 1, gold: 100 }), mail({ id: 2 })];
    wrap(<GameMenu account={null} {...handlers()} />);
    const button = await screen.findByRole('button', { name: '메뉴 열기, 새 알림 있음' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('펼치면 입구 줄이 라벨과 수를 보이고, 줄을 누르면 그 창을 열며 메뉴를 접는다', async () => {
    state.mails = [mail({ id: 1, gold: 100 }), mail({ id: 2 })];
    const h = handlers();
    wrap(<GameMenu account={null} {...h} />);
    fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기, 새 알림 있음' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map(i => i.textContent)).toEqual(['우편함2']);
    expect(items[0]).toHaveAccessibleName('우편함, 받지 않은 우편 2통');
    fireEvent.click(items[0]);
    expect(h.onMailbox).toHaveBeenCalled();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });


  it('PC 레이아웃의 메뉴 버튼은 헤더 틀과 같은 높이의 정사각형(60px)이다', async () => {
    state.mails = [mail({ id: 1, gold: 100 })];
    wrap(<GameMenu account={null} {...handlers()} />);
    const cls = (await screen.findByRole('button', { name: /^메뉴 열기/ })).className;
    expect(cls).toContain('h-15');
    expect(cls).not.toContain('@max-[960px]');
  });

  it('모바일 레이아웃의 메뉴 버튼은 헤더 높이의 정사각형 버튼이다', async () => {
    layout.mobile = true;
    state.mails = [mail({ id: 1, gold: 100 })];
    wrap(<GameMenu account={null} {...handlers()} />);
    const cls = (await screen.findByRole('button', { name: /^메뉴 열기/ })).className;
    expect(cls).toContain('h-10');
    expect(cls).toContain('w-10');
    expect(cls).not.toContain('h-15');
  });

});
