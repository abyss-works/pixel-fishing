// 실시간 채널 메시지 형식 — 게임 서버와 브라우저가 같은 정의를 쓴다.
// 실시간 채널은 표시용이다. 게임 상태는 액션 경로만 바꾼다.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.

export type Dir = 0 | 1 | 2 | 3;

export type ClientMessage =
  | { t: 'move'; x: number; y: number; dir: Dir; line: boolean } // line: 낚싯줄을 드리운 상태
  | { t: 'stop' }
  | { t: 'chat'; text: string }
  | { t: 'ping' };

export interface Presence { uid: string; nick: string; boat: number; region: string; x: number; y: number; dir: Dir; line: boolean }
export interface ChatLine { id: number; uid: string; nick: string; text: string; at: string }

export type ServerMessage =
  | { t: 'hello'; you: string; others: Presence[]; recentChat: ChatLine[] }
  | { t: 'move'; uid: string; x: number; y: number; dir: Dir; line: boolean }
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
      if (!isCoord(o.x) || !isCoord(o.y) || !isDir(o.dir) || typeof o.line !== 'boolean') return null;
      return { t: 'move', x: o.x, y: o.y, dir: o.dir, line: o.line };
    case 'stop': return { t: 'stop' };
    case 'ping': return { t: 'ping' };
    case 'chat': return typeof o.text === 'string' ? { t: 'chat', text: o.text } : null;
    default: return null;
  }
}
