import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../core/errors';

const readMails = vi.fn();
vi.mock('../../../platform/api', () => ({
  readMails: () => readMails(),
  markMailRead: vi.fn(),
}));
vi.mock('../../account/service/session', () => ({ useSession: () => ({ ready: true, uid: 'u1' }) }));
vi.mock('../../account/service/consentGate', () => ({ useConsentReady: () => true }));

import { useMailbox } from './useMailbox';

const makeWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.useFakeTimers();
  readMails.mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useMailbox 폴링·재시도', () => {
  it('세션 만료(401) 오류가 나면 5분 폴링을 멈추고 일시 오류에서는 폴링을 이어 간다', async () => {
    readMails.mockRejectedValue(new AppError('unauthorized', 'mail read 401'));
    renderHook(() => useMailbox(), { wrapper: makeWrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(11 * 60_000); });
    expect(readMails).toHaveBeenCalledTimes(1);

    cleanup();
    readMails.mockReset();
    readMails.mockRejectedValue(new AppError('network', 'mail read 503', { status: 503 }));
    renderHook(() => useMailbox(), { wrapper: makeWrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000 + 100); });
    expect(readMails).toHaveBeenCalledTimes(3);
  });

  it('refresh 호출 시 우편 목록을 다시 읽는다', async () => {
    readMails.mockResolvedValue([]);
    const { result } = renderHook(() => useMailbox(), { wrapper: makeWrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(readMails).toHaveBeenCalledTimes(1);

    act(() => { result.current.refresh(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(readMails).toHaveBeenCalledTimes(2);
  });
});
