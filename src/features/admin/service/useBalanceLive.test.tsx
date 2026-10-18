// 밸런스 라이브 지표 조회 훅. 관리자 판정이 granted일 때만 서버에 조회하고, 기간이 캐시 키에 들어가 기간마다 따로 읽는다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthCtx } from './accessContext';
import type { AdminAccess } from './accessContext';
import { adminKeys } from './queryKeys';

const balanceLive = vi.hoisted(() => vi.fn());
vi.mock('../../../platform/api', () => ({ api: { admin: { balanceLive } } }));

import { BALANCE_LIVE_DAYS, useBalanceLive } from './useBalanceLive';

const live = (marker: number) => ({
  judgment: [], spots: [], dexBuckets: [], boats: [{ boat: 0, users: marker }], rodBuckets: [],
  gold: { p25: null, p50: null, p75: null, p90: null, max: null },
  goldFlow: { sellGold: 0, couponGold: 0, rodCost: 0, boatCost: 0, baitCost: 0 },
  dau: [], churn: [],
  bountyFunnel: { namedAccepts: 0, tickets: 0, duelsWon: 0, duelsLost: 0, generalAccepts: 0, delivered: 0 },
  anomalies: { fastGaps: 0, fastUsers: 0, perfectPct: null }, fameGateStuck: [],
});

const setup = (access: AdminAccess) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AdminAuthCtx.Provider value={{ access, uid: 'u-1' }}>{children}</AdminAuthCtx.Provider>
    </QueryClientProvider>
  );
  return { client, wrapper };
};

describe('useBalanceLive', () => {
  beforeEach(() => {
    balanceLive.mockReset();
    balanceLive.mockImplementation(async (days?: number) => live(days ?? 0));
  });
  afterEach(cleanup);

  it('기간을 생략하면 기본 기간으로 조회하고 결과를 돌려준다', async () => {
    const { wrapper } = setup('granted');
    const { result } = renderHook(() => useBalanceLive(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(live(BALANCE_LIVE_DAYS)));
    expect(balanceLive).toHaveBeenCalledTimes(1);
    expect(balanceLive).toHaveBeenCalledWith(BALANCE_LIVE_DAYS);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('granted가 아니면 서버를 부르지 않고 데이터는 null이다', async () => {
    for (const access of ['checking', 'denied', 'local'] as const) {
      const { wrapper } = setup(access);
      const { result, unmount } = renderHook(() => useBalanceLive(3), { wrapper });
      await Promise.resolve();
      expect(result.current.data, access).toBeNull();
      unmount();
    }
    expect(balanceLive).not.toHaveBeenCalled();
  });

  it('기간을 바꾸면 그 기간으로 다시 조회하고, 이미 읽은 기간은 캐시에서 준다', async () => {
    const { wrapper } = setup('granted');
    const { result, rerender } = renderHook(({ days }) => useBalanceLive(days), { wrapper, initialProps: { days: 3 } });
    await waitFor(() => expect(result.current.data).toEqual(live(3)));
    rerender({ days: 7 });
    await waitFor(() => expect(result.current.data).toEqual(live(7)));
    expect(balanceLive.mock.calls).toEqual([[3], [7]]);
    rerender({ days: 3 });
    expect(result.current.data).toEqual(live(3));
  });

  it('캐시 키에 기간이 들어간다', () => {
    expect(adminKeys.balanceLive(3)).toEqual(['admin', 'balanceLive', 3]);
    expect(adminKeys.balanceLive(3)).not.toEqual(adminKeys.balanceLive(7));
  });

  it('조회가 실패하면 오류 문구를 돌려주고 데이터는 null이다', async () => {
    balanceLive.mockRejectedValue(new Error('balanceLive 조회 실패: 403 forbidden'));
    const { wrapper } = setup('granted');
    const { result } = renderHook(() => useBalanceLive(), { wrapper });
    await waitFor(() => expect(result.current.error).toBe('balanceLive 조회 실패: 403 forbidden'));
    expect(result.current.data).toBeNull();
  });

  it('refresh는 같은 기간을 다시 조회한다', async () => {
    const { wrapper } = setup('granted');
    const { result } = renderHook(() => useBalanceLive(3), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => result.current.refresh());
    await waitFor(() => expect(balanceLive).toHaveBeenCalledTimes(2));
    expect(balanceLive).toHaveBeenLastCalledWith(3);
  });
});
