import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const readRanking = vi.fn();
vi.mock('../../../platform/api', () => ({
  readRanking: (b: string, f?: string, w?: string, week?: string) => readRanking(b, f, w, week),
}));
vi.mock('../../account/service/session', () => ({ useSession: () => ({ ready: true, uid: 'u1' }) }));
vi.mock('../../account/service/consentGate', () => ({ useConsentReady: () => true }));

import { useRanking, useRankingBoard, useSpeciesRanking } from './useRanking';

afterEach(() => { cleanup(); readRanking.mockReset(); });

describe('useRankingBoard & useRanking', () => {
  it('retry 호출 시 랭킹 조회를 다시 실행한다', async () => {
    const payload = {
      board: 'fame', window: 'weekly', periodSupported: true, resetAt: null,
      weekStart: '2026-11-23', availableWeeks: ['2026-11-23'], top: [], me: null,
    };
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
    expect(readRanking).toHaveBeenCalledWith('fame', undefined, 'weekly', undefined);
  });

  it('window·week별로 쿼리 키와 readRanking 인자를 분리해 조회하고 비기간 보드는 all로 고정한다', async () => {
    readRanking.mockImplementation((board: string, fishId?: string, window?: string, week?: string) => Promise.resolve({
      board,
      fishId,
      window,
      periodSupported: board === 'fame' || board === 'sellGold' || board === 'namedClears',
      resetAt: null,
      weekStart: window === 'weekly' ? (week ?? '2026-11-23') : null,
      availableWeeks: window === 'weekly' ? ['2026-11-23', '2026-11-16'] : [],
      top: [],
      me: null,
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(
      ({ board, window, week }: { board: 'fame' | 'dex' | 'sellGold'; window: 'weekly' | 'all'; week?: string }) =>
        useRankingBoard(board, window, week),
      { initialProps: { board: 'fame', window: 'weekly' }, wrapper },
    );
    await waitFor(() => expect(result.current.data?.window).toBe('weekly'));
    expect(readRanking).toHaveBeenLastCalledWith('fame', undefined, 'weekly', undefined);
    expect(client.getQueryState(['ranking', 'fame', 'weekly', null, null, 'u1'])?.data).toBeDefined();

    rerender({ board: 'fame', window: 'weekly', week: '2026-11-16' });
    await waitFor(() => expect(result.current.data?.weekStart).toBe('2026-11-16'));
    expect(readRanking).toHaveBeenLastCalledWith('fame', undefined, 'weekly', '2026-11-16');
    expect(client.getQueryState(['ranking', 'fame', 'weekly', '2026-11-16', null, 'u1'])?.data).toBeDefined();

    rerender({ board: 'fame', window: 'all' });
    await waitFor(() => expect(result.current.data?.window).toBe('all'));
    expect(readRanking).toHaveBeenLastCalledWith('fame', undefined, 'all', undefined);
    expect(client.getQueryState(['ranking', 'fame', 'all', null, null, 'u1'])?.data).toBeDefined();

    rerender({ board: 'dex', window: 'weekly' });
    await waitFor(() => expect(result.current.data?.board).toBe('dex'));
    expect(readRanking).toHaveBeenLastCalledWith('dex', undefined, 'all', undefined);
    expect(client.getQueryState(['ranking', 'dex', 'all', null, null, 'u1'])?.data).toBeDefined();

    const speciesHook = renderHook(() => useSpeciesRanking('carp'), { wrapper });
    await waitFor(() => expect(speciesHook.result.current.data?.fishId).toBe('carp'));
    expect(readRanking).toHaveBeenLastCalledWith('species', 'carp', 'all', undefined);
    expect(client.getQueryState(['ranking', 'species', 'all', null, 'carp', 'u1'])?.data).toBeDefined();

    const directHook = renderHook(() => useRanking('namedClears', undefined, 'weekly'), { wrapper });
    await waitFor(() => expect(directHook.result.current.data?.board).toBe('namedClears'));
    expect(readRanking).toHaveBeenLastCalledWith('namedClears', undefined, 'weekly', undefined);
  });
});
