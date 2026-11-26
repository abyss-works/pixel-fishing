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
import { JUMP_S } from '../../../game/rendering/pixel/sprites/schoolView';
import { GLOBAL_CHAT_COOLDOWN_MS } from '../model/live';
import {
  applyLocalNick,
  liveFrame,
  onMailEvent,
  onNickEvent,
  sendChat,
  sendRegion,
  useChat,
  useLive,
  useLiveNotices,
  usePlayersIn,
} from './useLive';

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
        others: [{ uid: 'u2', nick: '옛닉', boat: 3, fame: 1500, region: 'world', x: 0, y: 0, dir: 0, line: false }],
        recentChat: [{ id: 1, uid: 'u2', nick: '옛닉', text: '안녕', at: '2026-11-26T00:00:00.000Z' }],
        recentLocalChat: [{ id: 2, uid: 'u2', nick: '옛닉', text: '지역안녕', at: '2026-11-26T00:00:01.000Z' }],
        recentGuildChat: [],
      });
    });
    expect(result.current.players.map(p => p.nick)).toEqual(['옛닉']);
    expect(result.current.players[0].fame).toBe(1500);
    expect(result.current.players[0].boatTierLabel).toBe('T3');
    expect(result.current.chat.globalLines.map(l => l.nick)).toEqual(['옛닉']);
    expect(result.current.chat.localLines.map(l => l.nick)).toEqual(['옛닉']);

    act(() => {
      liveMock.connections[0].onMessage({ t: 'nick', uid: 'u2', nick: '새닉' });
    });
    expect(result.current.players.map(p => p.nick)).toEqual(['새닉']);
    expect(result.current.players[0].fame).toBe(1500);
    expect(result.current.chat.globalLines.map(l => l.nick)).toEqual(['새닉']);
    expect(result.current.chat.localLines.map(l => l.nick)).toEqual(['새닉']);

    act(() => {
      liveMock.connections[0].onMessage({
        t: 'join',
        presence: { uid: 'u3', nick: '합류꾼', boat: 9, fame: 92_000, region: 'world', x: 1, y: 2, dir: 1, line: false },
      });
    });
    expect(result.current.players.map(p => ({ uid: p.uid, fame: p.fame, tier: p.boatTierLabel }))).toEqual([
      { uid: 'u3', fame: 92_000, tier: 'T9' },
      { uid: 'u2', fame: 1500, tier: 'T3' },
    ]);
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

  it('sendChat으로 global 방에 보낸 뒤 chat-duplicate 오류를 받으면 쿨다운이 걸리지 않고, 본인 발신 global chat 수신 시에만 10초 쿨다운이 걸린다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));
    const { result } = renderHook(() => {
      useLive();
      return { chat: useChat(), notices: useLiveNotices() };
    });

    expect(result.current.notices.noticesSynced).toBe(false);

    act(() => {
      liveMock.connections[0].onMessage({
        t: 'hello',
        you: 'u1',
        others: [],
        recentChat: [],
      });
    });
    expect(result.current.notices.noticesSynced).toBe(true);

    act(() => { sendChat('안녕 전체', 'global'); });
    expect(liveMock.connections[0].send).toHaveBeenCalledWith({ t: 'chat', text: '안녕 전체', room: 'global' });
    expect(result.current.chat.globalCooldownUntil).toBe(0);

    // 중복 문구 등 거부 오류를 받아도 전체 채팅 쿨다운이 잠기지 않는다
    act(() => {
      liveMock.connections[0].onMessage({ t: 'error', code: 'chat-duplicate' });
    });
    expect(result.current.chat.error).toBe('chat-duplicate');
    expect(result.current.chat.globalCooldownUntil).toBe(0);

    // 다른 문구로 바로 다시 보낼 수 있고, 다른 사람의 전체 채팅에는 쿨다운이 걸리지 않는다
    act(() => { sendChat('다른 전체 말', 'global'); });
    expect(liveMock.connections[0].send).toHaveBeenLastCalledWith({ t: 'chat', text: '다른 전체 말', room: 'global' });
    act(() => {
      liveMock.connections[0].onMessage({
        t: 'chat',
        room: 'global',
        line: { id: 9, uid: 'u2', nick: '남', text: '남의 말', at: '2026-11-26T12:00:00.000Z' },
      });
    });
    expect(result.current.chat.globalCooldownUntil).toBe(0);

    // 본인 발신 전체 채팅이 서버에서 확정되어 돌아오면 10초 쿨다운을 설정한다
    act(() => {
      liveMock.connections[0].onMessage({
        t: 'chat',
        room: 'global',
        line: { id: 10, uid: 'u1', nick: '나', text: '다른 전체 말', at: '2026-11-26T12:00:00.000Z' },
      });
    });
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

    // 연결 해제(reset) 시 noticesSynced와 globalCooldownUntil이 초기화된다
    act(() => { blockConsentGate(); });
    expect(result.current.notices.noticesSynced).toBe(false);
    expect(result.current.chat.globalCooldownUntil).toBe(0);
  });

  it('onNickEvent는 others에 없는 피어 닉네임 변경도 전달하고, applyLocalNick은 3방 채팅 본인 줄을 즉시 갱신한다', () => {
    const nickEvents: Array<{ uid: string; nick: string }> = [];
    const offNick = onNickEvent(e => { nickEvents.push({ uid: e.uid, nick: e.nick }); });
    const mailListener = vi.fn();
    const offMail = onMailEvent(mailListener);
    try {
      const { result } = renderHook(() => {
        useLive();
        return useChat();
      });

      act(() => {
        liveMock.connections[0].onMessage({
          t: 'hello',
          you: 'u1',
          others: [],
          recentChat: [{ id: 1, uid: 'u1', nick: '옛나', text: '전체', at: '2026-11-26T00:00:00.000Z' }],
          recentLocalChat: [{ id: 2, uid: 'u1', nick: '옛나', text: '지역', at: '2026-11-26T00:00:01.000Z' }],
          recentGuildChat: [{ id: 3, uid: 'u1', nick: '옛나', text: '길드', at: '2026-11-26T00:00:02.000Z' }],
        });
      });

      act(() => {
        liveMock.connections[0].onMessage({ t: 'nick', uid: 'u9', nick: '바뀐피어' });
      });
      expect(nickEvents).toEqual([{ uid: 'u9', nick: '바뀐피어' }]);

      act(() => {
        applyLocalNick('u1', '새나');
      });
      expect(result.current.globalLines.map(l => l.nick)).toEqual(['새나']);
      expect(result.current.localLines.map(l => l.nick)).toEqual(['새나']);
      expect(result.current.guildLines.map(l => l.nick)).toEqual(['새나']);

      act(() => {
        liveMock.connections[0].onMessage({ t: 'mail' });
      });
      expect(mailListener).toHaveBeenCalledTimes(1);
    } finally {
      offNick();
      offMail();
    }
  });

  it('catchFx는 React 재렌더 없이 큐에 쌓이고 지역 필터·12개 상한·JUMP_S 만료·연결 해제를 처리한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));

    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      useLive();
      return usePlayersIn('world');
    });
    const rendersBeforeCatchFx = renderCount;

    // 13개 전송 시 가장 오래된 1개를 버리고 12개만 유지한다 (world 11개 + village 1개)
    act(() => {
      for (let i = 0; i < 12; i++) {
        liveMock.connections[0].onMessage({
          t: 'catchFx',
          uid: `u-${i}`,
          region: 'world',
          x: 100 + i,
          y: 200 + i,
          fishId: 'carp',
          ...(i % 2 === 1 ? { form: 'variant' as const } : {}),
        });
      }
      liveMock.connections[0].onMessage({
        t: 'catchFx',
        uid: 'u-village',
        region: 'village',
        x: 50,
        y: 60,
        fishId: 'goldfish',
      });
    });

    // catchFx 수신만으로는 React 구독자에게 알리지 않는다
    expect(renderCount).toBe(rendersBeforeCatchFx);

    // rAF 기준 now(performance.now)가 Date.now와 다르더라도 wall clock 기준으로 경과 시간을 계산한다
    vi.advanceTimersByTime(300);
    const worldFrame = liveFrame('world', 123);
    expect(worldFrame.peerJumps).toHaveLength(11);
    expect(worldFrame.peerJumps?.[0]).toEqual({ x: 101, y: 201, fishId: 'carp', form: 'variant', t: 0.3 });
    expect(worldFrame.peerJumps?.[10]).toEqual({ x: 111, y: 211, fishId: 'carp', form: 'variant', t: 0.3 });

    const villageFrame = liveFrame('village', 123);
    expect(villageFrame.peerJumps).toEqual([
      { x: 50, y: 60, fishId: 'goldfish', t: 0.3 },
    ]);

    // JUMP_S * 1000 이상 경과하면 만료 제거된다
    vi.advanceTimersByTime(JUMP_S * 1000 - 300);
    expect(liveFrame('world', 123 + JUMP_S * 1000).peerJumps).toEqual([]);
    expect(liveFrame('village', 123 + JUMP_S * 1000).peerJumps).toEqual([]);

    // 연결 해제(reset) 시 대기 중인 피어 점프도 비운다
    act(() => {
      liveMock.connections[0].onMessage({
        t: 'catchFx',
        uid: 'u-reset',
        region: 'world',
        x: 10,
        y: 20,
        fishId: 'carp',
      });
    });
    expect(liveFrame('world', 1500).peerJumps).toHaveLength(1);
    act(() => { blockConsentGate(); });
    expect(liveFrame('world', 1500).peerJumps).toEqual([]);
  });
});
