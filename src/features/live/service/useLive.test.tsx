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
import { GLOBAL_CHAT_COOLDOWN_MS } from '../model/live';
import { sendChat, sendRegion, useChat, useLive, useLiveNotices, usePlayersIn } from './useLive';

describe('useLive 약관 수락 게이트 및 3방·공지 연동', () => {
  beforeEach(() => {
    liveMock.session = { ready: true, uid: 'u1' };
    liveMock.connections = [];
    liveMock.openCalls = 0;
    resetConsentGate();
  });
  afterEach(() => {
    cleanup();
    resetConsentGate();
    vi.useRealTimers();
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
        recentChat: [{ id: 1, uid: 'u1', nick: '가람', text: '전체', at: '2026-11-25T00:00:00.000Z' }],
        recentLocalChat: [{ id: 2, uid: 'u1', nick: '가람', text: '지역', at: '2026-11-25T00:00:01.000Z' }],
        recentGuildChat: [],
      });
    });
    expect(result.current.you).toBe('u1');
    expect(result.current.globalLines).toHaveLength(1);
    expect(result.current.localLines).toHaveLength(1);

    act(() => { blockConsentGate(); });
    expect(liveMock.connections[0].close).toHaveBeenCalledTimes(1);
    expect(result.current.you).toBeNull();
    expect(result.current.globalLines).toEqual([]);
    expect(result.current.localLines).toEqual([]);

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
        recentLocalChat: [{ id: 2, uid: 'u2', nick: '옛닉', text: '지역안녕', at: '2026-11-26T00:00:01.000Z' }],
        recentGuildChat: [],
      });
    });
    expect(result.current.players.map(p => p.nick)).toEqual(['옛닉']);
    expect(result.current.chat.globalLines.map(l => l.nick)).toEqual(['옛닉']);
    expect(result.current.chat.localLines.map(l => l.nick)).toEqual(['옛닉']);

    act(() => {
      liveMock.connections[0].onMessage({ t: 'nick', uid: 'u2', nick: '새닉' });
    });
    expect(result.current.players.map(p => p.nick)).toEqual(['새닉']);
    expect(result.current.chat.globalLines.map(l => l.nick)).toEqual(['새닉']);
    expect(result.current.chat.localLines.map(l => l.nick)).toEqual(['새닉']);
  });

  it('sendRegion은 현재 지역을 전송하고 hello 재연결 시에도 기억한 지역을 다시 보낸다', () => {
    renderHook(() => useLive());
    act(() => { sendRegion('seasia'); });
    expect(liveMock.connections[0].send).toHaveBeenCalledWith({ t: 'region', region: 'seasia' });

    act(() => {
      liveMock.connections[0].onMessage({
        t: 'hello',
        you: 'u1',
        others: [],
        recentChat: [],
      });
    });
    expect(liveMock.connections[0].send).toHaveBeenLastCalledWith({ t: 'region', region: 'seasia' });
  });

  it('sendChat으로 global 방에 보내면 10초 클라 낙관 쿨다운을 시작하고, notices 수신 시 공지 구독자를 갱신한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));
    const { result } = renderHook(() => {
      useLive();
      return { chat: useChat(), notices: useLiveNotices() };
    });

    act(() => { sendChat('안녕 전체', 'global'); });
    expect(liveMock.connections[0].send).toHaveBeenCalledWith({ t: 'chat', text: '안녕 전체', room: 'global' });
    expect(result.current.chat.globalCooldownUntil).toBe(Date.now() + GLOBAL_CHAT_COOLDOWN_MS);

    act(() => {
      liveMock.connections[0].onMessage({
        t: 'notices',
        notices: [{
          id: 7,
          title: '점검 안내',
          body: '잠시 뒤 점검해요.',
          startsAt: '2026-11-26T12:00:00.000Z',
          endsAt: '2026-11-26T13:00:00.000Z',
          createdAt: '2026-11-26T11:50:00.000Z',
        }],
      });
    });
    expect(result.current.notices.notices.map(n => n.id)).toEqual([7]);
  });
});
