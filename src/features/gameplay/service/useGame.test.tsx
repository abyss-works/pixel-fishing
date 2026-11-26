// 부트스트랩 — 서버는 접속(boot)한 창의 액션만 받으므로, boot 응답 전에는 플레이를 열지 않는다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameAction } from '../../../game/rules/actions';
import { AppError, POLICY, fail } from '../../../core/errors';
import { newState } from '../../../game/rules/logic';

const gw = vi.hoisted(() => ({
  bootResolve: null as null | (() => void),
  sessionReply: 'uid-1' as string | null,
  sessionError: null as unknown,
  actions: [] as string[],
  loads: 0,
  loadGold: 0,
  legacy: false,
  legacyFame: 0,
  cloudEmpty: false,
  importError: null as unknown,
  loadError: null as unknown,
  loadErrors: [] as unknown[],
  bootErrors: [] as unknown[],
  loadDex: {} as Record<string, unknown>,
  dispatchDex: {} as Record<string, unknown>,
  loadAchievements: {} as Record<string, string>,
  dispatchAchievements: {} as Record<string, string>,
  loadFortune: null as null | { day: string; kind: 'fish' | 'gold' | 'shadow'; index: 3 | 5 },
  dispatchFortune: null as null | { day: string; kind: 'fish' | 'gold' | 'shadow'; index: 3 | 5 },
  loadLocation: null as null | { kind: 'region' | 'base'; id: string },
  visited: [] as ('village' | 'world' | 'championship')[],
  loadFame: 0,
  dispatchResult: null as null | Record<string, unknown>,
  dispatchReject: null as null | string,
  devTools: false,
  profileReplies: [] as Array<{ ok: true; nickname: string | null; devTools: boolean } | { ok: false }>,
  profileCalls: 0,
  account: { status: 'account', email: 'u@example.com' } as { status: 'account'; email: string } | { status: 'guest' } | { status: 'failed' },
  consentQueue: [] as Array<{ required: boolean; version: string; effectiveAt: string }>,
  consentCalls: 0,
  acceptCalls: [] as string[],
  acceptQueue: [] as Array<{ ok: true; consent: { required: boolean; version: string; effectiveAt: string } } | { ok: false; code: string }>,
  consentListeners: new Set<() => void>(),
}));

vi.mock('../../../platform/api', async () => {
  const { when } = await import('../../../shared/lib/when');
  const { newState: fresh, travel } = await import('../../../game/rules/logic');
  const { AppError: Err } = await import('../../../core/errors');
  const ok = (action: GameAction) => {
    if (action.type === 'travel') {
      gw.visited = travel({ ...fresh(), visited: gw.visited }, action.to).visited;
    }
    return {
      status: 'ok' as const,
      state: { ...fresh(), dex: gw.dispatchDex as ReturnType<typeof fresh>['dex'], achievements: gw.dispatchAchievements, fortune: gw.dispatchFortune, visited: gw.visited },
      result: action.type === 'boot' ? { type: 'boot', schoolDay: '2026-11-05' } : (gw.dispatchResult ?? { type: action.type }),
    };
  };
  return {
    when,
    isConsentRequiredError: (e: unknown) =>
      e instanceof Err && (e.kind === 'consent-required' || e.context.code === 'consent-required'),
    subscribeConsentRequired: (fn: () => void) => {
      gw.consentListeners.add(fn);
      return () => { gw.consentListeners.delete(fn); };
    },
    api: {
      auth: {
        isConfigured: true,
        ensureSession: async () => {
          if (gw.sessionError) throw gw.sessionError;
          return gw.sessionReply;
        },
        currentAccount: async () => gw.account,
        getAccountConsent: async () => {
          gw.consentCalls++;
          return gw.consentQueue.shift() ?? { required: false, version: '2026-11-25', effectiveAt: '2026-11-25T00:00:00.000Z' };
        },
        acceptConsent: async (version: string) => {
          gw.acceptCalls.push(version);
          return gw.acceptQueue.shift() ?? { ok: true as const, consent: { required: false, version, effectiveAt: '2026-11-25T00:00:00.000Z' } };
        },
      },
      storage: { clearLegacySave: () => { gw.actions.push('clearLegacy'); }, loadLegacy: () => ({ game: { ...fresh(), fame: gw.legacyFame }, notice: null, legacy: gw.legacy }), saveCode: () => '' },
      createGameGateway: () => ({
        load: async () => { gw.loads++; if (gw.loadErrors.length) throw gw.loadErrors.shift(); if (gw.loadError) throw gw.loadError; return gw.cloudEmpty ? null : { ...fresh(), ...(gw.loadLocation ? { location: gw.loadLocation as ReturnType<typeof fresh>['location'] } : {}), gold: gw.loadGold, fame: gw.loadFame, dex: gw.loadDex as ReturnType<typeof fresh>['dex'], achievements: gw.loadAchievements, fortune: gw.loadFortune, visited: gw.visited }; },
        getProfile: async () => {
          gw.profileCalls++;
          return gw.profileReplies.shift() ?? { ok: true as const, nickname: 'nick', devTools: gw.devTools };
        },
        dispatch: (action: GameAction) => {
          gw.actions.push(action.type);
          if (action.type === 'import' && gw.importError) throw gw.importError;
          if (action.type !== 'boot') {
            if (gw.dispatchReject) return { status: 'rejected' as const, error: gw.dispatchReject };
            return ok(action);
          }
          if (gw.bootErrors.length) return Promise.reject(gw.bootErrors.shift());
          return new Promise(resolve => { gw.bootResolve = () => resolve(ok(action)); });
        },
      }),
    },
  };
});
vi.mock('../../../platform/observability', () => ({ reportIssue: () => {} }));

import { useGame } from './useGame';
import { getConsentGate, resetConsentGate } from '../../account/service/consentGate';
import { clearFailureNotice, currentFailureNotice } from './failureNotice';
import { readFortuneModal, resetFortuneModalSession } from '../../fortune/service/fortuneModal';
import { registerNoticeSink } from '../../display/model/toastPolicy';
import type { NoticeSink, SystemNoticeInput } from '../../display/model/toastPolicy';
import * as liveService from '../../live/service/useLive';
import * as soundEvents from '../../sound/service/soundEvents';
import { eventsKey } from '../../events/service/useEvents';

function setupWithClient(setToast: (m: string, tone?: 'info' | 'gold' | 'warn') => void = () => {}, reactStrictMode = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, hook: renderHook(() => useGame({ setToast }), { wrapper, reactStrictMode }) };
}

function setup(setToast: (m: string, tone?: 'info' | 'gold' | 'warn') => void = () => {}, reactStrictMode = false) {
  return setupWithClient(setToast, reactStrictMode).hook;
}

afterEach(() => {
  cleanup(); clearFailureNotice(); resetFortuneModalSession(); resetConsentGate();
  gw.bootResolve = null; gw.sessionReply = 'uid-1'; gw.sessionError = null; gw.actions = []; gw.loads = 0; gw.loadGold = 0;
  gw.legacy = false; gw.legacyFame = 0; gw.cloudEmpty = false; gw.importError = null; gw.loadError = null; gw.loadErrors = []; gw.bootErrors = []; gw.loadDex = {}; gw.dispatchDex = {}; gw.devTools = false;
  gw.profileReplies = []; gw.profileCalls = 0;
  gw.loadAchievements = {}; gw.dispatchAchievements = {}; gw.loadFortune = null; gw.dispatchFortune = null; gw.loadLocation = null;
  gw.visited = []; gw.loadFame = 0; gw.dispatchResult = null; gw.dispatchReject = null;
  vi.restoreAllMocks();
  gw.account = { status: 'account', email: 'u@example.com' };
  gw.consentQueue = []; gw.consentCalls = 0; gw.acceptCalls = []; gw.acceptQueue = []; gw.consentListeners.clear();
});

describe('부트스트랩', () => {
  it('boot 응답이 오기 전까지 불러오는 중이고 동기화를 켜지 않는다', async () => {
    const hook = setup();
    expect(hook.result.current.loading).toBe(true);
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    expect(hook.result.current.loading).toBe(true);
    expect(hook.result.current.sync).toBe('connecting');
    expect(hook.result.current.syncLabel).toBe('클라우드 연결 중…');
    await act(async () => { gw.bootResolve!(); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.sync).toBe('on');
    expect(hook.result.current.syncLabel).toBe('클라우드 저장 켜짐');
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
    let adopted: Promise<unknown> = Promise.resolve();
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
    let adopted: Promise<unknown> = Promise.resolve();
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
    let adopted: Promise<unknown> = Promise.resolve();
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
    expect(hook.result.current.syncLabel).toBe('클라우드에 연결하지 못했어요. 지금은 진행이 저장되지 않아요.');
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

  it('boot 액션의 429·consent 외 실패(network·5xx·401·423·426)는 삼키지 않고 전파하며 sync를 on으로 열지 않는다', async () => {
    const cases = [
      { err: new AppError('network', 'offline'), blocker: 'unsaved' },
      { err: new AppError('server', 'boom', { status: 500 }), blocker: 'unsaved' },
      { err: new AppError('unauthorized', 'expired', { status: 401 }), blocker: 'unsaved' },
      { err: new AppError('replaced', 'another tab', { status: 423 }), blocker: 'replaced' },
      { err: new AppError('outdated', 'old build', { status: 426 }), blocker: 'update' },
    ] as const;

    for (const c of cases) {
      gw.bootErrors = [c.err];
      gw.actions = [];
      const hook = setup();
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      expect(hook.result.current.blocker).toBe(c.blocker);
      expect(hook.result.current.sync).not.toBe('on');
      expect(gw.actions).toEqual(['boot']);
      cleanup();
    }
  });

  it('boot 완료 전이나 boot 실패 시에도 초기 load와 resync의 파생 claimable 업적이 유지된다', async () => {
    gw.loadAchievements = { 'spot-basic-sea': 'claimable' };
    gw.bootErrors = [new AppError('network', 'offline')];
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.game.achievements).toEqual({ 'spot-basic-sea': 'claimable' });

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

  it('신규 첫 진입(운세·명성·도감 이력 없음)이면 마을 튜토리얼과 겹치지 않게 접속 모달을 건너뛴다', async () => {
    gw.dispatchFortune = { day: '2026-11-24', kind: 'fish', index: 5 };
    setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: null, pending: false });
  });

  it('운세가 없어도 명성이나 도감 이력이 있는 플레이어는 접속 모달을 큐에 넣는다', async () => {
    const today = { day: '2026-11-24', kind: 'fish' as const, index: 5 as const };
    gw.dispatchFortune = today;
    gw.loadFame = 10;
    setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: today, pending: true });
    cleanup(); resetFortuneModalSession();
    gw.bootResolve = null; gw.loadFame = 0;
    gw.loadDex = { carp: { normal: { count: 1, maxSize: 10, first: null } } };
    setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(readFortuneModal({ ready: true, suspended: false })).toEqual({ fortune: today, pending: true });
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

describe('수배 스냅샷 무효화', () => {
  async function bootedWithSpy() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useGame({ setToast: () => {} }), { wrapper });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    spy.mockClear();
    return { hook, spy };
  }
  const catchResult = (extra: Record<string, unknown>) => ({ type: 'catch', ...extra });
  const doCatch = (hook: Awaited<ReturnType<typeof bootedWithSpy>>['hook']) =>
    act(async () => { await hook.result.current.dispatch({ type: 'catch', spot: 'pond', judgment: 'good' }); });

  it('의뢰 진행도가 오른 catch는 수배 스냅샷을 즉시 무효화한다', async () => {
    const { hook, spy } = await bootedWithSpy();
    gw.dispatchResult = catchResult({ bountyProgressed: true });
    await doCatch(hook);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['bounty'] });
  });

  it('티켓이 발급된 catch도 수배 스냅샷을 무효화한다', async () => {
    const { hook, spy } = await bootedWithSpy();
    gw.dispatchResult = catchResult({ ticket: 't1' });
    await doCatch(hook);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['bounty'] });
  });

  it('티켓도 의뢰 진행도도 없는 catch와 무관한 액션은 수배 스냅샷을 건드리지 않는다', async () => {
    const { hook, spy } = await bootedWithSpy();
    gw.dispatchResult = catchResult({});
    await doCatch(hook);
    await act(async () => { await hook.result.current.dispatch({ type: 'sell', uids: [] }); });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['bounty'] });
  });

  it('debug와 debugBatch는 수배·운세·랭킹을 함께 무효화한다(랭킹은 재조회 없이)', async () => {
    const { hook, spy } = await bootedWithSpy();
    const actions: GameAction[] = [
      { type: 'debug', command: 'x' },
      { type: 'debugBatch', steps: [] },
    ];
    for (const action of actions) {
      spy.mockClear();
      await act(async () => { await hook.result.current.dispatch(action); });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['bounty'] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['fortune'] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['ranking'], refetchType: 'none' });
    }
  });

  it('catch·resolveChallenge·claimRelief는 랭킹을 재조회 없이 무효화하고 다른 액션은 건드리지 않는다', async () => {
    const { hook, spy } = await bootedWithSpy();
    const ranking = { queryKey: ['ranking'], refetchType: 'none' };
    await doCatch(hook);
    expect(spy).toHaveBeenCalledWith(ranking);
    spy.mockClear();
    await act(async () => { await hook.result.current.dispatch({ type: 'resolveChallenge', questId: 'q', success: true, hits: 1, misses: 0 }); });
    expect(spy).toHaveBeenCalledWith(ranking);
    spy.mockClear();
    await act(async () => { await hook.result.current.dispatch({ type: 'claimRelief', code: 'c' }); });
    expect(spy).toHaveBeenCalledWith(ranking);
    spy.mockClear();
    await act(async () => { await hook.result.current.dispatch({ type: 'import', save: newState() }); });
    expect(spy).toHaveBeenCalledWith(ranking);
    spy.mockClear();
    await act(async () => { await hook.result.current.dispatch({ type: 'sell', uids: [] }); });
    expect(spy).not.toHaveBeenCalledWith(ranking);
  });

  it('운세가 바뀐 상태 전환은 운세 쿼리를 무효화한다', async () => {
    const { hook, spy } = await bootedWithSpy();
    gw.dispatchFortune = { day: '2026-11-26', kind: 'fish', index: 3 };
    await act(async () => { await hook.result.current.dispatch({ type: 'sell', uids: [] }); });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['fortune'] });
    spy.mockClear();
    await act(async () => { await hook.result.current.dispatch({ type: 'sell', uids: [] }); });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['fortune'] });
  });

  it('길드 갱신 표시가 있는 결과는 길드 쿼리를 무효화한다', async () => {
    const { hook, spy } = await bootedWithSpy();
    gw.dispatchResult = catchResult({ guildUpdated: true });
    await doCatch(hook);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['guild'] });
    spy.mockClear();
    gw.dispatchResult = catchResult({});
    await doCatch(hook);
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['guild'] });
  });

  it('applyDevReset과 refreshAccountStatus는 세션 쿼리를 제외하고 무효화한다', async () => {
    const { hook, spy } = await bootedWithSpy();
    await act(async () => { await hook.result.current.applyDevReset(newState()); });
    await act(async () => { await hook.result.current.refreshAccountStatus(); });
    const calls = spy.mock.calls.map(c => c[0] as { predicate?: (q: { queryKey: unknown[] }) => boolean });
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.predicate?.({ queryKey: ['session'] })).toBe(false);
      expect(c.predicate?.({ queryKey: ['guild', 'uid-1'] })).toBe(true);
    }
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
    let adopted: Promise<unknown> = Promise.resolve();
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
    let adopted: Promise<unknown> = Promise.resolve();
    act(() => { adopted = hook.result.current.adoptAccount(); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); await adopted; });
    expect(gw.profileCalls).toBe(2);
    expect(hook.result.current.profileStatus).toBe('loaded');
    expect(hook.result.current.nickname).toBe('새_게스트');
  });
});

describe('최초 지역 진입 알림', () => {
  it('마을(village) 첫 진입 시에는 알림을 띄우지 않고, 대양(world) 첫 출항 시에만 1회 안내하며 visited 기록은 모두 유지한다', async () => {
    const notices: SystemNoticeInput[] = [];
    const sink: NoticeSink = registerNoticeSink(vi.fn(), input => { notices.push(input); });
    const hook = setup(sink);
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    notices.length = 0;

    await act(async () => { await hook.result.current.dispatch({ type: 'travel', to: { kind: 'region', id: 'village' } }); });
    expect(hook.result.current.game.visited).toEqual(['village']);
    expect(notices.filter(n => n.kind === 'travel.firstVisit')).toEqual([]);

    await act(async () => { await hook.result.current.dispatch({ type: 'travel', to: { kind: 'region', id: 'world' } }); });
    expect(hook.result.current.game.visited).toEqual(['village', 'world']);
    expect(notices.filter(n => n.kind === 'travel.firstVisit')).toEqual([{
      kind: 'travel.firstVisit',
      text: '대양으로 처음 출항했어요! 태평양 연안에서 바다 낚시를 시작해 보세요.',
      toastText: '대양 첫 출항!',
    }]);

    notices.length = 0;
    await act(async () => { await hook.result.current.dispatch({ type: 'travel', to: { kind: 'base', id: 'harbor' } }); });
    await act(async () => { await hook.result.current.dispatch({ type: 'travel', to: { kind: 'region', id: 'world' } }); });
    expect(hook.result.current.game.visited).toEqual(['village', 'world']);
    expect(notices.filter(n => n.kind === 'travel.firstVisit')).toEqual([]);
  });
});

describe('해역 일반 도감 완성 축하 알림', () => {
  it('게스트가 해역 일반 폼 어종을 100% 완성하면 업적 알림은 띄우지 않고 도감 완성 골드 알림만 띄운다', async () => {
    const { FISH } = await import('../../../game/rules/logic');
    const pondSpecies = FISH.filter(f => f.spot === 'pond');
    const almost = Object.fromEntries(pondSpecies.slice(0, -1).map(f => [f.id, { normal: { count: 1, maxSize: 10, first: null } }]));
    const complete = Object.fromEntries(pondSpecies.map(f => [f.id, { normal: { count: 1, maxSize: 10, first: null } }]));

    gw.account = { status: 'guest' };
    gw.loadDex = almost;
    const notices: SystemNoticeInput[] = [];
    const sink: NoticeSink = registerNoticeSink(vi.fn(), input => { notices.push(input); });
    const hook = setup(sink);
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    gw.dispatchDex = almost;
    await act(async () => { gw.bootResolve!(); });
    notices.length = 0;

    // 마지막 종을 일반 폼으로 완성(동시에 업적이 열려도 게스트는 업적 알림 제외)
    gw.dispatchDex = complete;
    gw.dispatchAchievements = { 'spot-village-pond': 'claimable' };
    await act(async () => { await hook.result.current.dispatch({ type: 'catch', spot: 'pond', judgment: 'good' }); });
    expect(notices.filter(n => n.kind === 'dex.spotCompleted')).toEqual([{
      kind: 'dex.spotCompleted',
      text: '마을 연못 일반 어종 도감을 완성했어요!',
      toastText: '마을 연못 도감 완성!',
    }]);
    expect(notices.filter(n => n.kind === 'achievement.unlockable')).toEqual([]);

    // 이미 완성된 뒤 추가 포획에는 중복 알림을 내지 않는다
    notices.length = 0;
    await act(async () => { await hook.result.current.dispatch({ type: 'catch', spot: 'pond', judgment: 'good' }); });
    expect(notices.filter(n => n.kind === 'dex.spotCompleted')).toEqual([]);
  });

  it('계정 사용자도 해역 일반 폼 도감 완성 시 도감 완성 알림을 받고, 돌연변이만 추가될 때는 받지 않는다', async () => {
    const { FISH } = await import('../../../game/rules/logic');
    const pondSpecies = FISH.filter(f => f.spot === 'pond');
    const almost = Object.fromEntries(pondSpecies.slice(0, -1).map(f => [f.id, { normal: { count: 1, maxSize: 10, first: null } }]));
    const lastFish = pondSpecies[pondSpecies.length - 1];
    const variantOnly = { ...almost, [lastFish.id]: { variant: { count: 1, maxSize: 10, first: null } } };
    const complete = Object.fromEntries(pondSpecies.map(f => [f.id, { normal: { count: 1, maxSize: 10, first: null } }]));

    gw.account = { status: 'account', email: 'u@example.com' };
    gw.loadDex = almost;
    const notices: SystemNoticeInput[] = [];
    const sink: NoticeSink = registerNoticeSink(vi.fn(), input => { notices.push(input); });
    const hook = setup(sink);
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    gw.dispatchDex = almost;
    await act(async () => { gw.bootResolve!(); });
    notices.length = 0;

    // 마지막 종의 돌연변이만 잡힌 경우 일반 도감 미완성
    gw.dispatchDex = variantOnly;
    await act(async () => { await hook.result.current.dispatch({ type: 'catch', spot: 'pond', judgment: 'good' }); });
    expect(notices.filter(n => n.kind === 'dex.spotCompleted')).toEqual([]);

    // 일반 폼으로 완성
    gw.dispatchDex = complete;
    await act(async () => { await hook.result.current.dispatch({ type: 'catch', spot: 'pond', judgment: 'good' }); });
    expect(notices.filter(n => n.kind === 'dex.spotCompleted')).toHaveLength(1);
  });
});

describe('이용약관 수락 게이트', () => {
  it('부팅 시 약관 확인이 필요하면 loadSave·getProfile·boot와 실시간 채널을 멈추고 consent 모달을 띄우며, 동의 시 정상 부팅으로 이어간다', async () => {
    gw.consentQueue = [{ required: true, version: '2026-11-25', effectiveAt: '2026-11-25T00:00:00.000Z' }];
    const hook = setup();
    await waitFor(() => expect(hook.result.current.blocker).toBe('consent'));
    expect(gw.loads).toBe(0);
    expect(gw.profileCalls).toBe(0);
    expect(gw.actions).toEqual([]);
    expect(getConsentGate()).toBe('blocked');
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.sync).toBe('connecting');
    expect(hook.result.current.consentPrompt.consent?.version).toBe('2026-11-25');

    await act(async () => { await hook.result.current.acceptConsent(); });
    expect(gw.acceptCalls).toEqual(['2026-11-25']);
    expect(hook.result.current.blocker).toBeNull();
    expect(getConsentGate()).toBe('ready');
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(gw.loads).toBe(1);
    expect(gw.profileCalls).toBe(1);
    expect(gw.actions).toEqual(['boot']);
    expect(hook.result.current.sync).toBe('on');
  });

  it('acceptConsent에서 consent-version-mismatch(409)가 오면 새 판을 다시 조회해 재확인 안내를 띄운다', async () => {
    gw.consentQueue = [
      { required: true, version: '2026-11-25', effectiveAt: '2026-11-25T00:00:00.000Z' },
      { required: true, version: '2026-12-01', effectiveAt: '2026-12-01T00:00:00.000Z' },
    ];
    gw.acceptQueue = [{ ok: false, code: 'consent-version-mismatch' }];
    const hook = setup();
    await waitFor(() => expect(hook.result.current.blocker).toBe('consent'));

    await act(async () => { await hook.result.current.acceptConsent(); });
    expect(gw.acceptCalls).toEqual(['2026-11-25']);
    expect(hook.result.current.blocker).toBe('consent');
    expect(hook.result.current.consentPrompt.mismatch).toBe(true);
    expect(hook.result.current.consentPrompt.consent?.version).toBe('2026-12-01');

    await act(async () => { await hook.result.current.acceptConsent(); });
    expect(gw.acceptCalls).toEqual(['2026-11-25', '2026-12-01']);
    expect(hook.result.current.blocker).toBeNull();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
  });

  it('실행 중 consent-required 오류(403)나 실시간 차단 신호(WS 1008)를 받으면 즉시 약관 창을 열고, 동의 후 부팅 재실행 없이 복귀한다', async () => {
    const toasts: [string, string | undefined][] = [];
    const hook = setup((m, tone) => { toasts.push([m, tone]); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    toasts.length = 0;

    gw.consentQueue = [{ required: true, version: '2026-11-25', effectiveAt: '2026-11-25T00:00:00.000Z' }];
    act(() => {
      fail(new AppError('restricted', 'forbidden (consent-required)', { code: 'consent-required' }));
    });
    expect(hook.result.current.blocker).toBe('consent');
    expect(getConsentGate()).toBe('blocked');
    expect(toasts).toEqual([]);
    expect(currentFailureNotice()).toBeNull();
    await waitFor(() => expect(hook.result.current.consentPrompt.consent?.version).toBe('2026-11-25'));

    await act(async () => { await hook.result.current.acceptConsent(); });
    expect(hook.result.current.blocker).toBeNull();
    expect(getConsentGate()).toBe('ready');
    expect(gw.actions).toEqual(['boot']);

    // WS 1008 신호로도 즉시 차단된다
    gw.consentQueue = [{ required: true, version: '2026-11-25', effectiveAt: '2026-11-25T00:00:00.000Z' }];
    act(() => { for (const fn of gw.consentListeners) fn(); });
    expect(hook.result.current.blocker).toBe('consent');
    expect(getConsentGate()).toBe('blocked');
  });

  it('계정 교체(adoptAccount) 시 새 계정이 약관 미수락이면 loadSave·boot 전에 차단하고 false를 돌려준다', async () => {
    const hook = setup();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    gw.bootResolve = null;

    gw.consentQueue = [{ required: true, version: '2026-11-25', effectiveAt: '2026-11-25T00:00:00.000Z' }];
    let adopted = true;
    await act(async () => { adopted = await hook.result.current.adoptAccount(); });
    expect(adopted).toBe(false);
    expect(hook.result.current.blocker).toBe('consent');
    expect(gw.loads).toBe(1);
    expect(gw.actions).toEqual(['boot']);

    await act(async () => { await hook.result.current.acceptConsent(); });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(gw.loads).toBe(2);
    expect(gw.actions).toEqual(['boot', 'boot']);
  });
});

describe('닉네임 변경 시 프로필 및 조회 캐시 무효화', () => {
  it('rename 성공 후 프로필을 채택하고 ranking·guild·friends·player 쿼리 캐시를 즉시 무효화한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(['ranking', 'fame', null, 'uid-1'], { board: 'fame', top: [], me: null });
    client.setQueryData(['guild', 'uid-1'], { guild: null, request: null });
    client.setQueryData(['friends', 'uid-1'], []);
    client.setQueryData(['player', 'uid-1'], { nickname: '옛이름' });
    client.setQueryData(['bounty', 'uid-1', '2026-11-26'], { clearsToday: {} });

    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useGame({ setToast: () => {} }), { wrapper });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });

    gw.profileReplies = [{ ok: true, nickname: '새이름', devTools: false }];
    const applyNickSpy = vi.spyOn(liveService, 'applyLocalNick');
    spy.mockClear();
    let err: unknown = 'pending';
    await act(async () => { err = await hook.result.current.rename('새이름'); });

    expect(err).toBeNull();
    expect(hook.result.current.nickname).toBe('새이름');
    expect(applyNickSpy).toHaveBeenCalledWith('uid-1', '새이름');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['ranking'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['guild'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['friends'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['player'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['player-search'] });
    expect(client.getQueryState(['ranking', 'fame', null, 'uid-1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['guild', 'uid-1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['friends', 'uid-1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['player', 'uid-1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['bounty', 'uid-1', '2026-11-26'])?.isInvalidated).toBe(false);
  });

  it('다른 탭에서 본인 닉네임 변경 실시간 이벤트를 받으면 본인 nickname과 readProfile을 갱신한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['session'], 'uid-1');
    let nickListener: ((e: { t: 'nick'; uid: string; nick: string }) => void) | null = null;
    const onNickSpy = vi.spyOn(liveService, 'onNickEvent').mockImplementation(fn => {
      nickListener = fn;
      return () => { nickListener = null; };
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useGame({ setToast: () => {} }), { wrapper });
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });

    gw.profileReplies = [{ ok: true, nickname: '다른탭새닉', devTools: false }];
    await act(async () => {
      nickListener?.({ t: 'nick', uid: 'uid-1', nick: '다른탭새닉' });
      await Promise.resolve();
    });
    expect(hook.result.current.nickname).toBe('다른탭새닉');
    onNickSpy.mockRestore();
  });
});

describe('게스트 부트스트랩 429 한도 초과 구분', () => {
  it('ensureSession이 rate_limited(429) 오류로 실패하면 unauthorized(unsaved)와 구분해 rate-limited 차단기와 혼잡 안내 정책으로 처리한다', async () => {
    gw.sessionError = Object.assign(new Error('too many anonymous sign-ins'), { code: 'rate_limited', status: 429 });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    expect(hook.result.current.blocker).toBe('rate-limited');
    expect(POLICY['auth-rate-limited'].message).toBe('같은 네트워크에서 접속이 잠시 몰려 있어요. 잠시 뒤 다시 시도해 주세요.');
    expect(gw.loads).toBe(0);
    expect(gw.actions).toEqual([]);
  });

  it('ensureSession이 AppError rate-limited로 실패해도 rate-limited 차단기와 혼잡 안내 정책으로 구분한다', async () => {
    gw.sessionError = new AppError('rate-limited', 'too many requests', { status: 429 });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    expect(hook.result.current.blocker).toBe('rate-limited');
    expect(gw.loads).toBe(0);
    expect(gw.actions).toEqual([]);
  });

  it('ensureSession이 null을 반환한 일반 인증 실패는 기존처럼 unsaved 차단기로 처리한다', async () => {
    gw.sessionReply = null;
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    expect(hook.result.current.blocker).toBe('unsaved');
    expect(gw.loads).toBe(0);
    expect(gw.actions).toEqual([]);
  });
});

describe('신규 진입 초기 인사 메시지(boot.greeting)', () => {
  it('클라우드 세이브가 없는 신규 진입(cloud === null)이면 부팅 완료 후 boot.greeting을 1회 출력한다(StrictMode 포함)', async () => {
    gw.cloudEmpty = true;
    const events: SystemNoticeInput[] = [];
    const sink: NoticeSink = registerNoticeSink(vi.fn(), e => events.push(e));
    setup(sink, true);

    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    expect(events.some(e => e.kind === 'boot.greeting')).toBe(false);

    await act(async () => { gw.bootResolve!(); });
    const greetings = events.filter(e => e.kind === 'boot.greeting');
    expect(greetings).toHaveLength(1);
    expect(greetings[0].text).toBe('마을 연못 어군에서 낚시하고, 집에 들어가 정비해 보세요.');
  });

  it('초기 서버 세이브가 있는 신규 마을 첫 시작 상태에도 boot.greeting을 1회 출력한다', async () => {
    gw.cloudEmpty = false;
    const events: SystemNoticeInput[] = [];
    const sink: NoticeSink = registerNoticeSink(vi.fn(), e => events.push(e));
    setup(sink);

    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(events.filter(e => e.kind === 'boot.greeting')).toHaveLength(1);
  });

  it('바다 위치이거나 명성·운세·도감 진행이 있는 복귀 유저에게는 boot.greeting을 출력하지 않는다', async () => {
    gw.cloudEmpty = false;
    gw.loadLocation = { kind: 'region', id: 'pacific' };
    gw.loadFame = 20;
    gw.loadFortune = { day: '2026-11-26', kind: 'shadow', index: 3 };
    const events: SystemNoticeInput[] = [];
    const sink: NoticeSink = registerNoticeSink(vi.fn(), e => events.push(e));
    setup(sink);

    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(events.some(e => e.kind === 'boot.greeting')).toBe(false);
    expect(events.some(e => e.kind === 'boot.cloudLoaded')).toBe(true);
  });

  it('마을이더라도 명성·도감 진행이 있는 복귀 유저에게는 boot.greeting을 출력하지 않는다', async () => {
    gw.cloudEmpty = false;
    gw.loadFame = 5;
    const events: SystemNoticeInput[] = [];
    const sink: NoticeSink = registerNoticeSink(vi.fn(), e => events.push(e));
    setup(sink);

    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(events.some(e => e.kind === 'boot.greeting')).toBe(false);
  });

  it('클라우드 세이브가 비어 있어도 레거시 이관 진행이 있는 기존 플레이어에게는 boot.greeting을 출력하지 않는다', async () => {
    gw.cloudEmpty = true;
    gw.legacy = true;
    gw.legacyFame = 10;
    const events: SystemNoticeInput[] = [];
    const sink: NoticeSink = registerNoticeSink(vi.fn(), e => events.push(e));
    setup(sink);

    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    expect(events.some(e => e.kind === 'boot.greeting')).toBe(false);
  });
});

describe('이벤트 캐시 무효화와 경제·보상 효과음 연동', () => {
  it('catch, enterEventZone, leaveEventZone, settleEventReward, fortune.set, redeemCoupon 성공 시 eventsKey(uid)를 무효화한다', async () => {
    const { client, hook } = setupWithClient();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });
    const spy = vi.spyOn(client, 'invalidateQueries');

    gw.dispatchResult = {
      type: 'catch',
      fishId: 'crucian',
      uid: 'f1',
      info: { form: 'normal', size: 15, percentile: 50, isBig: false, isNew: false },
      released: [],
    };
    await act(async () => { await hook.result.current.dispatch({ type: 'catch', spot: 'pond', judgment: 'good' }); });
    expect(spy).toHaveBeenCalledWith({ queryKey: eventsKey('uid-1') });

    const actions: GameAction[] = [
      { type: 'enterEventZone', eventId: 'ev-champ' },
      { type: 'leaveEventZone' },
      { type: 'settleEventReward', eventId: 'ev-champ' },
      { type: 'debug', command: 'fortune.set', args: { kind: 'fish', index: 5 } },
      { type: 'redeemCoupon', code: 'OPEN500' },
    ];
    for (const action of actions) {
      spy.mockClear();
      gw.dispatchResult = action.type === 'settleEventReward'
        ? { type: 'eventSettle', eventId: 'ev-champ', gold: 100, fame: 4 }
        : { type: 'none' };
      await act(async () => { await hook.result.current.dispatch(action); });
      expect(spy, action.type).toHaveBeenCalledWith({ queryKey: eventsKey('uid-1') });
    }
  });

  it('판매·장비 강화·보상 수령·이벤트 정산 성공 시 대응 효과음을 재생하고, 거부 시에는 재생하지 않는다', async () => {
    const { hook } = setupWithClient();
    await waitFor(() => expect(gw.bootResolve).not.toBeNull());
    await act(async () => { gw.bootResolve!(); });

    const sellSpy = vi.spyOn(soundEvents, 'emitShopSellSound').mockReturnValue(true);
    const gearSpy = vi.spyOn(soundEvents, 'emitGearUpgradeSound').mockReturnValue(true);
    const rewardSpy = vi.spyOn(soundEvents, 'emitRewardClaimSound').mockReturnValue(true);
    const settleSpy = vi.spyOn(soundEvents, 'emitEventSettleSound').mockReturnValue(true);

    gw.dispatchResult = { type: 'sell', gold: 120 };
    await act(async () => { await hook.result.current.dispatch({ type: 'sell', uids: ['f1'] }); });
    expect(sellSpy).toHaveBeenCalledTimes(1);

    gw.dispatchResult = { type: 'none' };
    await act(async () => { await hook.result.current.dispatch({ type: 'upgradeRod' }); });
    await act(async () => { await hook.result.current.dispatch({ type: 'buyBoat' }); });
    expect(gearSpy).toHaveBeenCalledTimes(2);

    gw.dispatchResult = { type: 'none' };
    await act(async () => { await hook.result.current.dispatch({ type: 'claimAchievement', id: 'a1' }); });
    gw.dispatchResult = { type: 'claimAllAchievements', gold: 500, hats: [] };
    await act(async () => { await hook.result.current.dispatch({ type: 'claimAllAchievements' }); });
    gw.dispatchResult = { type: 'mail', gold: 300 };
    await act(async () => { await hook.result.current.dispatch({ type: 'claimMail', id: 1 }); });
    gw.dispatchResult = { type: 'coupon', gold: 500, desc: '쿠폰' };
    await act(async () => { await hook.result.current.dispatch({ type: 'redeemCoupon', code: 'OPEN500' }); });
    await act(async () => { await hook.result.current.dispatch({ type: 'deliverBounty', questId: 'q1' }); });
    expect(rewardSpy).toHaveBeenCalledTimes(5);

    gw.dispatchResult = { type: 'eventSettle', eventId: 'ev-champ', gold: 200, fame: 4 };
    await act(async () => { await hook.result.current.dispatch({ type: 'settleEventReward', eventId: 'ev-champ' }); });
    expect(settleSpy).toHaveBeenCalledTimes(1);

    sellSpy.mockClear();
    gearSpy.mockClear();
    rewardSpy.mockClear();
    settleSpy.mockClear();
    gw.dispatchReject = 'not-enough-gold';
    await act(async () => { await hook.result.current.dispatch({ type: 'sell', uids: ['f1'] }); });
    await act(async () => { await hook.result.current.dispatch({ type: 'upgradeRod' }); });
    await act(async () => { await hook.result.current.dispatch({ type: 'claimMail', id: 1 }); });
    await act(async () => { await hook.result.current.dispatch({ type: 'settleEventReward', eventId: 'ev-champ' }); });
    expect(sellSpy).not.toHaveBeenCalled();
    expect(gearSpy).not.toHaveBeenCalled();
    expect(rewardSpy).not.toHaveBeenCalled();
    expect(settleSpy).not.toHaveBeenCalled();
  });
});
