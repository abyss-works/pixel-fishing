// 게임 화면 패널 초기화 — 거점을 떠날 때 업적 모달을 포함한 열린 패널을 모두 닫는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
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
import type { EventsSnapshot } from '../../../platform/api';
import { resetKeyScopes } from '../../ui/hotkeys';
import { resetOpenWindows } from '../../ui/openWindows';
import GameView from './GameView';

const noticeMock = vi.hoisted(() => ({
  activeNotices: [] as NoticeItem[],
  endedNotices: [] as NoticeItem[],
  stackNotices: [] as NoticeItem[],
  dismissNotice: vi.fn(),
}));
const eventMock = vi.hoisted(() => ({
  snap: null as EventsSnapshot | null,
  players: [] as Array<{ uid: string; nick: string; boat: number; fame: number; look: { shirt: number; pants: number; hat: string | null } }>,
}));

vi.mock('../../../features/live/service/useNotices', () => ({
  useNotices: () => noticeMock,
}));
vi.mock('../../../features/events/service/useEvents', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../features/events/service/useEvents')>();
  return {
    ...mod,
    useEvents: () => ({
      snap: eventMock.snap,
      loaded: true,
      failed: false,
      offline: eventMock.snap === null,
      refresh: vi.fn(),
    }),
  };
});
vi.mock('../../../features/live/service/useLive', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../features/live/service/useLive')>();
  return {
    ...mod,
    usePlayersIn: () => eventMock.players,
  };
});
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
  eventMock.snap = null;
  eventMock.players = [];
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

  it('활성 이벤트가 있을 때만 HUD 이벤트 버튼을 보이고, 정식 계정의 미수령·정산 보상에서만 알림 점을 켠다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderView = (account: string | null) =>
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
            syncLabel={null}
            syncState="off"
            guestProgress="nothing"
            account={account}
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

    renderView('dev@localhost');
    expect(screen.queryByRole('button', { name: '이벤트' })).not.toBeInTheDocument();
    cleanup();

    eventMock.snap = {
      now: '2026-12-01T12:00:00.000Z',
      events: [{
        id: 'ev-champ',
        kind: 'championship',
        title: '강태공 선수권 대회',
        description: '분지 호수 대회',
        startsAt: '2026-12-01T00:00:00.000Z',
        endsAt: '2026-12-11T12:00:00.000Z',
        active: true,
        config: {},
      }],
      trio: null,
      championship: {
        eventId: 'ev-champ',
        score: 100,
        bestFishId: null,
        bestFishScore: 0,
        catches: 1,
        dex: {},
        hatsGranted: [],
        pendingGold: 500,
        pendingFame: 4,
        rank: 1,
        top: [],
      },
      draw: null,
    };

    // 게스트는 활성 이벤트 버튼을 보지만 알림 점은 끄고, 클릭 시 계정 연결 안내를 본다
    api.auth.isConfigured = true;
    renderView(null);
    const guestBtn = screen.getByRole('button', { name: '이벤트' });
    expect(guestBtn.querySelector('[data-alert="true"]')).toBeNull();
    fireEvent.click(guestBtn);
    expect(screen.getByRole('dialog', { name: '이벤트' })).toBeInTheDocument();
    expect(screen.getByText('계정 연결 필요')).toBeInTheDocument();
    cleanup();

    // 정식 계정은 정산 가능한 보상이 있으면 알림 점을 켠다
    renderView('dev@localhost');
    const accountBtn = screen.getByRole('button', { name: '이벤트' });
    expect(accountBtn.querySelector('[data-alert="true"]')).not.toBeNull();
  });

  it('championship 구역에서는 바다 튜토리얼 없이 PresenceChip으로 접속 인원을 표시한다', () => {
    eventMock.players = [
      { uid: 'p2', nick: '선원2', boat: 1, fame: 10, look: { shirt: 1, pants: 1, hat: null } },
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GameView
          game={{ ...newState(), tutorials: [], location: { kind: 'region', id: 'championship' } }}
          scene={{ kind: 'region', id: 'championship' }}
          entryPos={null}
          placeSeq={0}
          dispatch={() => ({ status: 'ok', state: newState(), result: { type: 'none' } })}
          setToast={() => {}}
          onScene={() => {}}
          onPlace={() => {}}
          log={[]}
          syncLabel={null}
          syncState="on"
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

    expect(screen.getByRole('button', { name: '이 바다의 플레이어 1명, 목록 열기' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '바다 항해 안내' })).not.toBeInTheDocument();
  });
});
