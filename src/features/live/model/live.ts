import type { Look } from '../../../game/content/wardrobe';
import type { Bob, ChatLine, ClientMessage, Dir, Presence, ServerMessage, Spot } from '../../../game/rules/live';
import { formatIdle, LIVE_STALE_MS, movedAtOf } from '../../../game/rules/live';

// 실시간 채널의 다른 플레이어 상태와 내 위치 송신 판정 — 표시용이라 게임 상태와 섞지 않는다.

export interface OtherPlayer {
  presence: Presence;
  /** 이동 중이면 참 — 정지 알림을 받으면 거짓이 되고, 그동안은 소식이 없어도 반투명으로 그리지 않는다 */
  moving: boolean;
  /** 마지막으로 위치를 받은 시각 */
  lastAt: number;
  /** 마지막으로 위치가 바뀐 시각(내 시계, Date.now 기준). 서버가 경과 시간을 싣지 않았으면 null */
  movedAt: number | null;
}

// 서버가 보낸 경과 시간을 받은 시각의 내 시계로 옮긴다. 두 시계를 직접 맞추지 않으므로 시계 차이가 끼지 않고 전송 지연만 남는다
const movedAtFrom = (idleMs: number | undefined, now: number): number | null => idleMs === undefined ? null : now - idleMs;

/** 서버가 채팅을 거부한 이유 */
export type ChatError = Extract<ServerMessage, { t: 'error' }>['code'];

export interface LiveState {
  you: string | null;
  others: Readonly<Record<string, OtherPlayer>>;
  /** 받은 채팅(오래된 순). 보관 상한을 넘으면 오래된 줄부터 버린다 */
  chat: readonly ChatLine[];
  /** 받은 길드 채팅(오래된 순). 보관 상한은 월드 채팅과 같다 */
  guildChat: readonly ChatLine[];
  /** 마지막으로 거부된 내 채팅의 이유. 내 채팅이 저장되면 지운다 */
  chatError: ChatError | null;
}

export const EMPTY_LIVE: LiveState = { you: null, others: {}, chat: [], guildChat: [], chatError: null };

/** 채팅 방 — 월드(전체)와 내 길드 */
export type ChatRoom = 'world' | 'guild';

/** 화면에 남기는 채팅 줄 수 */
export const CHAT_KEEP = 200;

/** 서버 메시지 하나를 반영한 새 상태. 상태가 그대로면 같은 객체를 돌려준다 */
export function applyLiveMessage(state: LiveState, msg: ServerMessage, now: number): LiveState {
  switch (msg.t) {
    case 'hello':
      return {
        you: msg.you,
        others: Object.fromEntries(msg.others.map(p => [p.uid, { presence: p, moving: false, lastAt: now, movedAt: movedAtFrom(p.idleMs, now) }])),
        chat: msg.recentChat.slice(-CHAT_KEEP),
        guildChat: (msg.recentGuildChat ?? []).slice(-CHAT_KEEP),
        chatError: null,
      };
    case 'chat': {
      const key = msg.room === 'guild' ? 'guildChat' : 'chat';
      if (state[key].some(l => l.id === msg.line.id)) return state;
      return {
        ...state,
        [key]: [...state[key], msg.line].slice(-CHAT_KEEP),
        chatError: msg.line.uid === state.you ? null : state.chatError,
      };
    }
    case 'error':
      return { ...state, chatError: msg.code };
    case 'join':
      if (msg.presence.uid === state.you) return state;
      return { ...state, others: { ...state.others, [msg.presence.uid]: { presence: msg.presence, moving: false, lastAt: now, movedAt: movedAtFrom(msg.presence.idleMs, now) } } };
    case 'move': {
      const prev = state.others[msg.uid];
      if (!prev) return state;
      const { region, zone, x, y, dir, line, bob, look } = msg;
      return { ...state, others: { ...state.others,
        [msg.uid]: { presence: { ...prev.presence, region, zone: zone ?? null, x, y, dir, line, bob, ...(look ? { look } : {}) }, moving: true, lastAt: now, movedAt: movedAtFrom(msg.idleMs, now) } } };
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

/** 차단한 사람의 채팅 줄을 두 방에서 지운 상태. 이후 줄은 서버가 보내지 않는다 */
export function withoutAuthor(state: LiveState, uid: string): LiveState {
  return { ...state, chat: state.chat.filter(l => l.uid !== uid), guildChat: state.guildChat.filter(l => l.uid !== uid) };
}

/** 이동 중인데 오래 소식이 없는 플레이어 — 반투명으로 그린다 */
export function isStale(o: OtherPlayer, now: number): boolean {
  return o.moving && now - o.lastAt > LIVE_STALE_MS;
}

/** 그 바다에 접속해 있는 길드원의 위치 — 미니맵 표시용. 받은 좌표 그대로다(보간하지 않는다) */
export function matesInRegion(state: LiveState, region: string, uids: ReadonlySet<string>): { uid: string; x: number; y: number }[] {
  return othersInRegion(state, region)
    .filter(o => uids.has(o.presence.uid))
    .map(o => ({ uid: o.presence.uid, x: o.presence.x, y: o.presence.y }));
}

/** 그 바다에 있는 다른 플레이어 — 이름 순 */
export function othersInRegion(state: LiveState, region: string): OtherPlayer[] {
  return Object.values(state.others)
    .filter(o => o.presence.region === region)
    .sort((a, b) => a.presence.nick.localeCompare(b.presence.nick));
}

/** 마지막으로 보낸 내 위치 */
export interface SentPosition extends MyPosition { stopped: boolean }

/** 내 위치와 외형. bob은 낚싯줄을 드리운 동안의 찌 위치이고, 드리우지 않았으면 null이다 */
export interface MyPosition { region: string; zone: string | null; x: number; y: number; line: boolean; bob: Bob | null; look: Look }

const sameLook = (a: Look, b: Look) => a.shirt === b.shirt && a.pants === b.pants && a.hat === b.hat;

const dirOf = (dx: number, dy: number): Dir =>
  Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : 3) : (dy >= 0 ? 2 : 0);

/**
 * 송신 주기마다 무엇을 보낼지 정한다. 위치·바다·낚싯줄이 바뀌었으면 move, 그대로인데 직전에 움직였으면 stop 한 번,
 * 그 밖에는 보내지 않는다.
 * @returns 보낼 메시지와 그 뒤의 '마지막으로 보낸 위치'. 보낼 것이 없으면 메시지는 null이다
 */
export function nextPositionMessage(last: SentPosition | null, cur: MyPosition): { msg: ClientMessage | null; sent: SentPosition | null } {
  const changed = !last || last.region !== cur.region || last.zone !== cur.zone || last.x !== cur.x || last.y !== cur.y
    || last.line !== cur.line || last.bob?.x !== cur.bob?.x || last.bob?.y !== cur.bob?.y || !sameLook(last.look, cur.look);
  if (changed) {
    const dir = last ? dirOf(cur.x - last.x, cur.y - last.y) : 2;
    const { bob, look, ...pos } = cur;
    // 외형은 처음과 바뀐 때만 싣는다
    const lookChanged = !last || !sameLook(last.look, look);
    return { msg: { t: 'move', ...pos, dir, ...(bob ? { bob } : {}), ...(lookChanged ? { look } : {}) }, sent: { ...cur, stopped: false } };
  }
  if (!last.stopped) return { msg: { t: 'stop' }, sent: { ...last, stopped: true } };
  return { msg: null, sent: last };
}

/** 머리 위 말풍선을 보이는 시간 */
export const BUBBLE_MS = 5000;
/** 입력 중 표시를 끄라는 소식이 없어도 이 시간이 지나면 끈다(끊김·창 닫힘 대비) */
export const TYPING_MS = 6000;

export type Bubble = { kind: 'chat'; text: string } | { kind: 'typing' };

/**
 * 다른 플레이어 머리 위에 그릴 것. 최근 채팅이 있으면 그 말풍선, 아니면 입력 중이면 "…", 둘 다 아니면 null.
 * @param said 마지막으로 받은 채팅과 받은 시각
 * @param typingAt 입력 중 표시를 켠 시각(꺼졌으면 null)
 */
export function bubbleOf(said: { text: string; at: number } | null, typingAt: number | null, now: number): Bubble | null {
  if (said && now - said.at < BUBBLE_MS) return { kind: 'chat', text: said.text };
  if (typingAt !== null && now - typingAt < TYPING_MS) return { kind: 'typing' };
  return null;
}

/** 내 캐릭터의 방치 시간 추적 — 위치를 읽을 때마다 갱신한다 */
export interface MyIdle { spot: Spot; movedAt: number; moving: boolean }

/** 읽은 위치로 다음 추적 상태를 정한다. 위치가 바뀐 읽기는 이동 중이고, 같은 위치가 이어지면 멈춘 것이다 */
export function nextMyIdle(prev: MyIdle | null, spot: Spot, now: number): MyIdle {
  const movedAt = movedAtOf(prev?.spot ?? null, prev?.movedAt ?? 0, spot, now);
  return { spot: { region: spot.region, x: spot.x, y: spot.y }, movedAt, moving: movedAt === now };
}

/** 머리 위에 그릴 방치 시간. 이동 중이거나 시각을 모르면 null이다 */
export function idleLabel(movedAt: number | null, moving: boolean, now: number): string | null {
  return movedAt === null || moving ? null : formatIdle(now - movedAt);
}
