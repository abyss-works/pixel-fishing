// 게임 화면이 필드에 넘기는 확정된 게스트 여부 — 계정 확인 상태에 따라 값이 정해진다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { api } from '../../../platform/api';
import { newState } from '../../../game/rules/logic';
import GameView from './GameView';

const seen = vi.hoisted(() => ({ guest: undefined as boolean | undefined }));

vi.mock('../../layouts/game-stage/Field', () => ({
  default: (props: { guest?: boolean }) => {
    seen.guest = props.guest;
    return null;
  },
}));

const originalConfigured = api.auth.isConfigured;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  api.auth.isConfigured = true;
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  seen.guest = undefined;
});

afterEach(() => {
  cleanup();
  api.auth.isConfigured = originalConfigured;
  window.matchMedia = originalMatchMedia;
});

function renderView(account: string | null, accountChecked: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}><GameView
      game={newState()} scene={{ kind: 'region', id: 'village' }} entryPos={null} placeSeq={0}
      dispatch={() => { throw new Error('dispatch is not used'); }} setToast={() => {} } onScene={() => {}} onPlace={() => {} } onWarmup={() => {}}
      log={[]} syncLabel={null} syncState="on" guestProgress="nothing" recheckGuestProgress={async () => 'nothing'}
      account={account} accountChecked={accountChecked} uid={null} nickname={null}
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
});
