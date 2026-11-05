// 프록시 뒤 연결 유지 시간 — ingress-nginx는 업스트림 연결을 최대 60초까지 재사용한다.
// 서버가 그보다 먼저 놀던 연결을 닫으면, 닫히는 순간 nginx가 같은 연결로 보낸 요청이 502가 된다.
// 그래서 서버의 연결 유지 시간을 프록시보다 길게 두어 연결을 닫는 쪽이 항상 프록시가 되게 한다.
import type { Server } from 'node:http';

/** 프록시(ingress-nginx)의 업스트림 연결 재사용 시간 */
export const PROXY_KEEPALIVE_MS = 60_000;
/** 서버의 연결 유지 시간 — 프록시보다 길다 */
export const SERVER_KEEPALIVE_MS = 65_000;
/** 요청 머리를 기다리는 시간 — 연결 유지 시간보다 길어야 Node가 먼저 끊지 않는다 */
export const SERVER_HEADERS_TIMEOUT_MS = 66_000;

export function applyKeepAlive(server: Server): void {
  server.keepAliveTimeout = SERVER_KEEPALIVE_MS;
  server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
}
