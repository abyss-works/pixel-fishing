import type { ChatLine, ClientMessage, Dir, Presence, ServerMessage } from '../../../game/rules/live';
import { LIVE_STALE_MS } from '../../../game/rules/live';

// 실시간 채널의 다른 플레이어 상태와 내 위치 송신 판정 — 표시용이라 게임 상태와 섞지 않는다.

export interface OtherPlayer {
  presence: Presence;
  /** 이동 중이면 참 — 정지 알림을 받으면 거짓이 되고, 그동안은 소식이 없어도 반투명으로 그리지 않는다 */
  moving: boolean;
  /** 마지막으로 위치를 받은 시각 */
  lastAt: number;
}

/** 서버가 채팅을 거부한 이유 */
export type ChatError = Extract<ServerMessage, { t: 'error' }>['code'];

export interface LiveState {
  you: string | null;
  others: Readonly<Record<string, OtherPlayer>>;
  /** 받은 채팅(오래된 순). 보관 상한을 넘으면 오래된 줄부터 버린다 */
  chat: readonly ChatLine[];
  /** 마지막으로 거부된 내 채팅의 이유. 내 채팅이 저장되면 지운다 */
  chatError: ChatError | null;
}

export const EMPTY_LIVE: LiveState = { you: null, others: {}, chat: [], chatError: null };

/** 화면에 남기는 채팅 줄 수 */
export const CHAT_KEEP = 200;

/** 서버 메시지 하나를 반영한 새 상태. 상태가 그대로면 같은 객체를 돌려준다 */
export function applyLiveMessage(state: LiveState, msg: ServerMessage, now: number): LiveState {
  switch (msg.t) {
    case 'hello':
      return {
        you: msg.you,
        others: Object.fromEntries(msg.others.map(p => [p.uid, { presence: p, moving: false, lastAt: now }])),
        chat: msg.recentChat.slice(-CHAT_KEEP),
        chatError: null,
      };
    case 'chat': {
      if (state.chat.some(l => l.id === msg.line.id)) return state;
      return {
        ...state,
        chat: [...state.chat, msg.line].slice(-CHAT_KEEP),
        chatError: msg.line.uid === state.you ? null : state.chatError,
      };
    }
    case 'error':
      return { ...state, chatError: msg.code };
    case 'join':
      if (msg.presence.uid === state.you) return state;
      return { ...state, others: { ...state.others, [msg.presence.uid]: { presence: msg.presence, moving: false, lastAt: now } } };
    case 'move': {
      const prev = state.others[msg.uid];
      if (!prev) return state;
      const { region, x, y, dir, line } = msg;
      return { ...state, others: { ...state.others,
        [msg.uid]: { presence: { ...prev.presence, region, x, y, dir, line }, moving: true, lastAt: now } } };
    }
    case 'stop': {
      const prev = state.others[msg.uid];
      if (!prev) return state;
      return { ...state, others: { ...state.others, [msg.uid]: { ...prev, moving: false, lastAt: now } } };
    }
    case 'leave': {
      if (!state.others[msg.uid]) return state;
      const others = { ...state.others };
      delete others[msg.uid];
      return { ...state, others };
    }
    default:
      return state;
  }
}

/** 차단한 사람의 채팅 줄을 지운 상태. 이후 줄은 서버가 보내지 않는다 */
export function withoutAuthor(state: LiveState, uid: string): LiveState {
  return { ...state, chat: state.chat.filter(l => l.uid !== uid) };
}

/** 이동 중인데 오래 소식이 없는 플레이어 — 반투명으로 그린다 */
export function isStale(o: OtherPlayer, now: number): boolean {
  return o.moving && now - o.lastAt > LIVE_STALE_MS;
}

/** 그 바다에 있는 다른 플레이어 — 이름 순 */
export function othersInRegion(state: LiveState, region: string): OtherPlayer[] {
  return Object.values(state.others)
    .filter(o => o.presence.region === region)
    .sort((a, b) => a.presence.nick.localeCompare(b.presence.nick));
}

/** 마지막으로 보낸 내 위치 */
export interface SentPosition { region: string; x: number; y: number; line: boolean; stopped: boolean }

export interface MyPosition { region: string; x: number; y: number; line: boolean }

const dirOf = (dx: number, dy: number): Dir =>
  Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : 3) : (dy >= 0 ? 2 : 0);

/**
 * 송신 주기마다 무엇을 보낼지 정한다. 위치·바다·낚싯줄이 바뀌었으면 move, 그대로인데 직전에 움직였으면 stop 한 번,
 * 그 밖에는 보내지 않는다.
 * @returns 보낼 메시지와 그 뒤의 '마지막으로 보낸 위치'. 보낼 것이 없으면 메시지는 null이다
 */
export function nextPositionMessage(last: SentPosition | null, cur: MyPosition): { msg: ClientMessage | null; sent: SentPosition | null } {
  const changed = !last || last.region !== cur.region || last.x !== cur.x || last.y !== cur.y || last.line !== cur.line;
  if (changed) {
    const dir = last ? dirOf(cur.x - last.x, cur.y - last.y) : 2;
    return { msg: { t: 'move', ...cur, dir }, sent: { ...cur, stopped: false } };
  }
  if (!last.stopped) return { msg: { t: 'stop' }, sent: { ...last, stopped: true } };
  return { msg: null, sent: last };
}
