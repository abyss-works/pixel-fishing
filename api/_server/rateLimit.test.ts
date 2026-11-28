import { describe, expect, it, vi } from 'vitest';
import {
  clientKey,
  createRateLimiter,
  createSharedCooldown,
  createSharedRateLimiter,
  createSharedSlidingRateLimiter,
} from './rateLimit.js';

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

describe('공유 슬라이딩 윈도우 제한(createSharedSlidingRateLimiter)', () => {
  function createMockSlidingRedis() {
    const zsets = new Map<string, Array<{ score: number; member: string }>>();
    const expires = new Map<string, number>();
    return {
      status: 'ready',
      zsets,
      expires,
      async eval(_script: string, _numkeys: number, ...args: (string | number)[]) {
        const key = String(args[0]);
        const cutoff = Number(args[1]);
        const now = Number(args[2]);
        const member = String(args[3]);
        const max = Number(args[4]);
        const windowMs = Number(args[5]);
        const list = (zsets.get(key) ?? []).filter(e => e.score > cutoff);
        if (list.length >= max) {
          zsets.set(key, list);
          const oldest = list[0]?.score ?? now;
          return [0, Math.max(1, oldest + windowMs - now)];
        }
        const next = [...list.filter(e => e.member !== member), { score: now, member }]
          .sort((a, b) => a.score - b.score);
        zsets.set(key, next);
        expires.set(key, windowMs);
        return [1, 0];
      },
    };
  }

  it('경계 버스트를 슬라이딩 윈도우로 차단하고 만료된 시각만 비운다', async () => {
    const client = createMockSlidingRedis();
    const limiter = createSharedSlidingRateLimiter({
      prefix: 'ws-chat',
      windowMs: 10_000,
      max: 2,
      env: 'preview',
      client,
    });

    expect(await limiter.check('u1', 0)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('u1', 9_000)).toEqual({ allowed: true, retryAfterSec: 0 });
    // 10초 창 내 2건 이미 사용 → 거부 (가장 오래된 0ms 기준 500ms 남음 → 1초)
    expect(await limiter.check('u1', 9_500)).toEqual({ allowed: false, retryAfterSec: 1 });
    // 10_000ms 시점에는 0ms 항목만 만료되고 9_000ms 항목은 남아 있음 → 1건 허용 후 다음 즉시 거부
    expect(await limiter.check('u1', 10_000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('u1', 10_100)).toEqual({ allowed: false, retryAfterSec: 9 });
    expect(client.expires.get('pf:preview:rl:ws-chat:u1')).toBe(10_000);
  });

  it('같은 밀리초의 동시 요청도 고유 멤버로 각각 계산한다', async () => {
    const client = createMockSlidingRedis();
    const limiter = createSharedSlidingRateLimiter({
      prefix: 'ws-chat',
      windowMs: 10_000,
      max: 2,
      client,
    });

    expect(await limiter.check('u1', 1_000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('u1', 1_000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('u1', 1_000)).toEqual({ allowed: false, retryAfterSec: 10 });
  });

  it('Redis 오류나 미연결 시 인메모리 슬라이딩 윈도우로 폴백한다(Fail-open)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const brokenClient = {
      status: 'ready',
      async eval() { throw new Error('ECONNREFUSED'); },
    };
    const limiter = createSharedSlidingRateLimiter({
      prefix: 'ws-chat',
      windowMs: 10_000,
      max: 2,
      client: brokenClient,
    });

    expect(await limiter.check('u1', 0)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('u1', 9_000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('u1', 9_500)).toEqual({ allowed: false, retryAfterSec: 1 });
    expect(await limiter.check('u1', 10_000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(await limiter.check('u1', 10_100)).toEqual({ allowed: false, retryAfterSec: 9 });
    warnSpy.mockRestore();
  });
});

describe('공유 쿨다운(createSharedCooldown)', () => {
  it('check는 상태를 변경하지 않고 record(PSETEX) 호출 후에만 쿨다운을 적용한다', async () => {
    const store = new Map<string, { value: string; ttlMs: number }>();
    const psetexSpy = vi.fn();
    const client = {
      status: 'ready',
      async get(key: string) {
        return store.get(key)?.value ?? null;
      },
      async psetex(key: string, ms: number, value: string) {
        psetexSpy(key, ms, value);
        store.set(key, { value, ttlMs: ms });
        return 'OK';
      },
    };

    const cooldown = createSharedCooldown({
      prefix: 'ws-global-cd',
      cooldownMs: 10_000,
      env: 'preview',
      client,
    });

    // record 전에는 check를 여러 번 호출해도 항상 허용되며 PSETEX를 호출하지 않는다
    expect(await cooldown.check('u1', 1_000)).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(await cooldown.check('u1', 2_000)).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(psetexSpy).not.toHaveBeenCalled();

    // 저장 성공 후 record 호출
    await cooldown.record('u1', 2_000);
    expect(psetexSpy).toHaveBeenCalledWith('pf:preview:cd:ws-global-cd:u1', 10_000, '2000');

    expect(await cooldown.check('u1', 3_500)).toEqual({ allowed: false, retryAfterMs: 8_500 });
    expect(await cooldown.check('u1', 12_000)).toEqual({ allowed: true, retryAfterMs: 0 });
  });

  it('Redis 오류나 미연결 시 인메모리 쿨다운으로 폴백한다(Fail-open)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const brokenClient = {
      status: 'ready',
      async get() { throw new Error('ETIMEDOUT'); },
      async psetex() { throw new Error('ETIMEDOUT'); },
    };

    const cooldown = createSharedCooldown({
      prefix: 'ws-global-cd',
      cooldownMs: 10_000,
      client: brokenClient,
    });

    expect(await cooldown.check('u1', 1_000)).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(await cooldown.check('u1', 1_500)).toEqual({ allowed: true, retryAfterMs: 0 });

    await cooldown.record('u1', 1_500);
    expect(await cooldown.check('u1', 4_000)).toEqual({ allowed: false, retryAfterMs: 7_500 });
    expect(await cooldown.check('u1', 11_500)).toEqual({ allowed: true, retryAfterMs: 0 });
    warnSpy.mockRestore();
  });
});
