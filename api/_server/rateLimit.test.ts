import { describe, expect, it } from 'vitest';
import { clientKey, createRateLimiter } from './rateLimit.js';

describe('요청 수 제한', () => {
  it('창 안에서는 상한까지만 받고, 창이 지나면 다시 받는다', () => {
    const limit = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(limit.take('a', 0)).toBe(true);
    expect(limit.take('a', 10)).toBe(true);
    expect(limit.take('a', 20)).toBe(false);
    expect(limit.retryAfterSec('a', 20)).toBe(1);
    expect(limit.take('b', 20)).toBe(true);
    expect(limit.take('a', 1000)).toBe(true);
  });

  it('retryAfterSec은 남은 창 시간을 초 단위로 올림하고 최소 1초를 돌려준다', () => {
    const limit = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limit.take('a', 1000)).toBe(true);
    expect(limit.take('a', 2000)).toBe(false);
    expect(limit.retryAfterSec('a', 2000)).toBe(59);
    expect(limit.retryAfterSec('a', 60_500)).toBe(1);
  });

  it('주소는 X-Forwarded-For의 첫 주소, 없으면 소켓 주소다', () => {
    expect(clientKey({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.9' } } as never)).toBe('1.2.3.4');
    expect(clientKey({ headers: {}, socket: { remoteAddress: '10.0.0.9' } } as never)).toBe('10.0.0.9');
  });
});
