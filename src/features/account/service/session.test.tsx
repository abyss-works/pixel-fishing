// 세션 게이트 — 세션 확보는 한 번만 직렬로, 서버 조회는 그 뒤에 나간다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  configured: true,
  resolveSession: null as ((uid: string | null) => void) | null,
  ensureCalls: 0,
  bountyCalls: 0,
}));

vi.mock('../../../platform/api', () => ({
  api: {
    auth: {
      get isConfigured() { return state.configured; },
      ensureSession: () => {
        state.ensureCalls++;
        return new Promise<string | null>(r => { state.resolveSession = r; });
      },
    },
  },
  readBounty: async () => { state.bountyCalls++; return null; },
  gameDay: () => '2026-10-17',
}));

import { fetchSession, setSessionUid, toGate, useSession } from './session';
import { useBounty } from '../../bounty/service/useBounty';

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
};

describe('세션 게이트 판정', () => {
  it('확보 전에는 준비되지 않았다', () => {
    expect(toGate(undefined, true)).toEqual({ ready: false, uid: null });
  });
  it('uid가 서면 준비된다', () => {
    expect(toGate('u1', true)).toEqual({ ready: true, uid: 'u1' });
  });
  it('클라우드에서 확보에 실패(null)하면 준비되지 않는다', () => {
    expect(toGate(null, true)).toEqual({ ready: false, uid: null });
  });
  it('클라우드 미설정은 세션 없이 준비된다', () => {
    expect(toGate(null, false)).toEqual({ ready: true, uid: null });
  });
});

describe('세션 게이트 흐름', () => {
  beforeEach(() => {
    state.configured = true;
    state.resolveSession = null;
    state.ensureCalls = 0;
    state.bountyCalls = 0;
  });
  afterEach(cleanup);

  it('부트스트랩과 조회가 동시에 기다려도 세션 확보는 한 번만 실행된다', async () => {
    const { client, wrapper } = setup();
    const boot = fetchSession(client);
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.ready).toBe(false);
    act(() => state.resolveSession!('u1'));
    await expect(boot).resolves.toBe('u1');
    await waitFor(() => expect(result.current).toEqual({ ready: true, uid: 'u1' }));
    expect(state.ensureCalls).toBe(1);
  });

  it('수배 조회는 세션이 선 뒤에만 나간다', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useBounty(), { wrapper });
    await Promise.resolve();
    expect(state.bountyCalls).toBe(0);
    expect(result.current.loaded).toBe(false);
    act(() => state.resolveSession!('u1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(state.bountyCalls).toBe(1);
  });

  it('계정이 바뀌면 새 uid로 수배 조회를 다시 읽는다', async () => {
    const { client, wrapper } = setup();
    renderHook(() => useBounty(), { wrapper });
    act(() => state.resolveSession!('u1'));
    await waitFor(() => expect(state.bountyCalls).toBe(1));
    act(() => setSessionUid(client, 'u2'));
    await waitFor(() => expect(state.bountyCalls).toBe(2));
  });
});
