import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FortuneHistory } from '../../../platform/api';
import { sessionKey } from '../../account/service/session';

const apiMock = vi.hoisted(() => ({
  readFortuneHistory: vi.fn(),
  isConfigured: true,
}));

vi.mock('../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../platform/api')>();
  return {
    ...mod,
    readFortuneHistory: apiMock.readFortuneHistory,
    api: {
      ...mod.api,
      auth: {
        ...mod.api.auth,
        get isConfigured() { return apiMock.isConfigured; },
        ensureSession: vi.fn(async () => 'u1'),
      },
    },
  };
});

import { useFortuneHistory } from './useFortuneHistory';

function makeWrapper(uid: string | null = 'u1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionKey, uid);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useFortuneHistory', () => {
  beforeEach(() => {
    apiMock.isConfigured = true;
    apiMock.readFortuneHistory.mockReset();
  });

  it('활성화되면 지정 월의 운세 이력을 불러온다', async () => {
    const payload: FortuneHistory = {
      month: '2026-11',
      firstMonth: '2026-10',
      currentDay: '2026-11-25',
      today: { day: '2026-11-25', kind: 'fish', index: 5 },
      days: [{ day: '2026-11-25', kind: 'fish', index: 5 }],
    };
    apiMock.readFortuneHistory.mockResolvedValue(payload);

    const { result } = renderHook(() => useFortuneHistory(null, true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiMock.readFortuneHistory).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toEqual(payload);
    expect(result.current.failed).toBe(false);
    expect(result.current.offline).toBe(false);
  });

  it('비활성 상태에서는 요청하지 않고 loading이 거짓이다', () => {
    const { result } = renderHook(() => useFortuneHistory('2026-11', false), { wrapper: makeWrapper() });
    expect(apiMock.readFortuneHistory).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('로컬 모드(null 반환)는 오프라인으로 구분한다', async () => {
    apiMock.isConfigured = false;
    apiMock.readFortuneHistory.mockResolvedValue(null);
    const { result } = renderHook(() => useFortuneHistory('2026-11', true), { wrapper: makeWrapper(null) });
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.failed).toBe(false);
  });

  it('요청 실패 시 failed를 켜고 retry로 다시 불러온다', async () => {
    apiMock.readFortuneHistory
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        month: '2026-10',
        firstMonth: '2026-10',
        currentDay: '2026-11-25',
        today: null,
        days: [],
      });

    const { result } = renderHook(() => useFortuneHistory('2026-10', true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 3000 });
    expect(apiMock.readFortuneHistory).toHaveBeenCalledWith('2026-10');

    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(result.current.data?.month).toBe('2026-10');
  });
});
