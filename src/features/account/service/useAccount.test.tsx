// 계정 교체 — 다른 계정으로 로그인하면 그 계정의 서버 상태를 채택하고 이 창을 그 계정의 활성 창으로 등록한다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';

const state = vi.hoisted(() => ({
  sessionUid: 'guest-uid',
  nextUid: 'guest-uid',
  lookups: [] as Array<{ status: 'account'; email: string } | { status: 'guest' } | { status: 'failed' }>,
}));

vi.mock('../../../platform/api', () => ({
  api: {
    auth: {
      isConfigured: true,
      ensureSession: async () => state.sessionUid,
      currentAccount: async () => state.lookups.shift() ?? { status: 'guest' },
      getSession: async () => ({ uid: state.nextUid, email: null }),
      takePasswordResetLanding: () => null,
      accountNudgedDay: () => null,
      markAccountNudged: () => {},
    },
  },
  kstDay: () => '2026-11-04',
}));
vi.mock('../../../platform/observability', () => ({ identifyUser: () => {} }));

import { useAccount } from './useAccount';
import { useSession } from './session';
import { isConfirmedGuest } from './accountActions';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const props = {
    game: newState(),
    setToast: vi.fn(),
    adoptAccount: vi.fn(async () => {}),
    askNewPassword: vi.fn(async () => null),
  };
  const hook = renderHook(() => ({ account: useAccount(props), session: useSession() }), { wrapper });
  return { hook, props };
}

describe('계정 교체', () => {
  beforeEach(() => {
    state.sessionUid = 'guest-uid';
    state.nextUid = 'guest-uid';
    state.lookups = [];
  });
  afterEach(cleanup);

  it('다른 계정으로 로그인하면 그 계정을 채택한다(상태 채택과 활성 창 등록)', async () => {
    const { hook, props } = setup();
    await waitFor(() => expect(hook.result.current.session.ready).toBe(true));
    state.nextUid = 'account-uid';
    await act(() => hook.result.current.account.onAuthChanged());
    expect(props.adoptAccount).toHaveBeenCalledTimes(1);
  });

  it('승격(같은 uid)은 계정을 다시 채택하지 않는다', async () => {
    const { hook, props } = setup();
    await waitFor(() => expect(hook.result.current.session.ready).toBe(true));
    await act(() => hook.result.current.account.onAuthChanged());
    expect(props.adoptAccount).not.toHaveBeenCalled();
  });
});

describe('계정 확인 상태', () => {
  beforeEach(() => {
    state.sessionUid = 'guest-uid';
    state.nextUid = 'guest-uid';
    state.lookups = [];
  });
  afterEach(cleanup);

  const confirmed = (h: ReturnType<typeof setup>['hook']) =>
    isConfirmedGuest(h.result.current.account.account, h.result.current.account.accountChecked);

  it('확인 전에는 게스트로 확정하지 않는다', () => {
    const { hook } = setup();
    expect(confirmed(hook)).toBe(false);
  });

  it('확인 결과가 게스트이면 게스트로 확정한다', async () => {
    state.lookups = [{ status: 'guest' }];
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.account.accountChecked).toBe(true));
    expect(confirmed(hook)).toBe(true);
  });

  it('확인 결과가 계정이면 게스트로 확정하지 않는다', async () => {
    state.lookups = [{ status: 'account', email: 'a@example.com' }];
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.account.accountChecked).toBe(true));
    expect(hook.result.current.account.account).toBe('a@example.com');
    expect(confirmed(hook)).toBe(false);
  });

  it('확인에 실패하면 게스트로 확정하지 않는다', async () => {
    state.lookups = [{ status: 'failed' }];
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.session.ready).toBe(true));
    await act(async () => {});
    expect(hook.result.current.account.accountChecked).toBe(false);
    expect(confirmed(hook)).toBe(false);
  });

  it('확인에 실패한 뒤 다시 확인해 게스트로 밝혀지면 확정한다', async () => {
    state.lookups = [{ status: 'failed' }, { status: 'guest' }];
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.session.ready).toBe(true));
    await act(async () => {});
    await act(() => hook.result.current.account.onAuthChanged());
    expect(confirmed(hook)).toBe(true);
  });
});
