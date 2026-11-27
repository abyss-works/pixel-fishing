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

    // 짧은 쿨다운 안의 연타 새로고침은 중복 발사하지 않는다
    act(() => result.current.refresh.refresh());
    expect(readActive).toHaveBeenCalledTimes(2);
  });

  it('동일한 adminKeys.users를 쓰는 두 훅이 마운트돼도 staleTime 동안 중복 요청을 보내지 않는다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const readUsers = vi.fn(async () => ['u1']);
    const wrapper = wrapperWith(client);

    const first = renderHook(() => useAdminQuery(adminKeys.users, readUsers, true), { wrapper });
    await waitFor(() => expect(first.result.current.data).toEqual(['u1']));
    expect(readUsers).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useAdminQuery(adminKeys.users, readUsers, true), { wrapper });
    expect(second.result.current.data).toEqual(['u1']);
    expect(readUsers).toHaveBeenCalledTimes(1);
  });

  it('활성 데이터 조회가 없어도 오류 없이 새로고침을 마친다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAdminRefresh(true), { wrapper: wrapperWith(client) });

    expect(result.current.lastUpdatedAt).toBe(0);
    expect(result.current.refreshing).toBe(false);
    act(() => result.current.refresh());
    expect(result.current.refreshing).toBe(false);
    expect(result.current.lastUpdatedAt).toBe(0);
  });

  it('개요 조회 키는 기간별로 나뉜다', () => {
    expect(adminKeys.overview(7)).not.toEqual(adminKeys.overview(30));
  });
});
