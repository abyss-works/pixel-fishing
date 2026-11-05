// 실시간 채널 — 게임 서버의 HTTP 업그레이드를 받아 WebSocket 연결을 관리한다.
// 채널은 전체 하나이고 상태는 이 프로세스 메모리에만 있다. 서버 파드가 하나라는 전제다.
// 표시용 채널이라 게임 상태를 바꾸지 않는다.
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import {
  LIVE_CLOSE_REPLACED, LIVE_CLOSE_RESTART, LIVE_IDLE_MS, LIVE_MAX_PER_SEC, LIVE_PATH, LIVE_PING_MS,
  parseClientMessage,
} from '../../src/game/rules/live.js';
import type { Presence, ServerMessage } from '../../src/game/rules/live.js';

/** 연결한 사용자 — 표시 이름과 배는 서버가 DB에서 읽는다. 클라이언트가 보낸 값을 믿지 않는다 */
export interface LiveUser { uid: string; nick: string; boat: number }

export interface LiveOptions {
  /** 업그레이드 요청의 로그인 사용자. 세션이 없으면 null을 돌려준다 */
  authenticate: (req: IncomingMessage) => Promise<LiveUser | null>;
  /** 허용하는 `Origin` 헤더 값(서비스 주소의 origin) */
  origin: string;
  /** 서버 ping과 무응답 정리 주기. 기본값은 접속 확인 주기다 */
  sweepMs?: number;
  /** 받은 메시지가 없을 때 연결을 끊기까지의 시간 */
  idleMs?: number;
}

export interface LiveServer {
  /** 그 사용자의 접속 상태. 연결돼 있지 않거나 아직 위치를 보내지 않았으면 null */
  presenceOf(uid: string): Presence | null;
  /** 열린 연결을 재시작 코드로 닫고 정리 주기를 멈춘다 */
  close(): void;
}

interface Conn {
  user: LiveUser;
  /** 첫 위치를 받기 전에는 null — 다른 사람에게 알리지 않는다 */
  presence: Presence | null;
  lastSeen: number;
  windowStart: number;
  windowCount: number;
}

// 정책 위반 종료 코드(RFC 6455 1008)
const CLOSE_POLICY = 1008;
// 메시지 하나의 최대 바이트. 형식 검사의 길이 상한보다 넉넉하다
const MAX_PAYLOAD = 4096;

function reject(socket: Duplex, status: 401 | 403 | 500): void {
  const text = { 401: 'Unauthorized', 403: 'Forbidden', 500: 'Internal Server Error' }[status];
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** HTTP 서버에 실시간 채널을 붙인다 */
export function attachLive(server: Server, opts: LiveOptions): LiveServer {
  const idleMs = opts.idleMs ?? LIVE_IDLE_MS;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  const conns = new Map<WebSocket, Conn>();

  const send = (ws: WebSocket, msg: ServerMessage) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
  const broadcast = (from: WebSocket, msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const ws of conns.keys()) if (ws !== from && ws.readyState === WebSocket.OPEN) ws.send(data);
  };
  // 연결을 목록에서 빼고, 이미 알린 사람이면 떠났다고 알린다
  const drop = (ws: WebSocket, conn: Conn) => {
    if (conns.get(ws) !== conn) return;
    conns.delete(ws);
    if (conn.presence) broadcast(ws, { t: 'leave', uid: conn.user.uid });
  };

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== LIVE_PATH) { socket.destroy(); return; }
    if (req.headers.origin !== opts.origin) { reject(socket, 403); return; }
    opts.authenticate(req).then((user) => {
      if (!user) { reject(socket, 401); return; }
      wss.handleUpgrade(req, socket, head, (ws) => {
        // 계정 하나에 연결 하나다. 새 연결이 오면 같은 계정의 이전 연결을 닫는다.
        for (const [other, c] of conns) {
          if (c.user.uid !== user.uid) continue;
          drop(other, c);
          other.close(LIVE_CLOSE_REPLACED);
        }
        const now = Date.now();
        const conn: Conn = { user, presence: null, lastSeen: now, windowStart: now, windowCount: 0 };
        conns.set(ws, conn);
        ws.on('message', (data, isBinary) => {
          const at = Date.now();
          if (at - conn.windowStart >= 1000) { conn.windowStart = at; conn.windowCount = 0; }
          if (++conn.windowCount > LIVE_MAX_PER_SEC) { ws.close(CLOSE_POLICY); return; }
          conn.lastSeen = at;
          if (isBinary) return;
          const msg = parseClientMessage(data.toString());
          if (msg?.t === 'move') {
            const { region, x, y, dir, line } = msg;
            if (!conn.presence) {
              conn.presence = { uid: user.uid, nick: user.nick, boat: user.boat, region, x, y, dir, line };
              broadcast(ws, { t: 'join', presence: conn.presence });
            } else {
              Object.assign(conn.presence, { region, x, y, dir, line });
              broadcast(ws, { t: 'move', uid: user.uid, region, x, y, dir, line });
            }
          } else if (msg?.t === 'stop' && conn.presence) {
            broadcast(ws, { t: 'stop', uid: user.uid });
          }
        });
        ws.on('close', () => drop(ws, conn));
        ws.on('error', () => { ws.terminate(); });
        const others = [...conns.values()].flatMap(c => (c !== conn && c.presence ? [c.presence] : []));
        send(ws, { t: 'hello', you: user.uid, others, recentChat: [] });
      });
    }).catch((err: unknown) => {
      console.error('[live] upgrade authentication failed', err);
      reject(socket, 500);
    });
  });

  // 서버 ping은 프록시가 유휴 연결을 끊지 않게 한다. 클라이언트 ping이 끊긴 연결은 정리한다.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ws, c] of conns) {
      if (now - c.lastSeen > idleMs) ws.terminate();
      else ws.ping();
    }
  }, opts.sweepMs ?? LIVE_PING_MS);
  timer.unref();

  return {
    presenceOf(uid) {
      for (const c of conns.values()) if (c.user.uid === uid) return c.presence;
      return null;
    },
    close() {
      clearInterval(timer);
      for (const ws of conns.keys()) ws.close(LIVE_CLOSE_RESTART);
    },
  };
}
