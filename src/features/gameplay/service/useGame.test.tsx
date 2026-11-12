// 부트스트랩 — 서버는 접속(boot)한 창의 액션만 받으므로, boot 응답 전에는 플레이를 열지 않는다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameAction } from '../../../game/rules/actions';
import { AppError } from '../../../core/errors';

const gw = vi.hoisted(() => ({
  bootResolve: null as null | (() => void),
  actions: [] as string[],
  loads: 0,
  loadGold: 0,
  legacy: false,
  cloudEmpty: false,
  importError: null as unknown,
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
        load: async () => { gw.loads++; return gw.cloudEmpty ? null : { ...fresh(), gold: gw.loadGold }; },
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

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useGame({ setToast: () => {} }), { wrapper });
}

afterEach(() => {
  cleanup(); gw.bootResolve = null; gw.actions = []; gw.loads = 0; gw.loadGold = 0;
  gw.legacy = false; gw.cloudEmpty = false; gw.importError = null;
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
