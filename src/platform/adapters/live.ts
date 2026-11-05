// 실시간 채널 브라우저 연결 — 게임 서버와 같은 오리진의 WebSocket이다. 로그인 쿠키로 인증된다.
// 표시용 채널이라 연결 실패가 플레이를 막지 않는다. 끊기면 대기 시간을 늘려 가며 다시 연결한다.
import {
  LIVE_CLOSE_REPLACED, LIVE_PATH, LIVE_PING_MS,
} from '../../game/rules/live.js';
import type { ClientMessage, ServerMessage } from '../../game/rules/live.js';

export interface LiveConnection {
  /** 연결돼 있을 때만 보낸다. 끊긴 동안의 메시지는 버린다 */
  send(msg: ClientMessage): void;
  /** 연결을 닫고 다시 연결하지 않는다 */
  close(): void;
}

/** 재연결 대기의 처음 값과 상한 */
export const LIVE_RETRY_MIN_MS = 1000;
export const LIVE_RETRY_MAX_MS = 30_000;

type SocketCtor = new (url: string) => WebSocket;

function liveUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${LIVE_PATH}`;
}

/**
 * 실시간 채널에 연결한다.
 * @param onMessage 서버 메시지마다 부른다. 형식이 깨진 메시지는 버린다
 * @param Socket 테스트가 바꿔 넣는 WebSocket 생성자
 */
export function connectLive(
  onMessage: (msg: ServerMessage) => void,
  Socket: SocketCtor = WebSocket,
  url: string = liveUrl(),
): LiveConnection {
  let ws: WebSocket | null = null;
  let closed = false;
  let retryMs = LIVE_RETRY_MIN_MS;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  const open = () => {
    const socket = new Socket(url);
    ws = socket;
    socket.onopen = () => {
      retryMs = LIVE_RETRY_MIN_MS;
      pingTimer = setInterval(() => socket.send(JSON.stringify({ t: 'ping' } satisfies ClientMessage)), LIVE_PING_MS);
    };
    socket.onmessage = (e: MessageEvent) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(String(e.data)) as ServerMessage; } catch { return; }
      onMessage(msg);
    };
    socket.onclose = (e: CloseEvent) => {
      clearInterval(pingTimer);
      ws = null;
      // 같은 계정의 다른 창이 연결을 가져갔다. 다시 붙으면 두 창이 서로 끊는다.
      if (closed || e.code === LIVE_CLOSE_REPLACED) return;
      retryTimer = setTimeout(open, retryMs);
      retryMs = Math.min(retryMs * 2, LIVE_RETRY_MAX_MS);
    };
  };

  open();
  return {
    send(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      ws?.close();
    },
  };
}
