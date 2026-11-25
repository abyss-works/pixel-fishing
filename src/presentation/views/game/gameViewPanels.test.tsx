// 게임 화면 패널 초기화 — 거점을 떠날 때 업적 모달을 포함한 열린 패널을 모두 닫는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { api } from '../../../platform/api';
import { newState } from '../../../game/rules/logic';
import { TUTORIAL_IDS } from '../../../game/content/tutorials';
import { markPromptsAnswered, resetAnnouncements, setLastSeenVersion } from '../../../platform/adapters/announcements';
import { APP_VERSION } from '../../../version';
import { resetWhatsNewSession } from '../../../features/announcements/service/whatsNew';
import { resetTutorialSession } from '../../../features/tutorial/service/tutorial';
import { resetFortuneModalSession } from '../../../features/fortune/service/fortuneModal';
import { resetCanvasCover } from '../../layouts/game-stage/canvasCover';
import { resetKeyScopes } from '../../ui/hotkeys';
import { resetOpenWindows } from '../../ui/openWindows';
import GameView from './GameView';

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
          onWarmup={() => {}}
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
          onWarmup={() => {}}
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

  it('FloatingToastLayer는 GameStageLayout([container-type:size]) 바깥에 놓이고 앱 모달이 열려도 닫기 버튼이 동작한다', () => {
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
          onWarmup={() => {}}
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

    // 설정 앱 모달(layer="app")을 연 상태에서도 플로팅 토스트가 스테이지([data-game-stage]) 밖에 위치한다
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const settingBtn = screen.getAllByRole('button', { name: '설정' }).find(b => b.hasAttribute('aria-pressed'))!;
    fireEvent.click(settingBtn);
    expect(screen.getByRole('dialog', { name: '설정' })).toBeInTheDocument();

    const stage = document.querySelector('[data-game-stage]')!;
    const toastStatus = screen.getAllByRole('status').find(el => el.textContent?.includes('골드가 모자라요.'))!;
    expect(stage.contains(toastStatus)).toBe(false);
    expect(toastStatus.parentElement?.className).toContain('fixed');
    expect(toastStatus.parentElement?.className).toContain('pointer-events-none');

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(onDismissToast).toHaveBeenCalledWith(99);
  });
});
