import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventsSnapshot } from '../../../platform/api';
import { allowConsentGate, blockConsentGate, resetConsentGate } from '../../account/service/consentGate';
import { sessionKey } from '../../account/service/session';

const apiMock = vi.hoisted(() => ({
  readEvents: vi.fn(),
  isConfigured: true,
}));

vi.mock('../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../platform/api')>();
  return {
    ...mod,
    readEvents: apiMock.readEvents,
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

import { useEvents } from './useEvents';

function makeWrapper(uid: string | null = 'u1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionKey, uid);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useEvents', () => {
  beforeEach(() => {
    apiMock.isConfigured = true;
    apiMock.readEvents.mockReset();
    resetConsentGate();
  });

  afterEach(cleanup);

  it('세션과 약관 게이트가 열리면 이벤트 스냅샷을 불러온다', async () => {
    const snap: EventsSnapshot = {
      now: '2026-12-01T12:00:00.000Z',
      events: [],
      trio: null,
      championship: null,
      draw: null,
    };
    apiMock.readEvents.mockResolvedValue(snap);
    allowConsentGate();

    const { result } = renderHook(() => useEvents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(apiMock.readEvents).toHaveBeenCalledTimes(1);
    expect(result.current.snap).toEqual(snap);
    expect(result.current.offline).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('약관 게이트가 막혀 있거나 disabled면 조회하지 않는다', () => {
    blockConsentGate();
    renderHook(() => useEvents(), { wrapper: makeWrapper() });
    expect(apiMock.readEvents).not.toHaveBeenCalled();
    cleanup();

    allowConsentGate();
    renderHook(() => useEvents({ enabled: false }), { wrapper: makeWrapper() });
    expect(apiMock.readEvents).not.toHaveBeenCalled();
  });

  it('readEvents가 null이면 offline 상태를 표시한다', async () => {
    apiMock.readEvents.mockResolvedValue(null);
    allowConsentGate();

    const { result } = renderHook(() => useEvents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.snap).toBeNull();
    expect(result.current.offline).toBe(true);
    expect(result.current.failed).toBe(false);
  });
});
