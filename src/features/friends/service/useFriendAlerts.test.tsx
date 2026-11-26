import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../../account/service/session', () => ({
  useSession: () => ({ ready: true, uid: 'u1' }),
}));

const live = vi.hoisted(() => ({ emit: (_e: unknown) => {} }));
vi.mock('../../live/service/useLive', () => ({
  onFriendEvent: (l: typeof live.emit) => { live.emit = l; return () => {}; },
}));

import { useFriendAlerts } from './useFriendAlerts';

afterEach(cleanup);

describe('useFriendAlerts', () => {
  function setup() {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const notify = vi.fn();
    renderHook(() => useFriendAlerts(true, notify), { wrapper });
    return { invalidate, notify };
  }

  it('updated 이벤트는 토스트 없이 friends 쿼리만 무효화한다', () => {
    const { invalidate, notify } = setup();
    live.emit({ t: 'friend', kind: 'updated' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['friends', 'u1'] });
    expect(notify).not.toHaveBeenCalled();
  });

  it('request 이벤트는 friends 쿼리 무효화와 함께 알림을 보낸다', () => {
    const { invalidate, notify } = setup();
    live.emit({ t: 'friend', kind: 'request', uid: 'u2', nick: '갈치' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['friends', 'u1'] });
    expect(notify).toHaveBeenCalledWith('갈치 님이 친구 요청을 보냈어요.');
  });
});
