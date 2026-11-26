// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '../../../game/rules/live';

const liveMock = vi.hoisted(() => ({
  session: { ready: true, uid: 'u1' as string | null },
  connections: [] as Array<{ close: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; onMessage: (m: ServerMessage) => void }>,
  openCalls: 0,
}));

vi.mock('../../../platform/api', () => ({
  liveAvailable: true,
  openLive: (onMessage: (m: ServerMessage) => void) => {
    liveMock.openCalls++;
    const conn = { close: vi.fn(), send: vi.fn(), onMessage };
    liveMock.connections.push(conn);
    return conn;
  },
}));

vi.mock('../../account/service/session', () => ({
  useSession: () => liveMock.session,
}));

import { allowConsentGate, blockConsentGate, holdConsentGate, resetConsentGate } from '../../account/service/consentGate';
import { useChat, useLive, usePlayersIn } from './useLive';

describe('useLive 약관 수락 게이트 연동', () => {
  beforeEach(() => {
    liveMock.session = { ready: true, uid: 'u1' };
    liveMock.connections = [];
    liveMock.openCalls = 0;
    resetConsentGate();
  });
  afterEach(() => {
    cleanup();
    resetConsentGate();
  });

  it('약관 확인 대기(pending) 또는 차단(blocked) 상태에서는 세션이 준비돼도 실시간 연결을 열지 않는다', () => {
    holdConsentGate();
    renderHook(() => useLive());
    expect(liveMock.openCalls).toBe(0);

    act(() => { blockConsentGate(); });
    expect(liveMock.openCalls).toBe(0);

    act(() => { allowConsentGate(); });
    expect(liveMock.openCalls).toBe(1);
  });

  it('연결 중에 약관 차단이 걸리면 즉시 연결을 닫고 상태를 비우며, 수락 후 다시 연결한다', () => {
    const { result } = renderHook(() => {
      useLive();
      return useChat();
    });
    expect(liveMock.openCalls).toBe(1);
    act(() => {
      liveMock.connections[0].onMessage({
        t: 'hello',
        you: 'u1',
        others: [],
        recentChat: [{ id: 1, uid: 'u1', nick: '가람', text: '안녕', at: '2026-11-25T00:00:00.000Z' }],
        recentGuildChat: [],
      });
    });
    expect(result.current.you).toBe('u1');
    expect(result.current.lines).toHaveLength(1);

    act(() => { blockConsentGate(); });
    expect(liveMock.connections[0].close).toHaveBeenCalledTimes(1);
    expect(result.current.you).toBeNull();
    expect(result.current.lines).toEqual([]);

    act(() => { allowConsentGate(); });
    expect(liveMock.openCalls).toBe(2);
  });

  it('nick 메시지를 받으면 usePlayersIn과 useChat 구독자에게 즉시 새 닉네임을 반영한다', () => {
    const { result } = renderHook(() => {
      useLive();
      return {
        players: usePlayersIn('world'),
        chat: useChat(),
      };
    });
    act(() => {
      liveMock.connections[0].onMessage({
        t: 'hello',
        you: 'u1',
        others: [{ uid: 'u2', nick: '옛닉', boat: 1, region: 'world', x: 0, y: 0, dir: 0, line: false }],
        recentChat: [{ id: 1, uid: 'u2', nick: '옛닉', text: '안녕', at: '2026-11-26T00:00:00.000Z' }],
        recentGuildChat: [],
      });
    });
    expect(result.current.players.map(p => p.nick)).toEqual(['옛닉']);
    expect(result.current.chat.lines.map(l => l.nick)).toEqual(['옛닉']);

    act(() => {
      liveMock.connections[0].onMessage({ t: 'nick', uid: 'u2', nick: '새닉' });
    });
    expect(result.current.players.map(p => p.nick)).toEqual(['새닉']);
    expect(result.current.chat.lines.map(l => l.nick)).toEqual(['새닉']);
  });
});
