// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_GUILD_EFFECTS } from '../../../game/rules/guild';
import type { GuildInfo, GuildOp, GuildOpResult, GuildState } from '../../../platform/api';

const api = vi.hoisted(() => ({
  readGuild: vi.fn<() => Promise<GuildState>>(),
  guildAction: vi.fn<(op: GuildOp) => Promise<GuildOpResult>>(),
}));

vi.mock('../../../platform/api', () => ({
  liveAvailable: true,
  readGuild: () => api.readGuild(),
  guildAction: (op: GuildOp) => api.guildAction(op),
}));

vi.mock('../../account/service/session', () => ({
  useSession: () => ({ ready: true, uid: 'u1' }),
}));

import { useGuild } from './useGuild';

function makeGuild(over: Partial<GuildInfo> = {}): GuildInfo {
  return {
    id: 'g1',
    name: '심해선단',
    createdAt: '2026-11-05T00:00:00.000Z',
    role: 'member',
    renamedAt: null,
    members: [
      { uid: 'u1', nick: '나루', role: 'member', joinedAt: '2026-11-05T00:00:00.000Z', leftAt: null, online: true, contribution: { total: 0, today: 0 } },
    ],
    code: 'ABCD2345',
    joinMode: 'open',
    pitch: null,
    requests: [],
    growth: { level: 7, total: 350_000, floor: 350_000, next: 550_000 },
    bonuses: [
      { id: 'sell', unlock: 1, rank: 5, enhanceRank: 2, totalRank: 7, cap: 5, pool: 0, next: null, effect: 0.14, nextEffect: 0.16, mine: 0 },
    ],
    effects: { ...NO_GUILD_EFFECTS, sell: 0.14 },
    enhanceResetCount: 0,
    donors: [],
    logbook: [],
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useGuild', () => {
  it('자유 강화 초기화 성공 시 캐시의 enhanceResetCount와 강화 단계가 즉시 갱신되고 서버 상태를 재조회한다', async () => {
    const initial = makeGuild({ enhanceResetCount: 0 });
    const refreshed = makeGuild({
      enhanceResetCount: 1,
      bonuses: [{ id: 'sell', unlock: 1, rank: 5, enhanceRank: 0, totalRank: 5, cap: 5, pool: 0, next: null, effect: 0.1, nextEffect: 0.12, mine: 0 }],
      effects: { ...NO_GUILD_EFFECTS, sell: 0.1 },
    });
    let resolveRefetch!: (v: GuildState) => void;
    api.readGuild
      .mockResolvedValueOnce({ guild: initial, request: null })
      .mockImplementationOnce(() => new Promise<GuildState>(r => { resolveRefetch = r; }));
    api.guildAction.mockResolvedValueOnce({ ok: true, gold: 400_000, recovered: 2, enhanceResetCount: 1 });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGuild(true), { wrapper });

    await waitFor(() => expect(result.current.guild?.enhanceResetCount).toBe(0));

    let pending!: Promise<GuildOpResult>;
    await act(async () => {
      pending = result.current.act({ op: 'resetEnhancements', guildId: 'g1' });
      await Promise.resolve();
    });

    // 재조회 응답이 도착하기 전에도 서버 POST 응답의 enhanceResetCount와 초기화 상태가 캐시에 즉시 반영된다
    await waitFor(() => {
      expect(result.current.guild?.enhanceResetCount).toBe(1);
      expect(result.current.guild?.bonuses[0].enhanceRank).toBe(0);
    });

    resolveRefetch({ guild: refreshed, request: null });
    await act(async () => {
      await pending;
    });
    expect(api.readGuild).toHaveBeenCalledTimes(2);
    expect(result.current.guild?.enhanceResetCount).toBe(1);
  });

  it('refresh 호출 시 readGuild를 다시 조회한다', async () => {
    api.readGuild
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ guild: makeGuild(), request: null });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGuild(true), { wrapper });

    await waitFor(() => expect(result.current.failed).toBe(true));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.guild?.id).toBe('g1'));
    expect(api.readGuild).toHaveBeenCalledTimes(2);
  });
});
