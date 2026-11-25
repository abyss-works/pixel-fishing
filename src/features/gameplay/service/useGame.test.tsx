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
  loadErrors: [] as unknown[],
  bootErrors: [] as unknown[],
  loadDex: {} as Record<string, unknown>,
  loadAchievements: {} as Record<string, string>,
  dispatchAchievements: {} as Record<string, string>,
  loadFortune: null as null | { day: string; kind: 'fish' | 'gold' | 'shadow'; index: 3 | 5 },
  dispatchFortune: null as null | { day: string; kind: 'fish' | 'gold' | 'shadow'; index: 3 | 5 },
  devTools: false,
  profileReplies: [] as Array<{ ok: true; nickname: string | null; devTools: boolean } | { ok: false }>,
  profileCalls: 0,
  account: { status: 'account', email: 'u@example.com' } as { status: 'account'; email: string } | { status: 'guest' } | { status: 'failed' },
}));

vi.mock('../../../platform/api', async () => {
  const { when } = await import('../../../shared/lib/when');
  const { newState: fresh } = await import('../../../game/rules/logic');
  const ok = (action: GameAction) => ({
    status: 'ok' as const,
    state: { ...fresh(), achievements: gw.dispatchAchievements, fortune: gw.dispatchFortune },
    result: action.type === 'boot' ? { type: 'boot', schoolDay: '2026-11-05' } : { type: action.type },
  });
  return {
    when,
    api: {
      auth: { isConfigured: true, ensureSession: async () => 'uid-1', currentAccount: async () => gw.account },
      storage: { clearLegacySave: () => { gw.actions.push('clearLegacy'); }, loadLegacy: () => ({ game: fresh(), notice: null, legacy: gw.legacy }), saveCode: () => '' },
      createGameGateway: () => ({
        load: async () => { gw.loads++; if (gw.loadErrors.length) throw gw.loadErrors.shift(); if (gw.loadError) throw gw.loadError; return gw.cloudEmpty ? null : { ...fresh(), gold: gw.loadGold, dex: gw.loadDex as ReturnType<typeof fresh>['dex'], achievements: gw.loadAchievements, fortune: gw.loadFortune }; },
        getProfile: async () => {
          gw.profileCalls++;
          return gw.profileReplies.shift() ?? { ok: true as const, nickname: 'nick', devTools: gw.devTools };
        },
        dispatch: (action: GameAction) => {
          gw.actions.push(action.type);
          if (action.type === 'import' && gw.importError) throw gw.importError;
          if (action.type !== 'boot') return ok(action);
          if (gw.bootErrors.length) return Promise.reject(gw.bootErrors.shift());
          return new Promise(resolve => { gw.bootResolve = () => resolve(ok(action)); });
        },
      }),
    },
  };
});
vi.mock('../../../platform/observability', () => ({ reportIssue: () => {} }));

import { useGame } from './useGame';
import { clearFailureNotice, currentFailureNotice } from './failureNotice';
import { readFortuneModal, resetFortuneModalSession } from '../../fortune/service/fortuneModal';

function setup(setToast: (m: string, tone?: 'info' | 'gold' | 'warn') => void = () => {}, reactStrictMode = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useGame({ setToast }), { wrapper, reactStrictMode });
}

afterEach(() => {
  cleanup(); clearFailureNotice(); resetFortuneModalSession(); gw.bootResolve = null; gw.actions = []; gw.loads = 0; gw.loadGold = 0;
  gw.legacy = false; gw.cloudEmpty = false; gw.importError = null; gw.loadError = null; gw.loadErrors = []; gw.bootErrors = []; gw.loadDex = {}; gw.devTools = false;
  gw.profileReplies = []; gw.profileCalls = 0;
  gw.loadAchievements = {}; gw.dispatchAchievements = {}; gw.loadFortune = null; gw.dispatchFortune = null;
  gw.account = { status: 'account', email: 'u@example.com' };
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

describe('개발 도구 판정', () => {
  it('접속이 끝나면 서버가 내려 준 판정을 노출한다', async () => {
    gw.devTools = true;
    const hook = setup();
    expect(hook.result.current.devTools).toBe(false);
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.devTools).toBe(true);
  });

  it('계정을 교체하면 새 계정의 판정으로 바뀐다', async () => {
    gw.devTools = true;
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    gw.bootResolve = null;
    gw.devTools = false;
    let adopted: Promise<void> = Promise.resolve();
    act(() => { adopted = hook.result.current.adoptAccount(); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); await adopted; });
    expect(hook.result.current.devTools).toBe(false);
  });
});

describe('게스트 진행 판정과 읽기 실패', () => {
  // 안내 창 없이 끝나는 실패 종류(제재, 오류)도 판정이 끝나야 한다
  it.each(['restricted', 'bug'] as const)('저장 읽기가 %s로 끝나도 불러오기는 끝나고 진행이 있는 것으로 판정한다', async kind => {
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

describe('새로 받을 수 있게 된 업적 알림', () => {
  async function booted(toasts: [string, string | undefined][]) {
    const hook = setup((m, tone) => { toasts.push([m, tone]); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    toasts.length = 0;
    return hook;
  }

  it('액션 확정으로 새로 claimable이 된 업적은 메시지 창에 금색 톤으로 한 줄 남는다', async () => {
    const toasts: [string, string | undefined][] = [];
    const hook = await booted(toasts);
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable' };
    await act(async () => { await hook.result.current.dispatch({ type: 'debug', command: 'noop' }); });
    expect(toasts).toEqual([['“태평양 연안 기초” 업적을 받을 수 있어요.', 'gold']]);
  });

  it('일반 플레이 중 여러 업적이 한 번에 달성되면 각각 금색 톤으로 알린다', async () => {
    const toasts: [string, string | undefined][] = [];
    const hook = await booted(toasts);
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable', 'spot-full-sea': 'claimable' };
    await act(async () => { await hook.result.current.dispatch({ type: 'catch', spot: 'sea', judgment: 'good' }); });
    expect(toasts).toEqual([
      ['“태평양 연안 기초” 업적을 받을 수 있어요.', 'gold'],
      ['“태평양 연안 숙련” 업적을 받을 수 있어요.', 'gold'],
    ]);
  });

  it('boot 소급 평가로 1건이 새로 claimable이 되면 업적 이름과 함께 금색 톤으로 알린다', async () => {
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable' };
    const toasts: [string, string | undefined][] = [];
    setup((m, tone) => { toasts.push([m, tone]); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(toasts.filter(t => t[0].includes('업적'))).toEqual([
      ['“태평양 연안 기초” 업적을 받을 수 있어요.', 'gold'],
    ]);
  });

  it('boot 소급 평가로 2건 이상이 새로 claimable이 되면 N개 요약 1줄만 금색 톤으로 알린다', async () => {
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable', 'spot-full-sea': 'claimable', 'spot-basic-deep': 'claimable' };
    const toasts: [string, string | undefined][] = [];
    setup((m, tone) => { toasts.push([m, tone]); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(toasts.filter(t => t[0].includes('업적'))).toEqual([
      ['3개 업적을 받을 수 있어요.', 'gold'],
    ]);
  });

  it('레거시 세이브 import에서 2건 이상이 새로 claimable이 되면 N개 요약 1줄만 금색 톤으로 알린다', async () => {
    gw.legacy = true;
    gw.cloudEmpty = true;
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable', 'spot-full-sea': 'claimable', 'spot-basic-deep': 'claimable' };
    const toasts: [string, string | undefined][] = [];
    setup((m, tone) => { toasts.push([m, tone]); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(gw.actions).toEqual(['import', 'clearLegacy', 'boot']);
    expect(toasts.filter(t => t[0].includes('업적'))).toEqual([
      ['3개 업적을 받을 수 있어요.', 'gold'],
    ]);
  });

  it('게스트 상태에서는 boot와 일반 액션 모두 새로 받을 수 있는 업적 토스트를 띄우지 않는다', async () => {
    gw.account = { status: 'guest' };
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable' };
    const toasts: [string, string | undefined][] = [];
    const hook = setup((m, tone) => { toasts.push([m, tone]); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(toasts.filter(t => t[0].includes('업적'))).toEqual([]);

    toasts.length = 0;
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable', 'spot-full-sea': 'claimable' };
    await act(async () => { await hook.result.current.dispatch({ type: 'catch', spot: 'sea', judgment: 'good' }); });
    expect(toasts).toEqual([]);
  });

  it('첫 로드 시 이미 claimable인 업적은 알리지 않는다', async () => {
    gw.loadAchievements = { 'spot-basic-sea': 'claimable' };
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable' };
    const toasts: [string, string | undefined][] = [];
    setup((m, tone) => { toasts.push([m, tone]); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(toasts.map(t => t[0])).not.toContain('“태평양 연안 기초” 업적을 받을 수 있어요.');
  });

  it('확정이 연달아 와도 같은 업적을 한 번만 알린다', async () => {
    const toasts: [string, string | undefined][] = [];
    const hook = await booted(toasts);
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable' };
    await act(async () => {
      void hook.result.current.dispatch({ type: 'debug', command: 'noop' });
      void hook.result.current.dispatch({ type: 'debug', command: 'noop' });
    });
    expect(toasts).toHaveLength(1);
  });

  it('계정을 교체하면 그 계정이 이미 받을 수 있던 업적은 알리지 않는다', async () => {
    const toasts: [string, string | undefined][] = [];
    const hook = await booted(toasts);
    gw.bootResolve = null;
    gw.loadAchievements = { 'spot-basic-sea': 'claimable' };
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable' };
    let adopted: Promise<void> = Promise.resolve();
    act(() => { adopted = hook.result.current.adoptAccount(); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); await adopted; });
    expect(toasts).toEqual([]);
  });

  it('이미 claimable이던 업적과 받은 업적은 다시 알리지 않는다', async () => {
    const toasts: [string, string | undefined][] = [];
    const hook = await booted(toasts);
    gw.dispatchAchievements = { 'spot-basic-sea': 'claimable' };
    await act(async () => { await hook.result.current.dispatch({ type: 'debug', command: 'noop' }); });
    toasts.length = 0;
    await act(async () => { await hook.result.current.dispatch({ type: 'debug', command: 'noop' }); });
    expect(toasts).toEqual([]);
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

describe('요청 속도 초과(429) 재시도', () => {
  const limited = () => new AppError('rate-limited', 'limited', { status: 429 });
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  afterEach(() => { vi.useRealTimers(); });

  it('부팅 세이브 읽기가 429 한 번 뒤 성공하면 재시도로 정상 로드한다', async () => {
    vi.useFakeTimers();
    gw.loadErrors = [limited()]; gw.loadGold = 77;
    const hook = setup();
    await tick(0);
    expect(gw.loads).toBe(1);
    expect(hook.result.current.loading).toBe(true);
    await tick(1000);
    expect(gw.loads).toBe(2);
    expect(hook.result.current.game.gold).toBe(77);
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.blocker).toBeNull();
  });

  it('부팅 세이브 읽기가 계속 429면 1초 2초 4초 뒤 저장 실패 안내 창을 띄우고 기본 상태로 열지 않는다', async () => {
    vi.useFakeTimers();
    gw.loadErrors = [limited(), limited(), limited(), limited()];
    const hook = setup();
    await tick(0);
    await tick(1000); await tick(2000);
    expect(hook.result.current.loading).toBe(true);
    expect(hook.result.current.blocker).toBeNull();
    await tick(4000);
    expect(gw.loads).toBe(4);
    expect(hook.result.current.blocker).toBe('unsaved');
    expect(gw.actions).not.toContain('boot');
    expect(hook.result.current.sync).toBe('error');
  });

  it('계정 교체의 세이브 읽기가 계속 429면 저장 실패 안내 창을 띄운다', async () => {
    vi.useFakeTimers();
    const hook = setup();
    await tick(0);
    await act(async () => { gw.bootResolve!(); });
    gw.bootResolve = null;
    gw.loadErrors = [limited(), limited(), limited(), limited()];
    let result: unknown;
    act(() => { void hook.result.current.adoptAccount().catch(e => { result = e; }); });
    await tick(7000);
    expect(result).toBeInstanceOf(AppError);
    expect(hook.result.current.blocker).toBe('unsaved');
    expect(hook.result.current.loading).toBe(false);
  });

  it('계정 교체의 세이브 읽기가 429 한 번 뒤 성공하면 이어서 접속한다', async () => {
    vi.useFakeTimers();
    const hook = setup();
    await tick(0);
    await act(async () => { gw.bootResolve!(); });
    gw.bootResolve = null;
    gw.loadErrors = [limited()];
    act(() => { void hook.result.current.adoptAccount(); });
    await tick(1000);
    expect(gw.bootResolve).not.toBeNull();
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.blocker).toBeNull();
  });

  it('boot 액션이 429 한 번 뒤 성공하면 다시 보낸다', async () => {
    vi.useFakeTimers();
    gw.bootErrors = [limited()];
    const hook = setup();
    await tick(0);
    expect(gw.actions).toEqual(['boot']);
    await tick(1000);
    expect(gw.actions).toEqual(['boot', 'boot']);
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.blocker).toBeNull();
  });

  it('boot 액션이 계속 429면 저장 실패 안내 창을 띄운다', async () => {
    vi.useFakeTimers();
    gw.bootErrors = [limited(), limited(), limited(), limited()];
    const hook = setup();
    await tick(0); await tick(1000); await tick(2000); await tick(4000);
    expect(gw.actions).toEqual(['boot', 'boot', 'boot', 'boot']);
    expect(hook.result.current.blocker).toBe('unsaved');
  });

  it('boot 액션의 429가 아닌 실패는 지금처럼 조용히 삼킨다', async () => {
    gw.bootErrors = [new AppError('network', 'offline')];
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.blocker).toBeNull();
    expect(gw.actions).toEqual(['boot']);
  });

  it('boot 완료 전이나 boot 무음 실패 시에도 초기 load와 resync의 파생 claimable 업적이 유지되고 recheckGuestProgress를 왜곡하지 않는다', async () => {
    gw.loadAchievements = { 'spot-basic-sea': 'claimable' };
    gw.bootErrors = [new AppError('network', 'offline')];
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.game.achievements).toEqual({ 'spot-basic-sea': 'claimable' });
    await expect(hook.result.current.recheckGuestProgress()).resolves.toBe('nothing');

    gw.loadAchievements = { 'spot-basic-sea': 'claimable', 'spot-basic-deep': 'claimable' };
    await act(async () => { await hook.result.current.resync(); });
    expect(hook.result.current.game.achievements).toEqual({
      'spot-basic-sea': 'claimable',
      'spot-basic-deep': 'claimable',
    });
  });

  it('언마운트하면 대기 중인 재시도가 남지 않는다', async () => {
    vi.useFakeTimers();
    gw.loadErrors = [limited()];
    const hook = setup();
    await tick(0);
    hook.unmount();
    await tick(10_000);
    expect(gw.loads).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('계정을 다시 교체하면 앞선 대기 중인 재시도는 버려진다', async () => {
    vi.useFakeTimers();
    const hook = setup();
    await tick(0);
    await act(async () => { gw.bootResolve!(); });
    gw.bootResolve = null;
    gw.loadErrors = [limited()];
    act(() => { void hook.result.current.adoptAccount(); });
    await tick(0);
    expect(gw.loads).toBe(2);
    act(() => { void hook.result.current.adoptAccount(); });
    await tick(0);
    expect(gw.loads).toBe(3);
    await tick(10_000);
    expect(gw.loads).toBe(3);
  });

  it('중단된 부팅은 로딩을 풀지 않는다. 개발 빌드처럼 effect가 두 번 돌아도 boot 응답 전에는 불러오는 중이다', async () => {
    const hook = setup(() => {}, true);
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.loading).toBe(true);
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.blocker).toBeNull();
  });
});

describe('오늘의 운세 접속 모달 큐잉', () => {
  it('boot 응답이 새 게임 날짜의 운세를 고정하면 접속 모달을 큐에 넣는다', async () => {
    const today = { day: '2026-11-24', kind: 'fish' as const, index: 5 as const };
    gw.loadFortune = { day: '2026-11-23', kind: 'gold', index: 3 };
    gw.dispatchFortune = today;
    setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: today, pending: true });
  });

  it('같은 날 재접속(load와 boot의 운세 날짜가 같음)이면 모달을 큐에 넣지 않는다', async () => {
    const today = { day: '2026-11-24', kind: 'fish' as const, index: 5 as const };
    gw.loadFortune = today;
    gw.dispatchFortune = today;
    setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: null, pending: false });
  });

  it('catch 등 boot가 아닌 액션에서 운세가 채워져도 접속 모달을 큐에 넣지 않는다', async () => {
    const today = { day: '2026-11-24', kind: 'gold' as const, index: 5 as const };
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });

    gw.dispatchFortune = today;
    await act(async () => { await hook.result.current.dispatch({ type: 'sell', uids: [] }); });
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: null, pending: false });
  });
});

describe('프로필 상태와 부트스트랩 닉네임 동기화', () => {
  it('첫 세션 부트스트랩 전 getProfile의 nickname이 null이면 boot 완료 후 getProfile을 1회 재조회해 반영한다', async () => {
    gw.account = { status: 'guest' };
    gw.profileReplies = [
      { ok: true, nickname: null, devTools: false },
      { ok: true, nickname: '행복한_고래', devTools: false },
    ];
    const hook = setup();
    expect(hook.result.current.profileStatus).toBe('loading');
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    expect(hook.result.current.profileStatus).toBe('loading');

    await act(async () => { gw.bootResolve!(); });
    expect(gw.profileCalls).toBe(2);
    expect(hook.result.current.profileStatus).toBe('loaded');
    expect(hook.result.current.nickname).toBe('행복한_고래');
  });

  it('프로필 조회가 ok: false이면 profileStatus가 error이고 devTools는 닫힌다', async () => {
    gw.devTools = true;
    gw.profileReplies = [{ ok: true, nickname: '관리자', devTools: true }];
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.devTools).toBe(true);
    expect(hook.result.current.profileStatus).toBe('loaded');

    gw.bootResolve = null;
    gw.profileReplies = [{ ok: false }];
    let adopted: Promise<void> = Promise.resolve();
    act(() => { adopted = hook.result.current.adoptAccount(); });
    expect(hook.result.current.profileStatus).toBe('loading');
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); await adopted; });
    expect(hook.result.current.profileStatus).toBe('error');
    expect(hook.result.current.nickname).toBeNull();
    expect(hook.result.current.devTools).toBe(false);
  });

  it('adoptAccount에서도 boot 전 nickname이 null이면 boot 뒤 1회 재조회한다', async () => {
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });

    gw.bootResolve = null;
    gw.profileCalls = 0;
    gw.profileReplies = [
      { ok: true, nickname: null, devTools: false },
      { ok: true, nickname: '새_게스트', devTools: false },
    ];
    let adopted: Promise<void> = Promise.resolve();
    act(() => { adopted = hook.result.current.adoptAccount(); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); await adopted; });
    expect(gw.profileCalls).toBe(2);
    expect(hook.result.current.profileStatus).toBe('loaded');
    expect(hook.result.current.nickname).toBe('새_게스트');
  });
});
