import { describe, expect, it, vi } from 'vitest';
import { clientKey, createRateLimiter, createSharedRateLimiter } from './rateLimit.js';

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

describe('공유 요청 수 제한(createSharedRateLimiter)', () => {
  it('Redis 파이프라인(INCR + PEXPIRE)으로 창 내 상한을 초과하면 차단하고 retryAfterSec을 계산한다', async () => {
    const counts = new Map<string, number>();
    const pexpire = vi.fn();
    const incr = vi.fn();
    const mockClient = {
      status: 'ready',
      pipeline() {
        const ops: Array<() => unknown> = [];
        const pipe = {
          incr(key: string) {
            incr(key);
            ops.push(() => {
              const next = (counts.get(key) ?? 0) + 1;
              counts.set(key, next);
              return next;
            });
            return pipe;
          },
          pexpire(key: string, ms: number) {
            pexpire(key, ms);
            ops.push(() => 1);
            return pipe;
          },
          async exec() {
            return ops.map(fn => [null, fn()] as [null, unknown]);
          },
        };
        return pipe;
      },
    };

    const limiter = createSharedRateLimiter({
      prefix: 'guild-invites',
      windowMs: 60_000,
      max: 2,
      env: 'preview',
      client: mockClient,
    });

    expect(await limiter.check('1.2.3.4', 1_000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('1.2.3.4', 2_000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('1.2.3.4', 3_000)).toEqual({ allowed: false, retryAfterSec: 57 });
    expect(pexpire).toHaveBeenCalledWith('pf:preview:rl:guild-invites:1.2.3.4:0', 60_000);
    // 다음 창으로 넘어가면 다시 허용된다
    expect(await limiter.check('1.2.3.4', 60_000)).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it('Redis가 없거나 예외가 발생하면 로컬 폴백으로 동작한다(Fail-open)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const brokenClient = {
      status: 'ready',
      pipeline() {
        return {
          incr() { return this; },
          pexpire() { return this; },
          async exec() { throw new Error('ETIMEDOUT'); },
        };
      },
    };

    const limiter = createSharedRateLimiter({
      prefix: 'client-metrics',
      windowMs: 10_000,
      max: 1,
      client: brokenClient,
    });

    expect(await limiter.check('10.0.0.1', 0)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('10.0.0.1', 500)).toEqual({ allowed: false, retryAfterSec: 10 });
    warnSpy.mockRestore();
  });

  it('Redis 클라이언트가 null이면 로컬 폴백을 사용한다', async () => {
    const limiter = createSharedRateLimiter({
      prefix: 'client-metrics',
      windowMs: 10_000,
      max: 1,
      client: null,
    });
    expect(await limiter.check('10.0.0.2', 0)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('10.0.0.2', 100)).toEqual({ allowed: false, retryAfterSec: 10 });
  });
});
