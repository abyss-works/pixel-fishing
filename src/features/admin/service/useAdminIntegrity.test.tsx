// useAdminIntegrity 훅 — 무결성 현황·이력·지표 조회와 오탐 해제 시 관련 캐시 무효화를 확인한다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminIntegrity } from './useAdminIntegrity';

const mocks = vi.hoisted(() => ({
  readStages: vi.fn(),
  readEvents: vi.fn(),
  readMetrics: vi.fn(),
  releaseStage: vi.fn(),
}));

vi.mock('./queries', () => ({
  readAdminIntegrityStages: mocks.readStages,
  readAdminIntegrityEvents: mocks.readEvents,
  readAdminIntegrityMetrics: mocks.readMetrics,
  releaseAdminIntegrityStage: mocks.releaseStage,
}));

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useAdminIntegrity', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('granted일 때 현황·이력·지표를 읽고 releaseStage 호출 시 세 캐시를 무효화한다', async () => {
    let stageCalls = 0;
    mocks.readStages.mockImplementation(async () => [{ stage: 1, count: ++stageCalls, accounts: [] }]);
    mocks.readEvents.mockResolvedValue([]);
    mocks.readMetrics.mockResolvedValue({
      days: 7,
      totalEvents: 0,
      stageTransitions: [],
      byStage: [],
      rarityDistribution: [],
    });
    mocks.releaseStage.mockResolvedValue({ ok: true });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAdminIntegrity(true), { wrapper: wrapperWith(client) });

    await waitFor(() => expect(result.current.stages.data?.[0]?.count).toBe(1));
    expect(mocks.readStages).toHaveBeenCalledTimes(1);
    expect(mocks.readEvents).toHaveBeenCalledWith(undefined, 50);
    expect(mocks.readMetrics).toHaveBeenCalledWith(7);

    await act(async () => {
      await result.current.releaseStage('u-1');
    });

    expect(mocks.releaseStage).toHaveBeenCalledWith('u-1');
    await waitFor(() => expect(result.current.stages.data?.[0]?.count).toBe(2));
    expect(mocks.readEvents).toHaveBeenCalledTimes(2);
    expect(mocks.readMetrics).toHaveBeenCalledTimes(2);
  });

  it('granted가 false이면 조회하지 않는다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useAdminIntegrity(false), { wrapper: wrapperWith(client) });

    expect(mocks.readStages).not.toHaveBeenCalled();
    expect(mocks.readEvents).not.toHaveBeenCalled();
    expect(mocks.readMetrics).not.toHaveBeenCalled();
  });
});
