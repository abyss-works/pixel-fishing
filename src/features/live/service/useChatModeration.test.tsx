import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../core/errors';
import { queryRetryDelayMs, shouldRetryQuery } from '../../../core/retryPolicy';

const readBlocks = vi.fn();
vi.mock('../../../platform/api', () => ({
  readBlocks: () => readBlocks(),
  changeBlock: vi.fn(),
  reportChat: vi.fn(),
}));
vi.mock('../../account/service/session', () => ({ useSession: () => ({ ready: true, uid: 'u1' }) }));
vi.mock('../../account/service/consentGate', () => ({ useConsentReady: () => true }));
vi.mock('./useLive', () => ({ hideAuthor: vi.fn() }));

import { useChatModeration } from './useChatModeration';

afterEach(() => { cleanup(); readBlocks.mockReset(); });

describe('useChatModeration', () => {
  it('readBlocks가 던진 AppError를 감싸지 않고 원본 오류로 전파해 QueryProvider 5xx/429 재시도 정책이 동작한다', async () => {
    const err500 = new AppError('server', 'blocks 500', { status: 500 });
    readBlocks.mockRejectedValueOnce(err500).mockResolvedValueOnce({ blocks: [] });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: () => 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useChatModeration(true), { wrapper });

    await waitFor(() => expect(result.current.blocks).toEqual([]));
    expect(readBlocks).toHaveBeenCalledTimes(2);
    expect(queryRetryDelayMs(0, new AppError('rate-limited', '429', { status: 429, retryAfterMs: 1500 }))).toBe(1500);
  });
});
