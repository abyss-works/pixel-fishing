// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { NO_GUILD_EFFECTS } from '../../../game/rules/guild';
import type { GuildInfo } from '../../../platform/api';

vi.mock('../../account/service/session', () => ({
  useSession: () => ({ ready: true, uid: 'u1' }),
}));
const live = vi.hoisted(() => ({ emit: (_e: { t: 'guild'; kind: string; guild: string; nick: string | null }) => {} }));
vi.mock('../../live/service/useLive', () => ({
  onGuildEvent: (l: typeof live.emit) => { live.emit = l; return () => {}; },
}));

import { useGuildAlerts } from './useGuildAlerts';

afterEach(cleanup);

function makeGuild(over: Partial<GuildInfo> = {}): GuildInfo {
  return {
    id: 'g1',
    name: '테스트길드',
    createdAt: '2026-01-01T00:00:00Z',
    role: 'leader',
    renamedAt: null,
    members: [
      {
        uid: 'u1',
        nick: '선장',
        role: 'leader',
        joinedAt: '2026-01-01T00:00:00Z',
        leftAt: null,
        online: true,
        contribution: { total: 0, today: 0 },
      },
    ],
    code: 'ABCD1234',
    joinMode: 'open',
    pitch: null,
    requests: [],
    growth: { level: 1, total: 0, floor: 0, next: 100 },
    bonuses: [
      { id: 'sell', unlock: 1, rank: 0, enhanceRank: 0, totalRank: 0, cap: 5, pool: 0, next: 100, effect: 0, nextEffect: 0.05, mine: 0 },
    ],
    effects: { ...NO_GUILD_EFFECTS },
    enhanceResetCount: 0,
    donors: [],
    logbook: [],
    ...over,
  };
}

describe('useGuildAlerts — 길드 상태 전환 감지', () => {
  it('길드 레벨 상승, 스킬 단계 상승, 신규 길드원 합류를 알린다', () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const notify = vi.fn();
    const g1 = makeGuild();
    const { rerender } = renderHook(({ guild }) => useGuildAlerts(true, notify, guild), {
      wrapper,
      initialProps: { guild: g1 },
    });
    expect(notify).not.toHaveBeenCalled();

    const g2 = makeGuild({
      growth: { level: 2, total: 120, floor: 100, next: 300 },
      bonuses: [{ id: 'sell', unlock: 1, rank: 1, enhanceRank: 0, totalRank: 1, cap: 5, pool: 100, next: 200, effect: 0.05, nextEffect: 0.1, mine: 100 }],
      members: [
        ...g1.members,
        {
          uid: 'u2',
          nick: '신입',
          role: 'member',
          joinedAt: '2026-01-02T00:00:00Z',
          leftAt: null,
          online: true,
          contribution: { total: 0, today: 0 },
        },
      ],
    });
    rerender({ guild: g2 });

    expect(notify).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenNthCalledWith(1, '길드가 Lv.2로 올랐어요!');
    expect(notify).toHaveBeenNthCalledWith(2, expect.stringContaining('1단계가 됐어요!'));
    expect(notify).toHaveBeenNthCalledWith(3, '신입 님이 길드에 들어왔어요.');
  });
});

describe('useGuildAlerts — 실시간 길드 이벤트', () => {
  function setup() {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const notify = vi.fn();
    renderHook(() => useGuildAlerts(true, notify), { wrapper });
    return { invalidate, notify };
  }

  it('updated는 길드·공개 길드·초대 미리보기를 무효화하고 알림을 띄우지 않는다', () => {
    const { invalidate, notify } = setup();
    live.emit({ t: 'guild', kind: 'updated', guild: '심해', nick: null });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guild', 'u1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['publicGuilds'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guildInvite'] });
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejected는 거절 알림을 띄우고 publicGuilds·guildInvite도 무효화한다', () => {
    const { invalidate, notify } = setup();
    live.emit({ t: 'guild', kind: 'rejected', guild: '심해', nick: null });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guild', 'u1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['publicGuilds'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guildInvite'] });
    expect(notify).toHaveBeenCalledWith('심해 길드 가입 신청이 거절됐어요.', 'warn');
  });

  it('request는 내 길드만 무효화하고 publicGuilds는 건드리지 않는다', () => {
    const { invalidate, notify } = setup();
    live.emit({ t: 'guild', kind: 'request', guild: '심해', nick: '바다거북' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guild', 'u1'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['publicGuilds'] });
    expect(notify).toHaveBeenCalledWith('바다거북 님이 심해 길드에 가입을 신청했어요.');
  });
});
