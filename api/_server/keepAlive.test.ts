import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { applyKeepAlive, PROXY_KEEPALIVE_MS, SERVER_HEADERS_TIMEOUT_MS, SERVER_KEEPALIVE_MS } from './keepAlive.js';

describe('applyKeepAlive', () => {
  it('서버의 연결 유지 시간이 프록시 재사용 시간보다 길고, 머리 대기 시간은 그보다 길다', () => {
    const server = createServer();
    applyKeepAlive(server);
    expect(server.keepAliveTimeout).toBe(SERVER_KEEPALIVE_MS);
    expect(server.headersTimeout).toBe(SERVER_HEADERS_TIMEOUT_MS);
    expect(server.keepAliveTimeout).toBeGreaterThan(PROXY_KEEPALIVE_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});
