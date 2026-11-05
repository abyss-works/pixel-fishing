import { useEffect, useSyncExternalStore } from 'react';
import { liveAvailable, openLive } from '../../../platform/api';
import type { LiveConnection } from '../../../platform/api';
import type { Bob, ServerMessage } from '../../../game/rules/live';
import { glidePosition, LIVE_MOVE_MS, nextGlide } from '../../../game/rules/live';
import type { Glide } from '../../../game/rules/live';
import { useSession } from '../../account/service/session';
import { applyLiveMessage, bubbleOf, EMPTY_LIVE, isStale, nextPositionMessage, othersInRegion, withoutAuthor } from '../model/live';
import type { ChatError, ChatRoom, LiveState, MyPosition, SentPosition } from '../model/live';
import type { ChatLine } from '../../../game/rules/live';

// 실시간 채널 연결과 다른 플레이어 상태 — 게임 화면이 떠 있는 동안 연결을 유지한다.
// 연결은 로그인 쿠키로 인증되므로 세션이 선 뒤 열고, 계정이 바뀌면 새 쿠키로 다시 연다.
// 상태는 모듈 하나에만 있다(창 하나에 연결 하나). 화면 구독은 접속·퇴장·바다 이동·채팅 때만 알린다.

let state: LiveState = EMPTY_LIVE;
let conn: LiveConnection | null = null;
/** hello를 받을 때마다 늘어난다 — 재연결 뒤 내 위치를 다시 보내는 기준 */
let helloCount = 0;
const listeners = new Set<() => void>();
/** 화면에 그리는 위치 — 받은 좌표를 향해 프레임마다 다가간다 */
/** 다른 플레이어의 화면 이동 — 좌표를 받을 때마다 지금 위치에서 새 위치까지 송신 주기 동안 일정 속도로 간다.
    시각은 화면 프레임과 같은 performance.now 기준이다 */
const glides = new Map<string, Glide>();
/** 다른 플레이어가 마지막으로 보낸 채팅과 받은 시각, 입력 중 표시를 켠 시각 — 머리 위 말풍선용(performance.now 기준) */
const said = new Map<string, { text: string; at: number }>();
const typingAt = new Map<string, number>();
/** 친구 알림 구독자 — 화면 상태가 아니라 한 번 일어나는 일이라 상태에 넣지 않고 바로 넘긴다 */
type FriendEvent = Extract<ServerMessage, { t: 'friend' }>;
const friendListeners = new Set<(e: FriendEvent) => void>();

function receive(msg: ServerMessage): void {
  const prev = state;
  state = applyLiveMessage(state, msg, Date.now());
  if (msg.t === 'hello') { helloCount++; glides.clear(); said.clear(); typingAt.clear(); }
  if (msg.t === 'leave') { glides.delete(msg.uid); said.delete(msg.uid); typingAt.delete(msg.uid); }
  // 머리 위 말풍선은 월드 채팅만 띄운다 — 길드 채팅은 길드원끼리만 보는 대화다
  if (msg.t === 'chat' && msg.room !== 'guild') { said.set(msg.line.uid, { text: msg.line.text, at: performance.now() }); typingAt.delete(msg.line.uid); }
  if (msg.t === 'typing') {
    if (msg.on) typingAt.set(msg.uid, performance.now());
    else typingAt.delete(msg.uid);
  }
  if (msg.t === 'friend') for (const listener of friendListeners) listener(msg);
  if (msg.t === 'move') glides.set(msg.uid, nextGlide(glides.get(msg.uid) ?? null, msg, performance.now()));
  const regionChanged = msg.t === 'move' && prev.others[msg.uid]?.presence.region !== msg.region;
  if (msg.t === 'hello' || msg.t === 'join' || msg.t === 'leave' || msg.t === 'chat' || msg.t === 'error' || regionChanged) {
    notify();
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

function reset(): void {
  state = EMPTY_LIVE;
  glides.clear();
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getState = () => state;

/** 실시간 채널 연결을 게임 화면 수명에 묶는다 */
export function useLive(): void {
  const { ready, uid } = useSession();
  useEffect(() => {
    if (!ready || !uid) return;
    conn = openLive(receive);
    return () => { conn?.close(); conn = null; reset(); };
  }, [ready, uid]);
}

/** 그 바다에 있는 다른 플레이어 — 이름 순. 차단한 사람도 들어 있다(접속 상태는 차단과 무관하다) */
export function usePlayersIn(region: string): { uid: string; nick: string }[] {
  const s = useSyncExternalStore(subscribe, getState, getState);
  return othersInRegion(s, region).map(o => ({ uid: o.presence.uid, nick: o.presence.nick }));
}

/** 친구 알림(받은 요청·내 요청의 수락)을 받는다. 돌려준 함수로 구독을 끝낸다 */
export function onFriendEvent(listener: (e: FriendEvent) => void): () => void {
  friendListeners.add(listener);
  return () => { friendListeners.delete(listener); };
}

/** 그 플레이어가 지금 실시간 채널에 접속해 있는가 — 위치를 한 번이라도 보낸 연결만 접속으로 본다 */
export function useOnline(uid: string): boolean {
  const s = useSyncExternalStore(subscribe, getState, getState);
  return uid in s.others;
}

/** 프레임마다 부른다 — 그 바다의 다른 플레이어를 보간한 위치로 돌려준다 */
export function othersFrame(region: string, now: number): { x: number; y: number; nick: string; line: boolean; bob: Bob | null; stale: boolean; bubble: string | 'typing' | null }[] {
  const wall = Date.now();
  return othersInRegion(state, region).map(o => {
    const { uid, x, y, nick, line, bob } = o.presence;
    const pos = glidePosition(glides.get(uid) ?? nextGlide(null, { x, y }, now), now);
    const b = bubbleOf(said.get(uid) ?? null, typingAt.get(uid) ?? null, now);
    return { x: pos.x, y: pos.y, nick, line, bob: bob ?? null, stale: isStale(o, wall), bubble: b ? (b.kind === 'chat' ? b.text : 'typing') : null };
  });
}

/**
 * 내 위치를 송신 주기마다 보낸다. 탭이 숨겨져 있으면 보내지 않고, 다시 보이거나 재연결되면 현재 위치를 다시 보낸다.
 * @param read 지금 위치와 낚싯줄 상태
 */
export function useLivePosition(read: () => MyPosition): void {
  useEffect(() => {
    let last: SentPosition | null = null;
    let seenHello = helloCount;
    const timer = setInterval(() => {
      if (!conn) return;
      if (document.hidden || seenHello !== helloCount) { last = null; seenHello = helloCount; if (document.hidden) return; }
      const next = nextPositionMessage(last, read());
      last = next.sent;
      if (next.msg) conn.send(next.msg);
    }, LIVE_MOVE_MS);
    return () => clearInterval(timer);
  }, [read]);
}

export interface ChatView {
  /** 채팅을 쓸 수 있는 환경인가. 로컬 모드에는 실시간 채널이 없다 */
  enabled: boolean;
  /** 내 id. 연결 전에는 null */
  you: string | null;
  lines: readonly ChatLine[];
  /** 내 길드의 채팅 줄 */
  guildLines: readonly ChatLine[];
  error: ChatError | null;
}

/** 채팅 목록과 마지막 거부 이유 */
export function useChat(): ChatView {
  const s = useSyncExternalStore(subscribe, getState, getState);
  return { enabled: liveAvailable, you: s.you, lines: s.chat, guildLines: s.guildChat, error: s.chatError };
}

/** 입력 중 표시를 켜고 끈다. 연결이 끊긴 동안에는 버린다 */
export function sendTyping(on: boolean): void {
  conn?.send({ t: 'typing', on });
}

/** 그 방에 채팅을 보낸다. 연결이 끊긴 동안에는 버린다 */
export function sendChat(text: string, room: ChatRoom = 'world'): void {
  conn?.send(room === 'guild' ? { t: 'chat', text, room: 'guild' } : { t: 'chat', text });
}

/** 보이고 있는 거부 이유를 지운다 */
export function clearChatError(): void {
  if (state.chatError === null) return;
  state = { ...state, chatError: null };
  notify();
}

/** 차단한 사람의 채팅 줄을 화면에서 지운다 */
export function hideAuthor(uid: string): void {
  state = withoutAuthor(state, uid);
  notify();
}

// 입력 중 표시를 켠 동안 다시 알리는 간격 — 받는 쪽은 소식이 끊기면 스스로 끈다
const TYPING_REFRESH_MS = 4000;

/** 채팅 입력 중(포커스가 있고 글이 있음)인 동안 입력 중 표시를 켜 둔다. 끝나거나 화면이 사라지면 끈다 */
export function useTypingSignal(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    sendTyping(true);
    const timer = setInterval(() => sendTyping(true), TYPING_REFRESH_MS);
    return () => { clearInterval(timer); sendTyping(false); };
  }, [active]);
}
