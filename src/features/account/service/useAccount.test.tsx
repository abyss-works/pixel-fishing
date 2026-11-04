// 계정 교체 — 다른 계정으로 로그인하면 그 계정의 서버 상태를 채택하고 이 창을 그 계정의 활성 창으로 등록한다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';

const state = vi.hoisted(() => ({ sessionUid: 'guest-uid', nextUid: 'guest-uid' }));

vi.mock('../../../platform/api', () => ({
  api: {
    auth: {
      isConfigured: true,
      ensureSession: async () => state.sessionUid,
      currentAccount: async () => null,
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

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const calls: string[] = [];
  const props = {
    game: newState(),
    setGame: vi.fn(() => { calls.push('setGame'); }),
    setToast: vi.fn(),
    load: vi.fn(async () => { calls.push('load'); return newState(); }),
    claimSession: vi.fn(() => { calls.push('claimSession'); }),
  };
  const hook = renderHook(() => ({ account: useAccount(props), session: useSession() }), { wrapper });
  return { hook, props, calls };
}

describe('계정 교체', () => {
  beforeEach(() => {
    state.sessionUid = 'guest-uid';
    state.nextUid = 'guest-uid';
  });
  afterEach(cleanup);

  it('다른 계정으로 로그인하면 그 계정 상태를 채택한 뒤 이 창을 활성 창으로 등록한다', async () => {
    const { hook, calls } = setup();
    await waitFor(() => expect(hook.result.current.session.ready).toBe(true));
    state.nextUid = 'account-uid';
    await act(() => hook.result.current.account.onAuthChanged());
    expect(calls).toEqual(['load', 'setGame', 'claimSession']);
  });

  it('승격(같은 uid)은 상태를 다시 읽지 않고 활성 창 등록도 하지 않는다', async () => {
    const { hook, props } = setup();
    await waitFor(() => expect(hook.result.current.session.ready).toBe(true));
    await act(() => hook.result.current.account.onAuthChanged());
    expect(props.load).not.toHaveBeenCalled();
    expect(props.claimSession).not.toHaveBeenCalled();
  });
});
