import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: { ready: true, uid: 'me' as string | null },
  readPlayer: vi.fn(),
}));

vi.mock('../../../platform/api', () => ({ readPlayer: (uid: string) => state.readPlayer(uid) }));
vi.mock('../../account/service/session', () => ({ useSession: () => state.session }));
vi.mock('../../account/service/consentGate', () => ({ useConsentReady: () => true }));

import { usePlayerProfile } from './usePlayerProfile';

const makeWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  state.session = { ready: true, uid: 'me' };
  state.readPlayer.mockReset();
});
afterEach(cleanup);

describe('usePlayerProfile', () => {
  it('세션이 준비됐지만 me가 null이면 영구 로딩에 빠지지 않고 unavailable을 참으로 분리한다', () => {
    state.session = { ready: true, uid: null };
    const { result } = renderHook(() => usePlayerProfile('u1'), { wrapper: makeWrapper() });
    expect(result.current.loading).toBe(false);
    expect(result.current.unavailable).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(state.readPlayer).not.toHaveBeenCalled();
  });

  it('retry 호출 시 프로필을 다시 조회한다', async () => {
    state.readPlayer.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ nickname: '갈치' });
    const { result } = renderHook(() => usePlayerProfile('u1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.profile).toEqual({ nickname: '갈치' }));
    expect(state.readPlayer).toHaveBeenCalledTimes(2);
  });
});
