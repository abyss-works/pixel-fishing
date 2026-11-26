import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppError } from '../../../core/errors';

const readFriends = vi.fn();
const friendAction = vi.fn();
vi.mock('../../../platform/api', () => ({ readFriends: () => readFriends(), friendAction: (op: unknown) => friendAction(op) }));
vi.mock('../../account/service/session', () => ({ useSession: () => ({ ready: true, uid: 'u1' }) }));
vi.mock('../../account/service/consentGate', () => ({ useConsentReady: () => true }));

import { useFriends } from './useFriends';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const settle = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  readFriends.mockReset();
  readFriends.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useFriends 동작', () => {
  it('요청이 성공하면 닉네임 검색 쿼리도 무효화하고, 실패하면 건드리지 않는다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const shared = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useFriends(true), { wrapper: shared });
    friendAction.mockResolvedValueOnce({ ok: false, error: 'x' });
    await act(async () => { await result.current.act({ op: 'request', nickname: 'a' }); });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['player-search'] });
    friendAction.mockResolvedValueOnce({ ok: true, result: 'requested' });
    await act(async () => { await result.current.act({ op: 'request', nickname: 'a' }); });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['player-search'] });
  });
});

describe('useFriends 폴링', () => {
  it('poll을 주지 않으면 30초가 지나도 다시 읽지 않는다', async () => {
    renderHook(() => useFriends(true), { wrapper });
    await settle(95_000);
    expect(readFriends).toHaveBeenCalledTimes(1);
  });

  it('poll이 참이면 30초마다 다시 읽는다', async () => {
    renderHook(() => useFriends(true, true), { wrapper });
    await settle(61_000);
    expect(readFriends).toHaveBeenCalledTimes(3);
  });

  it('세션 만료(401) 오류가 나면 폴링을 멈춘다', async () => {
    readFriends.mockRejectedValue(new AppError('unauthorized', 'friends read before session'));
    renderHook(() => useFriends(true, true), { wrapper });
    await settle(125_000);
    expect(readFriends).toHaveBeenCalledTimes(1);
  });

  it('401이 아닌 일시 오류에서는 폴링을 이어 간다', async () => {
    readFriends.mockRejectedValue(new AppError('network', 'friends read failed', { status: 503 }));
    renderHook(() => useFriends(true, true), { wrapper });
    await settle(61_000);
    expect(readFriends).toHaveBeenCalledTimes(3);
  });
});
