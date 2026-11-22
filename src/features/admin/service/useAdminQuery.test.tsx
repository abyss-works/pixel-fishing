// useAdminRefresh 훅 — 현재 열린 탭의 활성 관리자 데이터 조회만 재조회하고 마지막 조회 시각을 추적하는지 확인한다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminKeys } from './queryKeys';
import { useAdminQuery, useAdminRefresh } from './useAdminQuery';

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useAdminRefresh', () => {
  afterEach(cleanup);

  it('현재 관찰 중인 관리자 데이터 조회만 재조회하고 마지막 조회 시각을 갱신한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let count = 0;
    const readActive = vi.fn(async () => ++count);
    const readAccess = vi.fn(async () => ({ kind: 'granted' }));

    const { result } = renderHook(() => {
      useAdminQuery(adminKeys.access, readAccess, true);
      const q = useAdminQuery(adminKeys.users, readActive, true);
      const refresh = useAdminRefresh(true);
      return { q, refresh };
    }, { wrapper: wrapperWith(client) });

    await waitFor(() => expect(result.current.q.data).toBe(1));
    expect(result.current.refresh.lastUpdatedAt).toBeGreaterThan(0);
    expect(readAccess).toHaveBeenCalledTimes(1);

    act(() => result.current.refresh.refresh());
    await waitFor(() => expect(result.current.q.data).toBe(2));
    // access 조회는 재조회 대상에서 빠진다
    expect(readAccess).toHaveBeenCalledTimes(1);
    expect(readActive).toHaveBeenCalledTimes(2);
  });
});
