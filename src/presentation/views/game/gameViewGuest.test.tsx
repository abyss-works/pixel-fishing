// 게임 화면이 필드에 넘기는 확정된 게스트 여부 — 계정 확인 상태에 따라 값이 정해진다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api } from '../../../platform/api';
import { TUTORIAL_IDS } from '../../../game/content/tutorials';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { markPromptsAnswered, resetAnnouncements, setLastSeenVersion } from '../../../platform/adapters/announcements';
import { APP_VERSION } from '../../../version';
import { resetWhatsNewSession } from '../../../features/announcements/service/whatsNew';
import { resetTutorialSession } from '../../../features/tutorial/service/tutorial';
import { resetFortuneModalSession } from '../../../features/fortune/service/fortuneModal';
import { resetOpenWindows } from '../../ui/openWindows';
import { resetAlerts } from '../../../platform/api/attention';
import { resetAlertPrompt } from '../../../features/alerts/service/alertPrompt';
import {
  hasPendingSailReturn,
  resetSailReturnForTest,
} from '../../../features/account/service/sailReturn';
import GameView from './GameView';

const seen = vi.hoisted(() => ({
  guest: undefined as boolean | undefined,
  onGuestBlocked: undefined as (() => void) | undefined,
}));

vi.mock('../../layouts/game-stage/Field', () => ({
  default: (props: { guest?: boolean; onGuestBlocked?: () => void }) => {
    seen.guest = props.guest;
    seen.onGuestBlocked = props.onGuestBlocked;
    return null;
  },
}));

const originalConfigured = api.auth.isConfigured;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  resetWhatsNewSession();
  resetTutorialSession();
  resetFortuneModalSession();
  resetAnnouncements();
  setLastSeenVersion(APP_VERSION);
  markPromptsAnswered(['fish-art']);
  resetOpenWindows();
  resetAlerts();
  resetAlertPrompt();
  api.auth.isConfigured = true;
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  seen.guest = undefined;
  seen.onGuestBlocked = undefined;
  sessionStorage.clear();
  resetSailReturnForTest();
});

afterEach(() => {
  cleanup();
  api.auth.isConfigured = originalConfigured;
  window.matchMedia = originalMatchMedia;
  sessionStorage.clear();
  resetSailReturnForTest();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderView(account: string | null, accountChecked: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}><GameView
      game={{ ...newState(), tutorials: [...TUTORIAL_IDS] }} scene={{ kind: 'region', id: 'village' }} entryPos={null} placeSeq={0}
      dispatch={() => { throw new Error('dispatch is not used'); }} setToast={() => {} } onScene={() => {}} onPlace={() => {} }
      log={[]} syncLabel={null} syncState="on" guestProgress="nothing"
      account={account} accountChecked={accountChecked} accountFailed={false} uid={null} nickname={null}
      onRename={async () => null} onAuthChanged={async () => {}} onResync={async () => {}}
    /></QueryClientProvider>,
  );
}

describe('필드에 넘기는 확정된 게스트 여부', () => {
  it('계정 확인이 끝난 게스트면 참이다', () => {
    renderView(null, true);
    expect(seen.guest).toBe(true);
  });

  it('계정 확인 전이거나 확인에 실패해 확인 완료가 아니면 거짓이다', () => {
    renderView(null, false);
    expect(seen.guest).toBe(false);
  });

  it('로그인한 계정이면 거짓이다', () => {
    renderView('a@example.com', true);
    expect(seen.guest).toBe(false);
  });

  it('포구 출항 차단으로 열린 연결 창에서 계정 삭제 없이 출항 전용 안내를 보이고 구글 로그인을 시작하면 출항 대기를 저장한다', async () => {
    vi.spyOn(api.auth, 'startGoogle').mockResolvedValue({ ok: true });
    renderView(null, true);
    act(() => { seen.onGuestBlocked?.(); });
    expect(await screen.findByRole('dialog', { name: '태평양 출항 준비' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계정 삭제' })).toBeNull();
    const googleBtn = screen.getByRole('button', { name: 'Google로 계속하기' });
    fireEvent.click(googleBtn);
    await waitFor(() => expect(api.auth.startGoogle).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(true);
  });


  it('로컬 모드 첫 진입에서는 마을 튜토리얼이 먼저 뜨고 브라우저 알림 카드가 겹치지 않는다', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => 'default') });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderGame = (tutorials: GameState['tutorials']) => render(
      <QueryClientProvider client={client}><GameView
        game={{ ...newState(), tutorials }} scene={{ kind: 'region', id: 'village' }} entryPos={null} placeSeq={0}
        dispatch={() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } })} setToast={() => {} } onScene={() => {}} onPlace={() => {} }
        log={[]} syncLabel={null} syncState="off" guestProgress="nothing"
        account={null} accountChecked={true} accountFailed={false} uid={null} nickname={null}
        onRename={async () => null} onAuthChanged={async () => {}} onResync={async () => {}}
      /></QueryClientProvider>,
    );

    // 업데이트 소식 판정이 끝난 재마운트에서 경합이 생긴다 — 첫 판정은 이전 마운트가 마친다
    const first = renderGame([...TUTORIAL_IDS]);
    first.unmount();
    cleanup();
    localStorage.removeItem('pf-alert-prompt-seen');
    resetTutorialSession();
    resetAlertPrompt();

    renderGame([]);
    expect(await screen.findByRole('dialog', { name: '마을에 오신 걸 환영해요' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '브라우저 알림' })).toBeNull();
  });
});
