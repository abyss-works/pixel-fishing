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

import { useLive } from './useLive';
import { useLiveNickSync } from './useLiveNickSync';

afterEach(() => {
  cleanup();
  liveMock.connections = [];
});

describe('useLiveNickSync', () => {
  it('nick 이벤트 수신 시 피어 상세(player)와 랭킹·길드·친구·차단·검색 캐시를 즉시 무효화한다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(['player', 'u2'], { nickname: '옛닉' });
    client.setQueryData(['player', 'u3'], { nickname: '다른피어' });
    client.setQueryData(['ranking', 'fame', null, 'u1'], { board: 'fame', top: [], me: null });
    client.setQueryData(['guild', 'u1'], { guild: null, request: null });
    client.setQueryData(['friends', 'u1'], []);
    client.setQueryData(['chat-blocks', 'u1'], { blocks: [] });
    client.setQueryData(['player-search', '옛'], []);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => {
      useLive();
      useLiveNickSync();
    }, { wrapper });

    act(() => {
      liveMock.connections[0].onMessage({ t: 'nick', uid: 'u2', nick: '새닉' });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['player', 'u2'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['ranking'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['guild'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['friends'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['chat-blocks'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['player-search'] });
    expect(client.getQueryState(['player', 'u2'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['player', 'u3'])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['chat-blocks', 'u1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['player-search', '옛'])?.isInvalidated).toBe(true);
  });
});
