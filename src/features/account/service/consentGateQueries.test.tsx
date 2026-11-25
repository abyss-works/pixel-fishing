// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAction } from '../../../game/rules/actions';

const apiState = vi.hoisted(() => ({
  consentRequired: true,
  readMails: vi.fn(),
  readFriends: vi.fn(),
  readRanking: vi.fn(),
  readFortuneHistory: vi.fn(),
  consentListeners: new Set<() => void>(),
  bootResolve: null as null | (() => void),
}));

vi.mock('../../../platform/api', async () => {
  const { when } = await import('../../../shared/lib/when');
  const { newState } = await import('../../../game/rules/logic');
  const { AppError } = await import('../../../core/errors');
  return {
    when,
    isConsentRequiredError: (e: unknown) =>
      e instanceof AppError && (e.kind === 'consent-required' || e.context.code === 'consent-required'),
    subscribeConsentRequired: (fn: () => void) => {
      apiState.consentListeners.add(fn);
      return () => { apiState.consentListeners.delete(fn); };
    },
    readMails: () => apiState.readMails(),
    markMailRead: vi.fn(async () => {}),
    readFriends: () => apiState.readFriends(),
    friendAction: vi.fn(async () => ({ ok: true, result: 'ok' })),
    readRanking: (board: string, fishId?: string) => apiState.readRanking(board, fishId),
    readFortuneHistory: (month?: string) => apiState.readFortuneHistory(month),
    api: {
      auth: {
        isConfigured: true,
        ensureSession: async () => 'uid-1',
        currentAccount: async () => ({ status: 'account' as const, email: 'u@example.com' }),
        getAccountConsent: async () => ({
          required: apiState.consentRequired,
          version: '2026-11-25',
          effectiveAt: '2026-11-25T00:00:00.000Z',
        }),
        acceptConsent: async (version: string) => {
          apiState.consentRequired = false;
          return { ok: true as const, consent: { required: false, version, effectiveAt: '2026-11-25T00:00:00.000Z' } };
        },
      },
      storage: {
        loadLegacy: () => ({ game: newState(), notice: null, legacy: false }),
        clearLegacySave: () => {},
        saveCode: () => '',
      },
      createGameGateway: () => ({
        load: async () => newState(),
        getProfile: async () => ({ ok: true as const, nickname: '가람', devTools: false }),
        dispatch: (action: GameAction) => {
          if (action.type !== 'boot') {
            return { status: 'ok' as const, state: newState(), result: { type: action.type } };
          }
          return new Promise(resolve => {
            apiState.bootResolve = () => resolve({
              status: 'ok' as const,
              state: newState(),
              result: { type: 'boot', schoolDay: '2026-11-25' },
            });
          });
        },
      }),
    },
  };
});

vi.mock('../../../platform/observability', () => ({ reportIssue: () => {} }));

import { allowConsentGate, blockConsentGate, resetConsentGate } from './consentGate';
import { sessionKey } from './session';
import { useGame } from '../../gameplay/service/useGame';
import { useMailbox } from '../../mailbox/service/useMailbox';
import { useFriends } from '../../friends/service/useFriends';
import { useRankingBoard } from '../../ranking/service/useRanking';
import { useFortuneHistory } from '../../fortune/service/useFortuneHistory';

describe('조회 훅 약관 수락 게이트 연동', () => {
  beforeEach(() => {
    apiState.consentRequired = true;
    apiState.bootResolve = null;
    apiState.consentListeners.clear();
    apiState.readMails.mockReset().mockResolvedValue([]);
    apiState.readFriends.mockReset().mockResolvedValue([]);
    apiState.readRanking.mockReset().mockResolvedValue({ board: 'fame', top: [], me: null });
    apiState.readFortuneHistory.mockReset().mockResolvedValue({
      month: '2026-11',
      firstMonth: '2026-11',
      currentDay: '2026-11-25',
      today: null,
      days: [],
    });
    resetConsentGate();
  });

  afterEach(() => {
    cleanup();
    resetConsentGate();
  });

  it('약관 미동의 부팅 중에는 우편함·친구 조회가 발사되지 않고, 동의 후 정상 조회된다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => ({
      game: useGame({ setToast: () => {} }),
      mailbox: useMailbox(),
      friends: useFriends(true),
    }), { wrapper });

    await waitFor(() => expect(result.current.game.blocker).toBe('consent'));
    await act(async () => {});
    expect(apiState.readMails).not.toHaveBeenCalled();
    expect(apiState.readFriends).not.toHaveBeenCalled();
    expect(result.current.mailbox.failed).toBe(false);
    expect(result.current.friends.failed).toBe(false);

    await act(async () => { await result.current.game.acceptConsent(); });
    await waitFor(() => expect(apiState.bootResolve).not.toBeNull());
    await act(async () => { apiState.bootResolve!(); });

    await waitFor(() => {
      expect(apiState.readMails).toHaveBeenCalledTimes(1);
      expect(apiState.readFriends).toHaveBeenCalledTimes(1);
    });
    expect(result.current.mailbox.failed).toBe(false);
    expect(result.current.friends.failed).toBe(false);
  });

  it('실행 중 약관 차단이 걸리기 직전 실패 캐시가 남아도 acceptConsent 재개 시 무효화로 다시 조회한다', async () => {
    apiState.consentRequired = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => ({
      game: useGame({ setToast: () => {} }),
      mailbox: useMailbox(),
      friends: useFriends(true),
    }), { wrapper });

    await waitFor(() => expect(apiState.bootResolve).not.toBeNull());
    await act(async () => { apiState.bootResolve!(); });
    await waitFor(() => {
      expect(apiState.readMails).toHaveBeenCalledTimes(1);
      expect(apiState.readFriends).toHaveBeenCalledTimes(1);
    });

    // 실행 중 403 실패 캐시 + 차단 시뮬레이션(retry: 1 이므로 2회 실패)
    apiState.consentRequired = true;
    apiState.readMails.mockRejectedValueOnce(new Error('403')).mockRejectedValueOnce(new Error('403'));
    apiState.readFriends.mockRejectedValueOnce(new Error('403')).mockRejectedValueOnce(new Error('403'));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['mailbox', 'uid-1'] });
      await client.refetchQueries({ queryKey: ['friends', 'uid-1'] });
    });
    await waitFor(() => {
      expect(result.current.mailbox.failed).toBe(true);
      expect(result.current.friends.failed).toBe(true);
    });

    act(() => { for (const fn of apiState.consentListeners) fn(); });
    await waitFor(() => expect(result.current.game.consentPrompt.consent?.required).toBe(true));

    await act(async () => { await result.current.game.acceptConsent(); });
    await waitFor(() => {
      expect(result.current.mailbox.failed).toBe(false);
      expect(result.current.friends.failed).toBe(false);
    });
    expect(apiState.readMails).toHaveBeenCalledTimes(4);
    expect(apiState.readFriends).toHaveBeenCalledTimes(4);
  });

  it('랭킹과 운세 이력 조회 훅도 약관 게이트 차단 중에는 요청하지 않고 해제 후 조회한다', async () => {
    blockConsentGate();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(sessionKey, 'uid-1');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => ({
      ranking: useRankingBoard('fame'),
      fortune: useFortuneHistory('2026-11', true),
    }), { wrapper });

    await act(async () => {});
    expect(apiState.readRanking).not.toHaveBeenCalled();
    expect(apiState.readFortuneHistory).not.toHaveBeenCalled();

    act(() => { allowConsentGate(); });
    await waitFor(() => {
      expect(result.current.ranking.data).not.toBeNull();
      expect(result.current.fortune.data).not.toBeNull();
    });
    expect(apiState.readRanking).toHaveBeenCalledTimes(1);
    expect(apiState.readFortuneHistory).toHaveBeenCalledTimes(1);
  });
});
