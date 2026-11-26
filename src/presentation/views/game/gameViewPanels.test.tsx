// 게임 화면 패널 초기화 — 거점을 떠날 때 업적 모달을 포함한 열린 패널을 모두 닫는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { bountyById } from '../../../game/content/bounties';
import type { BountySnapshot } from '../../../features/bounty/model/types';
import { api } from '../../../platform/api';
import { newState } from '../../../game/rules/logic';
import { TUTORIAL_IDS } from '../../../game/content/tutorials';
import { markPromptsAnswered, resetAnnouncements, setLastSeenVersion } from '../../../platform/adapters/announcements';
import { APP_VERSION } from '../../../version';
import { resetWhatsNewSession } from '../../../features/announcements/service/whatsNew';
import { resetTutorialSession } from '../../../features/tutorial/service/tutorial';
import { resetFortuneModalSession } from '../../../features/fortune/service/fortuneModal';
import { resetCanvasCover } from '../../layouts/game-stage/canvasCover';
import type { NoticeItem } from '../../../game/rules/live';
import { resetKeyScopes } from '../../ui/hotkeys';
import { resetOpenWindows } from '../../ui/openWindows';
import GameView from './GameView';

const noticeMock = vi.hoisted(() => ({
  activeNotices: [] as NoticeItem[],
  endedNotices: [] as NoticeItem[],
  stackNotices: [] as NoticeItem[],
  dismissNotice: vi.fn(),
}));

const bountyMock = vi.hoisted(() => ({
  snap: null as BountySnapshot | null,
}));

vi.mock('../../../features/live/service/useNotices', () => ({
  useNotices: () => noticeMock,
}));
vi.mock('../../../features/bounty/service/useBounty', () => ({
  useBounty: () => ({ snap: bountyMock.snap, loaded: true, failed: false, offline: bountyMock.snap === null, refresh: vi.fn() }),
}));
vi.mock('../../layouts/game-stage/Field', () => ({ default: () => null }));

const originalConfigured = api.auth.isConfigured;
const originalMatchMedia = window.matchMedia;
const originalContext = HTMLCanvasElement.prototype.getContext;

function fakeContext(): CanvasRenderingContext2D {
  const target = function () {};
  const ctx: unknown = new Proxy(target, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : ctx),
    set: () => true,
    apply: () => ctx,
  });
  return ctx as CanvasRenderingContext2D;
}

beforeEach(() => {
  localStorage.clear();
  resetCanvasCover();
  resetWhatsNewSession();
  resetTutorialSession();
  resetFortuneModalSession();
  resetAnnouncements();
  setLastSeenVersion(APP_VERSION);
  markPromptsAnswered(['fish-art']);
  resetKeyScopes();
  resetOpenWindows();
  noticeMock.activeNotices = [];
  noticeMock.endedNotices = [];
  noticeMock.stackNotices = [];
  noticeMock.dismissNotice.mockReset();
  bountyMock.snap = null;
  api.auth.isConfigured = false;
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  HTMLCanvasElement.prototype.getContext = (() => fakeContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  api.auth.isConfigured = originalConfigured;
  window.matchMedia = originalMatchMedia;
  HTMLCanvasElement.prototype.getContext = originalContext;
});

describe('GameView 패널 초기화', () => {
  it('거점을 떠나면 열려 있던 업적 모달을 닫는다', () => {
    const onScene = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GameView
          game={{ ...newState(), tutorials: [...TUTORIAL_IDS] }}
          scene={{ kind: 'base', id: 'home' }}
          entryPos={null}
          placeSeq={0}
          dispatch={() => ({ status: 'ok', state: newState(), result: { type: 'none' } })}
          setToast={() => {}}
          onScene={onScene}
          onPlace={() => {}}
          log={[]}
          syncLabel={null}
          syncState="off"
          guestProgress="nothing"
          account="dev@localhost"
          accountChecked={true}
          accountFailed={false}
          uid="u1"
          nickname="테스터"
          onRename={async () => null}
          onAuthChanged={async () => {}}
          onResync={async () => {}}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^메뉴 열기/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^업적/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '업적' })).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-facility="exit"]')!);
    expect(onScene).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('메뉴 줄의 운세를 누르면 스테이지 안에 운세 달력 창이 열리고 거점을 떠나면 닫힌다', () => {
    const onScene = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GameView
          game={{ ...newState(), tutorials: [...TUTORIAL_IDS] }}
          scene={{ kind: 'base', id: 'home' }}
          entryPos={null}
          placeSeq={0}
          dispatch={() => ({ status: 'ok', state: newState(), result: { type: 'none' } })}
          setToast={() => {}}
          onScene={onScene}
          onPlace={() => {}}
          log={[]}
          syncLabel={null}
          syncState="off"
          guestProgress="nothing"
          account="dev@localhost"
          accountChecked={true}
          accountFailed={false}
          uid="u1"
          nickname="테스터"
          onRename={async () => null}
          onAuthChanged={async () => {}}
          onResync={async () => {}}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^메뉴 열기/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^운세/ }));
    const dialog = screen.getByRole('dialog');
    expect(document.querySelector('[data-game-stage]')!).toContainElement(dialog);
    expect(screen.getByRole('heading', { name: '운세' })).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-facility="exit"]')!);
    expect(onScene).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('FloatingToastLayer는 GameStageLayout([data-game-stage]) 안에 놓이고 닫기 버튼이 동작한다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onDismissToast = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <GameView
          game={{ ...newState(), tutorials: [...TUTORIAL_IDS] }}
          scene={{ kind: 'base', id: 'home' }}
          entryPos={null}
          placeSeq={0}
          dispatch={() => ({ status: 'ok', state: newState(), result: { type: 'none' } })}
          setToast={() => {}}
          onScene={() => {}}
          onPlace={() => {}}
          log={[]}
          toasts={[{ id: 99, text: '골드가 모자라요.', tone: 'danger' }]}
          onDismissToast={onDismissToast}
          syncLabel={null}
          syncState="off"
          guestProgress="nothing"
          account="dev@localhost"
          accountChecked={true}
          accountFailed={false}
          uid="u1"
          nickname="테스터"
          onRename={async () => null}
          onAuthChanged={async () => {}}
          onResync={async () => {}}
        />
      </QueryClientProvider>,
    );

    const stage = document.querySelector('[data-game-stage]')!;
    const toastStatus = screen.getAllByRole('status').find(el => el.textContent?.includes('골드가 모자라요.'))!;
    expect(stage.contains(toastStatus)).toBe(true);
    expect(toastStatus.parentElement?.className).toContain('absolute');
    expect(toastStatus.parentElement?.className).toContain('z-(--z-toast)');
    expect(toastStatus.parentElement?.className).toContain('pointer-events-none');

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(onDismissToast).toHaveBeenCalledWith(99);
  });

  it('HUD 효과 칩을 누르면 적용 중인 효과 창이 열리고 전체 보너스 보기·가방 열기로 바로 이동한다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GameView
          game={{ ...newState(), boat: COOKING_UNLOCK_BOAT, tutorials: [...TUTORIAL_IDS] }}
          scene={{ kind: 'base', id: 'home' }}
          entryPos={null}
          placeSeq={0}
          dispatch={() => ({ status: 'ok', state: newState(), result: { type: 'none' } })}
          setToast={() => {}}
          onScene={() => {}}
          onPlace={() => {}}
          log={[]}
          syncLabel={null}
          syncState="off"
          guestProgress="nothing"
          account="dev@localhost"
          accountChecked={true}
          accountFailed={false}
          uid="u1"
          nickname="테스터"
          onRename={async () => null}
          onAuthChanged={async () => {}}
          onResync={async () => {}}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '활성 효과 없음' }));
    expect(screen.getByRole('dialog', { name: '적용 중인 효과' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체 보너스 보기' }));
    expect(screen.queryByRole('dialog', { name: '적용 중인 효과' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보너스' }).className).toContain('active');
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.click(screen.getByRole('button', { name: '활성 효과 없음' }));
    fireEvent.click(screen.getByRole('button', { name: '가방 열기' }));
    expect(screen.queryByRole('dialog', { name: '적용 중인 효과' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '아이템' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('메시지 창 공지 띠는 별도 공지 버튼 없이 띠 전체가 단일 버튼이며 누르면 현재·지난 공지 탭이 있는 공지사항 창을 연다', () => {
    noticeMock.activeNotices = [
      {
        id: 1,
        title: '정기 등대 점검 안내',
        body: '등대 점검 본문입니다.',
        startsAt: '2026-11-26T01:00:00.000Z',
        endsAt: '2026-11-26T04:00:00.000Z',
        createdAt: '2026-11-26T00:00:00.000Z',
      },
    ];
    noticeMock.endedNotices = [
      {
        id: 2,
        title: '지난 항구 보수 안내',
        body: '지난 본문입니다.',
        startsAt: '2026-11-25T01:00:00.000Z',
        endsAt: '2026-11-25T03:00:00.000Z',
        createdAt: '2026-11-25T00:00:00.000Z',
      },
    ];

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GameView
          game={{ ...newState(), tutorials: [...TUTORIAL_IDS] }}
          scene={{ kind: 'region', id: 'world' }}
          entryPos={null}
          placeSeq={0}
          dispatch={() => ({ status: 'ok', state: newState(), result: { type: 'none' } })}
          setToast={() => {}}
          onScene={() => {}}
          onPlace={() => {}}
          log={[]}
          syncLabel={null}
          syncState="off"
          guestProgress="nothing"
          account="dev@localhost"
          accountChecked={true}
          accountFailed={false}
          uid="u1"
          nickname="테스터"
          onRename={async () => null}
          onAuthChanged={async () => {}}
          onResync={async () => {}}
        />
      </QueryClientProvider>,
    );

    const stripBtn = screen.getByRole('button', { name: '공지사항 열기' });
    expect(stripBtn).toHaveTextContent('공지');
    expect(stripBtn).toHaveTextContent('정기 등대 점검 안내');
    expect(stripBtn.querySelector('[data-glyph="megaphone"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '공지' })).not.toBeInTheDocument();

    fireEvent.mouseEnter(stripBtn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('누르면 공지사항 창이 열려요.');
    fireEvent.mouseLeave(stripBtn);

    fireEvent.click(screen.getByText('정기 등대 점검 안내'));
    const dialog = screen.getByRole('dialog', { name: '공지사항' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /현재 공지/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /지난 공지/ })).toHaveTextContent('1');
  });

  it('의뢰 창에서 의뢰 포기를 누르면 스테이지 확인 창을 거쳐 abandonQuest를 보낸다', async () => {
    const quest = bountyById('pacific-easy-common')!;
    bountyMock.snap = {
      clearsToday: { general: 0, named: 0 },
      progress: [{ questId: quest.id, progress: 1 }],
      tickets: [],
    };
    const dispatch = vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }));
    const setToast = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GameView
          game={{ ...newState(), tutorials: [...TUTORIAL_IDS] }}
          scene={{ kind: 'base', id: 'home' }}
          entryPos={null}
          placeSeq={0}
          dispatch={dispatch}
          setToast={setToast}
          onScene={() => {}}
          onPlace={() => {}}
          log={[]}
          syncLabel={null}
          syncState="off"
          guestProgress="nothing"
          account="dev@localhost"
          accountChecked={true}
          accountFailed={false}
          uid="u1"
          nickname="테스터"
          onRename={async () => null}
          onAuthChanged={async () => {}}
          onResync={async () => {}}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^메뉴 열기/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^의뢰/ }));
    expect(screen.getByRole('dialog', { name: '의뢰' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '의뢰 포기' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '의뢰 포기' });
    expect(document.querySelector('[data-game-stage]')!).toContainElement(confirmDialog);

    fireEvent.click(screen.getByRole('button', { name: '포기' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'abandonQuest', questId: quest.id }));
    expect(setToast).toHaveBeenCalledWith('의뢰를 포기했어요.');
  });
});
