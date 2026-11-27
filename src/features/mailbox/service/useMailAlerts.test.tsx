import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '../../../game/rules/live';

const liveMock = vi.hoisted(() => ({
  session: { ready: true, uid: 'u1' as string | null },
  connections: [] as Array<{ close: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; onMessage: (m: ServerMessage) => void }>,
}));

vi.mock('../../../platform/api', () => ({
  liveAvailable: true,
  openLive: (onMessage: (m: ServerMessage) => void) => {
    const conn = { close: vi.fn(), send: vi.fn(), onMessage };
    liveMock.connections.push(conn);
    return conn;
  },
}));
vi.mock('../../account/service/session', () => ({ useSession: () => liveMock.session }));

import { useLive } from '../../live/service/useLive';
import { useMailAlerts } from './useMailAlerts';

afterEach(() => {
  cleanup();
  liveMock.connections = [];
});

describe('useMailAlerts', () => {
  it('mail 실시간 메시지 수신 시 mailbox 쿼리를 즉시 무효화한다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(['mailbox', 'u1'], []);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => {
      useLive();
      useMailAlerts();
    }, { wrapper });

    act(() => {
      liveMock.connections[0].onMessage({ t: 'mail' });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['mailbox', 'u1'] });
    expect(client.getQueryState(['mailbox', 'u1'])?.isInvalidated).toBe(true);
  });
});
