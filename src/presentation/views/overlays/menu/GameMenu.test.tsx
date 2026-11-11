import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MailItem } from '../../../../platform/api';
import { newState } from '../../../../game/rules/logic';
import { BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP } from '../../../../game/rules/balance';

const state = vi.hoisted(() => ({ mails: null as MailItem[] | null }));
vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return { ...mod, readMails: async () => state.mails };
});

const bounty = vi.hoisted(() => ({ snap: null as null | { clearsToday: { general: number; named: number } } }));
vi.mock('../../../../features/bounty/service/useBounty', () => ({
  useBounty: () => ({ snap: bounty.snap, loaded: true, refresh: () => {} }),
}));

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

const handlers = () => ({ game: newState(), guest: false, onQuests: vi.fn(), onGuild: vi.fn(), onFriends: vi.fn(), onMailbox: vi.fn(), setToast: vi.fn() });

afterEach(() => { cleanup(); bounty.snap = null; state.mails = null; layout.mobile = false; });

describe('게임 메뉴', () => {
  it('길드, 소셜, 우편함을 열 수 없어도(로컬 모드, 게스트) 의뢰 때문에 메뉴 버튼은 늘 있다', async () => {
    const h = handlers();
    wrap(<GameMenu account={null} {...h} />);
    fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기' }));
    await waitFor(() => expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['의뢰']));
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
    expect(items.map(i => i.textContent)).toEqual(['의뢰', '우편함2']);
    expect(items[1]).toHaveAccessibleName('우편함, 받지 않은 우편 2통');
    fireEvent.click(items[1]);
    expect(h.onMailbox).toHaveBeenCalled();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });


  it('PC 레이아웃의 메뉴 버튼은 헤더 단계가 크기를 정하는 정사각형이다', async () => {
    state.mails = [mail({ id: 1, gold: 100 })];
    wrap(<GameMenu account={null} {...handlers()} />);
    const cls = (await screen.findByRole('button', { name: /^메뉴 열기/ })).className;
    expect(cls).toContain('h-(--hdr-menu)');
    expect(cls).toContain('w-(--hdr-menu)');
  });

  it.each([['PC', false], ['모바일', true]])('%s 레이아웃의 펼친 메뉴 줄은 메뉴 버튼의 오른쪽 아래에 떠서 헤더 행의 높이를 바꾸지 않는다', async (_name, mobile) => {
    layout.mobile = mobile;
    state.mails = [mail({ id: 1, gold: 100 })];
    wrap(<GameMenu account={null} {...handlers()} />);
    fireEvent.click(await screen.findByRole('button', { name: /^메뉴 열기/ }));
    const list = screen.getAllByRole('menuitem')[0].closest('[role="menu"]')!;
    for (const cls of ['absolute', 'right-0', 'top-full']) expect(list.className.split(' ')).toContain(cls);
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

  describe('의뢰 줄', () => {
    it('맨 위 줄이고 누르면 의뢰 창을 열며 메뉴를 접는다', async () => {
      state.mails = [mail({ id: 1, gold: 100 })];
      const h = handlers();
      wrap(<GameMenu account={null} {...h} />);
      fireEvent.click(await screen.findByRole('button', { name: /^메뉴 열기/ }));
      const items = screen.getAllByRole('menuitem');
      expect(items[0]).toHaveTextContent('의뢰');
      fireEvent.click(items[0]);
      expect(h.onQuests).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    });

    // 실제 clearsStatus와 규칙의 하루 상한을 쓴다: 남은 횟수 = 상한 - 오늘 클리어 수
    const badgesOf = (row: HTMLElement) =>
      [...row.querySelectorAll('[data-badge]')].map(b => [b.getAttribute('data-badge'), b.textContent]);
    const openRow = async () => {
      fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기' }));
      return screen.getAllByRole('menuitem')[0];
    };

    it('오늘 클리어가 0이면 상한만큼 남아 일반(노랑), 네임드(보라) 순서로 배지가 붙는다', async () => {
      bounty.snap = { clearsToday: { general: 0, named: 0 } };
      wrap(<GameMenu account={null} {...handlers()} />);
      const row = await openRow();
      expect(badgesOf(row)).toEqual([['gold', String(BOUNTY_DAILY_CAP)], ['epic', String(BOUNTY_NAMED_DAILY_CAP)]]);
      expect(row).toHaveAccessibleName(`의뢰, 오늘 남은 클리어 일반 ${BOUNTY_DAILY_CAP} 네임드 ${BOUNTY_NAMED_DAILY_CAP}`);
    });

    it('한 종류를 상한까지 클리어하면 그 배지만 사라진다', async () => {
      bounty.snap = { clearsToday: { general: BOUNTY_DAILY_CAP, named: 0 } };
      wrap(<GameMenu account={null} {...handlers()} />);
      expect(badgesOf(await openRow())).toEqual([['epic', String(BOUNTY_NAMED_DAILY_CAP)]]);
    });

    it('둘 다 상한까지 클리어하면(상한 1이면 클리어 1) 배지가 없다', async () => {
      bounty.snap = { clearsToday: { general: BOUNTY_DAILY_CAP, named: BOUNTY_NAMED_DAILY_CAP } };
      wrap(<GameMenu account={null} {...handlers()} />);
      const row = await openRow();
      expect(badgesOf(row)).toEqual([]);
      expect(row).toHaveAccessibleName('의뢰');
    });

    it('남은 클리어를 모르면 의뢰 줄에 배지가 없다', async () => {
      bounty.snap = null;
      wrap(<GameMenu account={null} {...handlers()} />);
      fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기' }));
      const row = screen.getAllByRole('menuitem')[0];
      expect(row.querySelector('[data-badge]')).toBeNull();
      expect(row).toHaveAccessibleName('의뢰');
    });

    it('의뢰 배지는 메뉴 버튼의 알림 점을 켜지 않는다 - 점은 소셜, 우편함 같은 새 알림만 따른다', async () => {
      bounty.snap = { clearsToday: { general: 0, named: 0 } };
      wrap(<GameMenu account={null} {...handlers()} />);
      const button = await screen.findByRole('button', { name: '메뉴 열기' });
      expect(button.textContent).toBe('');
      expect(button.querySelector('.bg-danger')).toBeNull();
      expect(screen.queryByRole('button', { name: /새 알림/ })).not.toBeInTheDocument();
    });
  });

  // 게임 서버가 있는데 계정을 연결하지 않은 게스트: 네 줄이 모두 자리 그대로 잠긴다
  describe('게스트 잠금', () => {
    const guestMenu = async (h = handlers()) => {
      wrap(<GameMenu account={null} {...h} guest />);
      fireEvent.click(await screen.findByRole('button', { name: /^메뉴 열기/ }));
      return h;
    };

    it('의뢰, 길드, 소셜, 우편함 줄이 순서대로 aria-disabled 잠긴 줄이고 자물쇠가 붙으며 title이 없다', async () => {
      await guestMenu();
      const items = screen.getAllByRole('menuitem');
      expect(items.map(i => i.getAttribute('aria-label'))).toEqual(['의뢰', '길드', '소셜', '우편함']);
      for (const item of items) {
        expect(item).toHaveAttribute('aria-disabled', 'true');
        expect(item.querySelector('[data-glyph="lock"]')).not.toBeNull();
        expect(item.closest('[title]')).toBeNull();
      }
    });

    it('줄을 누르거나 올리면 공용 툴팁이 열리고 창은 열리지 않으며 메뉴도 접히지 않는다', async () => {
      const h = await guestMenu();
      const items = screen.getAllByRole('menuitem');
      for (const item of items) fireEvent.click(item);
      expect(h.onQuests).not.toHaveBeenCalled();
      expect(h.onGuild).not.toHaveBeenCalled();
      expect(h.onFriends).not.toHaveBeenCalled();
      expect(h.onMailbox).not.toHaveBeenCalled();
      expect(screen.getAllByRole('menuitem')).toHaveLength(4);
      fireEvent.mouseEnter(items[1].parentElement!);
      expect(screen.getByRole('tooltip')).toHaveTextContent('계정을 연결하면 쓸 수 있어요.');
    });

    it('잠긴 줄에는 배지와 알림 점이 없고 접속 안내도 띄우지 않는다', async () => {
      bounty.snap = { clearsToday: { general: 0, named: 0 } };
      state.mails = [mail({ id: 1, gold: 100 })];
      const h = handlers();
      wrap(<GameMenu account={null} {...h} guest />);
      const button = await screen.findByRole('button', { name: '메뉴 열기' });
      fireEvent.click(button);
      expect(document.querySelector('[data-badge]')).toBeNull();
      expect(screen.getByRole('menuitem', { name: '의뢰' })).toBeInTheDocument();
      expect(h.setToast).not.toHaveBeenCalled();
    });

    it('잠금을 적용하지 않는 상태(계정 사용자, 로컬 모드)는 잠기지 않는다', async () => {
      state.mails = [mail({ id: 1, gold: 100 })];
      wrap(<GameMenu account="me@example.com" {...handlers()} />);
      fireEvent.click(await screen.findByRole('button', { name: /^메뉴 열기/ }));
      for (const item of screen.getAllByRole('menuitem')) expect(item).not.toHaveAttribute('aria-disabled');
      cleanup();
      wrap(<GameMenu account={null} {...handlers()} />);
      fireEvent.click(await screen.findByRole('button', { name: /^메뉴 열기/ }));
      for (const item of screen.getAllByRole('menuitem')) expect(item).not.toHaveAttribute('aria-disabled');
    });
  });
});
