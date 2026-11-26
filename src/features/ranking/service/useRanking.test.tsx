import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const readRanking = vi.fn();
vi.mock('../../../platform/api', () => ({ readRanking: (b: string, f?: string) => readRanking(b, f) }));
vi.mock('../../account/service/session', () => ({ useSession: () => ({ ready: true, uid: 'u1' }) }));
vi.mock('../../account/service/consentGate', () => ({ useConsentReady: () => true }));

import { useRankingBoard } from './useRanking';

afterEach(() => { cleanup(); readRanking.mockReset(); });

describe('useRankingBoard', () => {
  it('retry 호출 시 랭킹 조회를 다시 실행한다', async () => {
    readRanking
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ board: 'fame', top: [], me: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRankingBoard('fame'), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.data).toEqual({ board: 'fame', top: [], me: null }));
    expect(readRanking).toHaveBeenCalledTimes(2);
  });
});
