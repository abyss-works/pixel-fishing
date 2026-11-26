import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const readRanking = vi.fn();
vi.mock('../../../platform/api', () => ({
  readRanking: (b: string, f?: string, w?: string) => readRanking(b, f, w),
}));
vi.mock('../../account/service/session', () => ({ useSession: () => ({ ready: true, uid: 'u1' }) }));
vi.mock('../../account/service/consentGate', () => ({ useConsentReady: () => true }));

import { useRanking, useRankingBoard, useSpeciesRanking } from './useRanking';

afterEach(() => { cleanup(); readRanking.mockReset(); });

describe('useRankingBoard & useRanking', () => {
  it('retry 호출 시 랭킹 조회를 다시 실행한다', async () => {
    const payload = { board: 'fame', window: 'weekly', periodSupported: true, resetAt: null, top: [], me: null };
    readRanking
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(payload);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRankingBoard('fame'), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(readRanking).toHaveBeenCalledTimes(2);
    expect(readRanking).toHaveBeenCalledWith('fame', undefined, 'weekly');
  });

  it('window별로 쿼리 키와 readRanking 인자를 분리해 조회하고 비기간 보드는 all로 고정한다', async () => {
    readRanking.mockImplementation((board: string, fishId?: string, window?: string) => Promise.resolve({
      board,
      fishId,
      window,
      periodSupported: board === 'fame' || board === 'namedClears',
      resetAt: null,
      top: [],
      me: null,
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(
      ({ board, window }: { board: 'fame' | 'dex'; window: 'weekly' | 'all' }) => useRankingBoard(board, window),
      { initialProps: { board: 'fame', window: 'weekly' }, wrapper },
    );
    await waitFor(() => expect(result.current.data?.window).toBe('weekly'));
    expect(readRanking).toHaveBeenLastCalledWith('fame', undefined, 'weekly');
    expect(client.getQueryState(['ranking', 'fame', 'weekly', null, 'u1'])?.data).toBeDefined();

    rerender({ board: 'fame', window: 'all' });
    await waitFor(() => expect(result.current.data?.window).toBe('all'));
    expect(readRanking).toHaveBeenLastCalledWith('fame', undefined, 'all');
    expect(client.getQueryState(['ranking', 'fame', 'all', null, 'u1'])?.data).toBeDefined();

    rerender({ board: 'dex', window: 'weekly' });
    await waitFor(() => expect(result.current.data?.board).toBe('dex'));
    expect(readRanking).toHaveBeenLastCalledWith('dex', undefined, 'all');
    expect(client.getQueryState(['ranking', 'dex', 'all', null, 'u1'])?.data).toBeDefined();

    const speciesHook = renderHook(() => useSpeciesRanking('carp'), { wrapper });
    await waitFor(() => expect(speciesHook.result.current.data?.fishId).toBe('carp'));
    expect(readRanking).toHaveBeenLastCalledWith('species', 'carp', 'all');
    expect(client.getQueryState(['ranking', 'species', 'all', 'carp', 'u1'])?.data).toBeDefined();

    const directHook = renderHook(() => useRanking('namedClears', undefined, 'weekly'), { wrapper });
    await waitFor(() => expect(directHook.result.current.data?.board).toBe('namedClears'));
    expect(readRanking).toHaveBeenLastCalledWith('namedClears', undefined, 'weekly');
  });
});
