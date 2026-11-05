// 실시간 채널 메시지 형식 — 게임 서버와 브라우저가 같은 정의를 쓴다.
// 실시간 채널은 표시용이다. 게임 상태는 액션 경로만 바꾼다.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.

export type Dir = 0 | 1 | 2 | 3;

export type ClientMessage =
  | { t: 'move'; region: string; x: number; y: number; dir: Dir; line: boolean } // region: 지금 있는 바다, line: 낚싯줄을 드리운 상태
  | { t: 'stop' }
  | { t: 'chat'; text: string }
  | { t: 'ping' };

export interface Presence { uid: string; nick: string; boat: number; region: string; x: number; y: number; dir: Dir; line: boolean }
export interface ChatLine { id: number; uid: string; nick: string; text: string; at: string }

export type ServerMessage =
  | { t: 'hello'; you: string; others: Presence[]; recentChat: ChatLine[] }
  | { t: 'move'; uid: string; region: string; x: number; y: number; dir: Dir; line: boolean }
  | { t: 'stop'; uid: string }
  | { t: 'join'; presence: Presence }
  | { t: 'leave'; uid: string }
  | { t: 'chat'; line: ChatLine }
  | { t: 'error'; code: 'chat-guest' | 'chat-rate' | 'chat-length' | 'chat-restricted' };

/** WebSocket 경로. 게임 서버와 같은 오리진이다 */
export const LIVE_PATH = '/api/live';
/** 클라이언트가 접속 확인(ping)을 보내는 주기 */
export const LIVE_PING_MS = 30_000;
/** 이 시간 동안 받은 메시지가 없으면 서버가 연결을 끊는다 */
export const LIVE_IDLE_MS = 90_000;
/** 연결 하나가 1초에 보낼 수 있는 메시지 수. 넘으면 서버가 연결을 끊는다 */
export const LIVE_MAX_PER_SEC = 15;
/** 메시지 원문 하나의 최대 길이(문자 수). 채팅 100자를 담고도 남는다 */
export const LIVE_MAX_LENGTH = 1024;
/** 서버 재시작으로 닫는 연결의 종료 코드(RFC 6455 1012). 클라이언트는 다시 연결한다 */
export const LIVE_CLOSE_RESTART = 1012;
/** 같은 계정의 새 연결이 들어와 이전 연결을 닫는 종료 코드. 닫힌 쪽은 다시 연결하지 않는다 */
export const LIVE_CLOSE_REPLACED = 4000;

const isCoord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDir = (v: unknown): v is Dir => v === 0 || v === 1 || v === 2 || v === 3;
const isRegion = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,32}$/.test(v);

/**
 * 클라이언트 메시지 원문을 검사한다. 서버가 신뢰 경계에서 쓴다.
 * @returns 형식에 맞으면 필요한 필드만 담은 메시지, 아니면 null
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > LIVE_MAX_LENGTH) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'move':
      if (!isRegion(o.region) || !isCoord(o.x) || !isCoord(o.y) || !isDir(o.dir) || typeof o.line !== 'boolean') return null;
      return { t: 'move', region: o.region, x: o.x, y: o.y, dir: o.dir, line: o.line };
    case 'stop': return { t: 'stop' };
    case 'ping': return { t: 'ping' };
    case 'chat': return typeof o.text === 'string' ? { t: 'chat', text: o.text } : null;
    default: return null;
  }
}

/** 채팅 한 메시지의 최대 길이(문자 수, 앞뒤 공백을 지운 뒤) */
export const CHAT_MAX_LENGTH = 100;
/** 채팅 도배 판정의 슬라이딩 윈도우 길이 */
export const CHAT_RATE_WINDOW_MS = 10_000;
/** 슬라이딩 윈도우 안에서 계정 하나가 보낼 수 있는 메시지 수 */
export const CHAT_RATE_MAX = 25;
/** 연결 직후 hello에 싣는 최근 대화 수 */
export const CHAT_RECENT = 50;

/** 보낼 채팅 본문. 앞뒤 공백을 지운 뒤 1~100자가 아니면 null이다 */
export function chatText(raw: string): string | null {
  const text = raw.trim();
  const length = [...text].length;
  return length >= 1 && length <= CHAT_MAX_LENGTH ? text : null;
}

/**
 * 슬라이딩 윈도우 도배 판정. 최근 10초 안에 보낸 메시지가 25개면 거부한다.
 * @param sentAt 지금까지 보낸 시각(오름차순)
 * @returns 보낼 수 있는지와, 창 안의 기록만 남긴 다음 기록(허용이면 now를 더한다)
 */
export function chatRate(sentAt: readonly number[], now: number): { ok: boolean; window: number[] } {
  const window = sentAt.filter(t => now - t < CHAT_RATE_WINDOW_MS);
  if (window.length >= CHAT_RATE_MAX) return { ok: false, window };
  return { ok: true, window: [...window, now] };
}

/** 이동 중 위치 송신 주기(5Hz). 보간이 사이를 메우므로 더 자주 보낼 필요가 없다 */
export const LIVE_MOVE_MS = 200;
/** 이동 중인 플레이어에게서 이 시간 동안 받은 것이 없으면 반투명으로 그린다 */
export const LIVE_STALE_MS = 3000;
// 보간 시간 상수 — 송신 주기(200ms) 안에 목표까지 대부분 다가가게 한다
const FOLLOW_TAU_MS = 120;
// 이보다 먼 목표는 보간하지 않고 바로 옮긴다(지역 이동·재접속)
const SNAP_DISTANCE = 160;

/**
 * 받은 좌표를 향해 한 프레임만큼 다가간 위치. 순간이동하지 않고 매 프레임 일정 비율로 좁힌다.
 * @param dtMs 직전 프레임과의 간격
 */
export function followTarget(from: { x: number; y: number }, to: { x: number; y: number }, dtMs: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) > SNAP_DISTANCE) return { x: to.x, y: to.y };
  const k = 1 - Math.exp(-Math.max(dtMs, 0) / FOLLOW_TAU_MS);
  return { x: from.x + dx * k, y: from.y + dy * k };
}
