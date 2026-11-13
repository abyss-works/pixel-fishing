// 부트스트랩 — 서버는 접속(boot)한 창의 액션만 받으므로, boot 응답 전에는 플레이를 열지 않는다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameAction } from '../../../game/rules/actions';
import { AppError, POLICY, fail } from '../../../core/errors';

const gw = vi.hoisted(() => ({
  bootResolve: null as null | (() => void),
  actions: [] as string[],
  loads: 0,
  loadGold: 0,
  legacy: false,
  cloudEmpty: false,
  importError: null as unknown,
  loadError: null as unknown,
  loadDex: {} as Record<string, unknown>,
}));

vi.mock('../../../platform/api', async () => {
  const { when } = await import('../../../shared/lib/when');
  const { newState: fresh } = await import('../../../game/rules/logic');
  const ok = (action: GameAction) => ({
    status: 'ok' as const, state: fresh(),
    result: action.type === 'boot' ? { type: 'boot', schoolDay: '2026-11-05' } : { type: action.type },
  });
  return {
    when,
    api: {
      auth: { isConfigured: true, ensureSession: async () => 'uid-1' },
      storage: { clearLegacySave: () => { gw.actions.push('clearLegacy'); }, loadLegacy: () => ({ game: fresh(), notice: null, legacy: gw.legacy }), saveCode: () => '' },
      createGameGateway: () => ({
        load: async () => { gw.loads++; if (gw.loadError) throw gw.loadError; return gw.cloudEmpty ? null : { ...fresh(), gold: gw.loadGold, dex: gw.loadDex as ReturnType<typeof fresh>['dex'] }; },
        getNickname: async () => 'nick',
        dispatch: (action: GameAction) => {
          gw.actions.push(action.type);
          if (action.type === 'import' && gw.importError) throw gw.importError;
          if (action.type !== 'boot') return ok(action);
          return new Promise(resolve => { gw.bootResolve = () => resolve(ok(action)); });
        },
      }),
    },
  };
});
vi.mock('../../../platform/observability', () => ({ reportIssue: () => {} }));

import { useGame } from './useGame';
import { clearFailureNotice, currentFailureNotice } from './failureNotice';

function setup(setToast: (m: string, tone?: 'warn') => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useGame({ setToast }), { wrapper });
}

afterEach(() => {
  cleanup(); clearFailureNotice(); gw.bootResolve = null; gw.actions = []; gw.loads = 0; gw.loadGold = 0;
  gw.legacy = false; gw.cloudEmpty = false; gw.importError = null; gw.loadError = null; gw.loadDex = {};
});

describe('부트스트랩', () => {
  it('boot 응답이 오기 전까지 불러오는 중이고 동기화를 켜지 않는다', async () => {
    const hook = setup();
    expect(hook.result.current.loading).toBe(true);
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    expect(hook.result.current.loading).toBe(true);
    expect(hook.result.current.sync).toBe('connecting');
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.sync).toBe('on');
  });

  it('게스트 진행은 불러오는 동안 아직 모르고, 접속이 끝난 뒤 낚은 수로 판정한다', async () => {
    const hook = setup();
    expect(hook.result.current.guestProgress).toBe('reading');
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    expect(hook.result.current.guestProgress).toBe('reading');
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.guestProgress).toBe('nothing');
  });

  it('계정 교체는 그 계정 상태를 읽고 boot 응답까지 불러오는 중이다', async () => {
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    gw.bootResolve = null;
    let adopted: Promise<void> = Promise.resolve();
    act(() => { adopted = hook.result.current.adoptAccount(); });
    expect(hook.result.current.loading).toBe(true);
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    expect(gw.loads).toBe(2);
    expect(hook.result.current.loading).toBe(true);
    await act(async () => { gw.bootResolve!(); await adopted; });
    expect(hook.result.current.loading).toBe(false);
    expect(gw.actions).toEqual(['boot', 'boot']);
  });
});

describe('게스트 진행 판정과 읽기 실패', () => {
  // 안내 창 없이 끝나는 실패 종류(제재, 요청 과다, 오류)도 판정이 끝나야 한다
  it.each(['restricted', 'rate-limited', 'bug'] as const)('저장 읽기가 %s로 끝나도 불러오기는 끝나고 진행이 있는 것으로 판정한다', async kind => {
    gw.loadError = new AppError(kind, 'read failed');
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.blocker).toBeNull();
    expect(hook.result.current.guestProgress).toBe('some');
  });

  it('저장 읽기가 안내 창을 띄우는 실패(network)로 끝나도 진행이 있는 것으로 판정한다', async () => {
    gw.loadError = new AppError('network', 'offline');
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.guestProgress).toBe('some');
  });
});

describe('레거시 로컬 세이브 브리지', () => {
  it('서버가 import를 거부(restricted)해도 세션은 정상 시작하고 로컬 저장은 지우지 않는다', async () => {
    gw.legacy = true; gw.cloudEmpty = true;
    gw.importError = new AppError('restricted', 'forbidden (import-disabled)', { action: 'import' });
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.sync).toBe('on');
    expect(gw.actions).toEqual(['import', 'boot']);
  });

  it('restricted가 아닌 실패는 삼키지 않는다', async () => {
    gw.legacy = true; gw.cloudEmpty = true;
    gw.importError = new AppError('server', 'boom');
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(gw.actions).toEqual(['import']);
  });
});

describe('게스트 진행 다시 읽기', () => {
  async function booted() {
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    return hook;
  }

  it('서버 저장 상태를 다시 읽어 낚은 수가 0이면 진행 없음이다', async () => {
    const hook = await booted();
    const loads = gw.loads;
    await expect(hook.result.current.recheckGuestProgress()).resolves.toBe('nothing');
    expect(gw.loads).toBe(loads + 1);
  });

  it('다시 읽은 상태에 낚은 기록이 있으면 이 탭이 들고 있던 상태가 비어 있어도 진행 있음이다', async () => {
    const hook = await booted();
    gw.loadDex = { carp: { normal: { count: 3, maxSize: 5, first: '2026-01-01' } } };
    await expect(hook.result.current.recheckGuestProgress()).resolves.toBe('some');
  });

  it('서버에 저장 상태가 없으면 진행 없음이다', async () => {
    const hook = await booted();
    gw.cloudEmpty = true;
    await expect(hook.result.current.recheckGuestProgress()).resolves.toBe('nothing');
  });

  it.each(['network', 'replaced', 'rate-limited', 'restricted'] as const)('다시 읽기가 %s로 실패하면 진행 있음이다', async kind => {
    const hook = await booted();
    gw.loadError = new AppError(kind, 'read failed');
    await expect(hook.result.current.recheckGuestProgress()).resolves.toBe('some');
  });
});

describe('다시 읽기', () => {
  it('액션 밖에서 서버가 바꾼 상태(길드 기부의 골드)를 다시 읽어 채택한다. 접속(boot)은 다시 보내지 않는다', async () => {
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    gw.loadGold = 777;
    await act(async () => { await hook.result.current.resync(); });
    expect(hook.result.current.game.gold).toBe(777);
    expect(gw.actions).toEqual(['boot']);
  });
});

describe('실패 안내', () => {
  async function ready() {
    const toasts: [string, string | undefined][] = [];
    const hook = setup((m, tone) => { toasts.push([m, tone]); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    toasts.length = 0;
    return { hook, toasts };
  }

  it.each(['restricted', 'rate-limited', 'bug'] as const)('%s 실패는 정책 문구를 메시지 창에 알리고 오류 자리에도 남긴다', async kind => {
    const { toasts } = await ready();
    const message = POLICY[kind].message;
    act(() => { fail(new AppError(kind, 'x')); });
    expect(toasts).toEqual([[message, 'warn']]);
    expect(currentFailureNotice()).toBe(message);
  });

  it('같은 실패가 연달아 와도 메시지 창에는 한 번만 알린다', async () => {
    const { toasts } = await ready();
    act(() => { fail(new AppError('rate-limited', 'a')); fail(new AppError('rate-limited', 'b')); });
    expect(toasts).toHaveLength(1);
  });

  it('훅이 내려가면 오류 자리의 안내도 지워져 다음 화면이 같은 문구를 새로 알린다', async () => {
    const first = await ready();
    act(() => { fail(new AppError('bug', 'x')); });
    expect(currentFailureNotice()).not.toBeNull();
    first.hook.unmount();
    expect(currentFailureNotice()).toBeNull();
  });

  it('전체 모달로 알리는 실패는 메시지 창에 알리지 않는다', async () => {
    const { toasts } = await ready();
    act(() => { fail(new AppError('server', 'x')); });
    expect(toasts).toEqual([]);
    expect(currentFailureNotice()).toBeNull();
  });
});
