import { DEFAULT_LOOK } from '../../../game/content/wardrobe';
import type { Look } from '../../../game/content/wardrobe';
import { zoneOfPort } from '../../../game/content/bounties';
import { defaultZoneOfRegion, topZoneOf, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import type { Bob, ChatLine, ChatRoom, ClientMessage, Dir, NoticeItem, Presence, ServerMessage } from '../../../game/rules/live';
import { CHAT_MAX_LENGTH, formatIdle, GLOBAL_CHAT_COOLDOWN_MS, LIVE_STALE_MS } from '../../../game/rules/live';

// 실시간 채널의 다른 플레이어 상태와 내 위치 송신 판정 — 표시용이라 게임 상태와 섞지 않는다.

export type { ChatRoom };
export { CHAT_MAX_LENGTH, GLOBAL_CHAT_COOLDOWN_MS };

export interface OtherPlayer {
  presence: Presence;
  /** 이동 중이면 참 — 정지 알림을 받으면 거짓이 되고, 그동안은 소식이 없어도 반투명으로 그리지 않는다 */
  moving: boolean;
  /** 마지막으로 위치를 받은 시각 */
  lastAt: number;
  /** 방치 시간을 세기 시작한 시각(내 시계, Date.now 기준). 서버가 경과 시간을 싣지 않았으면 null */
  idleSince: number | null;
}

// 서버가 보낸 경과 시간을 받은 시각의 내 시계로 옮긴다. 두 시계를 직접 맞추지 않으므로 시계 차이가 끼지 않고 전송 지연만 남는다
const idleSinceFrom = (idleMs: number | undefined, now: number): number | null => idleMs === undefined ? null : now - idleMs;

/** 서버가 채팅을 거부한 이유 */
export type ChatError = Extract<ServerMessage, { t: 'error' }>['code'];

export interface LiveState {
  you: string | null;
  others: Readonly<Record<string, OtherPlayer>>;
  /** 받은 전체 채팅(오래된 순). 보관 상한을 넘으면 오래된 줄부터 버린다 */
  globalChat: readonly ChatLine[];
  /** 받은 지역 채팅(오래된 순). 보관 상한을 넘으면 오래된 줄부터 버린다 */
  localChat: readonly ChatLine[];
  /** 받은 길드 채팅(오래된 순). 보관 상한을 넘으면 오래된 줄부터 버린다 */
  guildChat: readonly ChatLine[];
  /** 서버에서 받은 마감 전 공지 목록 */
  notices: readonly NoticeItem[];
  /** 서버에서 공지 목록(hello 또는 notices)을 한 번 이상 받았는가 */
  noticesSynced: boolean;
  /** 마지막으로 거부된 내 채팅의 이유. 내 채팅이 저장되면 지운다 */
  chatError: ChatError | null;
  /** 마지막 거부 응답에 담긴 남은 대기 시간(ms) */
  chatErrorRetryAfterMs: number | null;
  /** 전체 채팅 재전송 가능 시각(epoch ms) */
  globalCooldownUntil: number;
}

export const EMPTY_LIVE: LiveState = {
  you: null,
  others: {},
  globalChat: [],
  localChat: [],
  guildChat: [],
  notices: [],
  noticesSynced: false,
  chatError: null,
  chatErrorRetryAfterMs: null,
  globalCooldownUntil: 0,
};

/** 화면에 남기는 채팅 줄 수 */
export const CHAT_KEEP = 200;

/** 씬과 현재 해역에서 실시간 지역 채팅용 최상위 지역 ID를 도출한다. */
export function resolveLiveRegion(
  scene: { kind: 'region' | 'base'; id: string },
  spotZone: string | null | undefined,
): string {
  if (scene.kind === 'base') {
    if (scene.id === 'home') return 'village';
    return zoneOfPort(scene.id) ?? defaultZoneOfRegion('world');
  }
  if (scene.id === 'village') return 'village';
  if (scene.id === 'championship') return 'championship';
  if (spotZone && zoneById(spotZone as ZoneId)) return topZoneOf(spotZone as ZoneId);
  return defaultZoneOfRegion('world');
}

const roomStateKey = (room: ChatRoom | undefined): 'globalChat' | 'localChat' | 'guildChat' => {
  const resolved = room ?? 'local';
  if (resolved === 'global') return 'globalChat';
  if (resolved === 'guild') return 'guildChat';
  return 'localChat';
};

/** 서버 메시지 하나를 반영한 새 상태. 상태가 그대로면 같은 객체를 돌려준다 */
export function applyLiveMessage(state: LiveState, msg: ServerMessage, now: number): LiveState {
  switch (msg.t) {
    case 'hello':
      return {
        you: msg.you,
        others: Object.fromEntries(msg.others.map(p => [p.uid, { presence: p, moving: false, lastAt: now, idleSince: idleSinceFrom(p.idleMs, now) }])),
        globalChat: msg.recentChat.slice(-CHAT_KEEP),
        localChat: (msg.recentLocalChat ?? []).slice(-CHAT_KEEP),
        guildChat: (msg.recentGuildChat ?? []).slice(-CHAT_KEEP),
        notices: msg.notices ?? [],
        noticesSynced: true,
        chatError: null,
        chatErrorRetryAfterMs: null,
        globalCooldownUntil: state.globalCooldownUntil,
      };
    case 'localHistory':
      return {
        ...state,
        localChat: msg.lines.slice(-CHAT_KEEP),
      };
    case 'notices':
      return {
        ...state,
        notices: msg.notices,
        noticesSynced: true,
      };
    case 'chat': {
      const key = roomStateKey(msg.room);
      if (state[key].some(l => l.id === msg.line.id)) return state;
      const isMine = msg.line.uid === state.you;
      const nextCooldownUntil = isMine && msg.room === 'global'
        ? Math.max(state.globalCooldownUntil, now + GLOBAL_CHAT_COOLDOWN_MS)
        : state.globalCooldownUntil;
      return {
        ...state,
        [key]: [...state[key], msg.line].slice(-CHAT_KEEP),
        chatError: isMine ? null : state.chatError,
        chatErrorRetryAfterMs: isMine ? null : state.chatErrorRetryAfterMs,
        globalCooldownUntil: nextCooldownUntil,
      };
    }
    case 'error': {
      const nextCooldownUntil =
        msg.code === 'chat-global-cooldown' && typeof msg.retryAfterMs === 'number' && Number.isFinite(msg.retryAfterMs)
          ? now + Math.max(0, msg.retryAfterMs)
          : state.globalCooldownUntil;
      return {
        ...state,
        chatError: msg.code,
        chatErrorRetryAfterMs: msg.retryAfterMs ?? null,
        globalCooldownUntil: nextCooldownUntil,
      };
    }
    case 'join':
      if (msg.presence.uid === state.you) return state;
      return { ...state, others: { ...state.others, [msg.presence.uid]: { presence: msg.presence, moving: false, lastAt: now, idleSince: idleSinceFrom(msg.presence.idleMs, now) } } };
    case 'move': {
      const prev = state.others[msg.uid];
      if (!prev) return state;
      const { region, zone, x, y, dir, line, bob, look } = msg;
      return { ...state, others: { ...state.others,
        [msg.uid]: { presence: { ...prev.presence, region, zone: zone ?? null, x, y, dir, line, bob, ...(look ? { look } : {}) }, moving: true, lastAt: now, idleSince: idleSinceFrom(msg.idleMs, now) } } };
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
    case 'nick': {
      const prev = state.others[msg.uid];
      const nextOther = prev && prev.presence.nick !== msg.nick
        ? { ...prev, presence: { ...prev.presence, nick: msg.nick } }
        : null;
      const globalChanged = state.globalChat.some(l => l.uid === msg.uid && l.nick !== msg.nick);
      const localChanged = state.localChat.some(l => l.uid === msg.uid && l.nick !== msg.nick);
      const guildChanged = state.guildChat.some(l => l.uid === msg.uid && l.nick !== msg.nick);
      if (!nextOther && !globalChanged && !localChanged && !guildChanged) return state;
      return {
        ...state,
        ...(nextOther ? { others: { ...state.others, [msg.uid]: nextOther } } : {}),
        ...(globalChanged ? { globalChat: state.globalChat.map(l => l.uid === msg.uid ? { ...l, nick: msg.nick } : l) } : {}),
        ...(localChanged ? { localChat: state.localChat.map(l => l.uid === msg.uid ? { ...l, nick: msg.nick } : l) } : {}),
        ...(guildChanged ? { guildChat: state.guildChat.map(l => l.uid === msg.uid ? { ...l, nick: msg.nick } : l) } : {}),
      };
    }
    default:
      return state;
  }
}

/** 차단한 사람의 채팅 줄을 세 방에서 지운 상태. 이후 줄은 서버가 보내지 않는다 */
export function withoutAuthor(state: LiveState, uid: string): LiveState {
  return {
    ...state,
    globalChat: state.globalChat.filter(l => l.uid !== uid),
    localChat: state.localChat.filter(l => l.uid !== uid),
    guildChat: state.guildChat.filter(l => l.uid !== uid),
  };
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

export type PlayerListSort = 'fame' | 'name';

export const PLAYER_LIST_SORT_OPTIONS: readonly { value: PlayerListSort; label: string }[] = [
  { value: 'fame', label: '명성순' },
  { value: 'name', label: '가나다순' },
];

export interface PlayerListItem {
  uid: string;
  nick: string;
  boat: number;
  boatTierLabel: string;
  fame: number;
  look: Look;
  zoneLabel: string | null;
}

/** 배 단계를 목록 카드용 짧은 티어 표기(`T1`–`T9`, 0단계 이하는 `도보`)로 바꾼다 */
export function boatTierLabel(boat: number): string {
  if (!Number.isFinite(boat) || boat < 1) return '도보';
  return `T${Math.trunc(boat)}`;
}

/** 접속자 목록을 정렬한다 (`명성순`: 명성 내림차순·동률 시 가나다순 / `가나다순`: 한국어 로캘 오름차순) */
export function sortPlayers<T extends { uid: string; nick: string; fame: number }>(
  players: readonly T[],
  sort: PlayerListSort = 'fame',
): T[] {
  const copy = players.slice();
  copy.sort((a, b) => {
    if (sort === 'fame' && b.fame !== a.fame) return b.fame - a.fame;
    const nickCmp = a.nick.localeCompare(b.nick, 'ko');
    if (nickCmp !== 0) return nickCmp;
    return a.uid.localeCompare(b.uid);
  });
  return copy;
}

/** 검색어로 접속자 목록을 대소문자 무시 부분 일치 필터링한다 */
export function filterPlayers<T extends { nick: string }>(players: readonly T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return players.slice();
  return players.filter(p => p.nick.toLocaleLowerCase().includes(normalized));
}

/** 검색어 필터와 정렬 기준을 적용한 접속자 목록을 돌려준다 */
export function selectPlayerList<T extends { uid: string; nick: string; fame: number }>(
  players: readonly T[],
  { query = '', sort = 'fame' }: { query?: string; sort?: PlayerListSort } = {},
): T[] {
  return sortPlayers(filterPlayers(players, query), sort);
}

/** 그 바다의 다른 플레이어 목록 뷰 모델을 기본 정렬(`명성순`)로 파생한다 */
export function selectPlayersInRegion(state: LiveState, region: string): PlayerListItem[] {
  const items: PlayerListItem[] = Object.values(state.others)
    .filter(o => o.presence.region === region)
    .map(o => {
      const { presence } = o;
      const fame = Number.isFinite(presence.fame) ? presence.fame : 0;
      return {
        uid: presence.uid,
        nick: presence.nick,
        boat: presence.boat,
        boatTierLabel: boatTierLabel(presence.boat),
        fame,
        look: presence.look ?? DEFAULT_LOOK,
        zoneLabel: playerZoneLabel(presence),
      };
    });
  return sortPlayers(items, 'fame');
}

/** 실시간 접속자 목록 행에 표시할 짧은 위치 이름 */
export function playerZoneLabel(presence: Pick<Presence, 'region' | 'zone'>): string | null {
  if (presence.zone) {
    const z = zoneById(presence.zone as ZoneId);
    if (z) return z.shortName;
  }
  if (presence.region === 'village') return '마을';
  if (presence.region === 'championship') return zoneById('championship')?.shortName ?? '분지 호수';
  if (presence.region === 'world') return '바다';
  return null;
}

/** 마지막으로 보낸 내 위치 */
export interface SentPosition extends MyPosition { stopped: boolean }

/** 내 위치와 외형. idleMs는 이번 던짐의 첫 결과 뒤 지난 시간이고, 결과 전이거나 줄이 없으면 없다. bob은 낚싯줄을 드리운 동안의 찌 위치이고, 드리우지 않았으면 null이다 */
export interface MyPosition { region: string; zone: string | null; x: number; y: number; line: boolean; bob: Bob | null; look: Look; idleMs?: number }

const sameLook = (a: Look, b: Look) => a.shirt === b.shirt && a.pants === b.pants && a.hat === b.hat;

const dirOf = (dx: number, dy: number): Dir =>
  Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : 3) : (dy >= 0 ? 2 : 0);

/**
 * 송신 주기마다 무엇을 보낼지 정한다. 위치·바다·낚싯줄이 바뀌었으면 move, 그대로인데 직전에 움직였으면 stop 한 번,
 * 그 밖에는 보내지 않는다.
 * @returns 보낼 메시지와 그 뒤의 '마지막으로 보낸 위치'. 보낼 것이 없으면 메시지는 null이다
 */
export function nextPositionMessage(last: SentPosition | null, cur: MyPosition): { msg: ClientMessage | null; sent: SentPosition | null } {
  const changed = !last || (last.idleMs === undefined) !== (cur.idleMs === undefined) || last.region !== cur.region || last.zone !== cur.zone || last.x !== cur.x || last.y !== cur.y
    || last.line !== cur.line || last.bob?.x !== cur.bob?.x || last.bob?.y !== cur.bob?.y || !sameLook(last.look, cur.look);
  if (changed) {
    const dir = last ? dirOf(cur.x - last.x, cur.y - last.y) : 2;
    const { bob, look, idleMs, ...pos } = cur;
    // 외형은 처음과 바뀐 때만 싣는다
    const lookChanged = !last || !sameLook(last.look, look);
    return { msg: { t: 'move', ...pos, dir, ...(bob ? { bob } : {}), ...(idleMs !== undefined ? { idleMs } : {}), ...(lookChanged ? { look } : {}) }, sent: { ...cur, stopped: false } };
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

/** 머리 위에 그릴 방치 시간. 세기 시작한 시각을 모르면 null이다 */
export function idleLabel(since: number | null, now: number): string | null {
  return since === null ? null : formatIdle(now - since);
}
