// 요청 수 제한 — 키(접속 주소 등)마다 고정 창 안의 요청 수를 센다.
// 단일 프로세스(createRateLimiter)와 Redis 공유(createSharedRateLimiter)를 제공한다.
import type { IncomingMessage } from 'node:http';
import { getRedisClient, warnRedisOnce } from './redisClient.js';

export interface RateLimiter {
  /** 이번 요청을 받아도 되는가. 받으면 센다 */
  take(key: string, now: number): boolean;
  /** 거부 시 남은 창 시간(초 올림, 최소 1초) */
  retryAfterSec(key: string, now: number): number;
}

export function createRateLimiter(opts: { windowMs: number; max: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key, now) {
      const w = windows.get(key);
      if (!w || now - w.start >= opts.windowMs) {
        // 창이 바뀔 때 끝난 창을 함께 비워 키가 쌓이지 않게 한다
        for (const [k, v] of windows) if (now - v.start >= opts.windowMs) windows.delete(k);
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      if (w.count >= opts.max) return false;
      w.count += 1;
      return true;
    },
    retryAfterSec(key, now) {
      const w = windows.get(key);
      if (!w || now - w.start >= opts.windowMs) return 1;
      return Math.max(1, Math.ceil((opts.windowMs - (now - w.start)) / 1000));
    },
  };
}

export interface RedisPipelineLike {
  incr(key: string): RedisPipelineLike;
  pexpire(key: string, ms: number): RedisPipelineLike;
  exec(): Promise<[Error | null, unknown][] | null>;
}

export interface RedisRateLimitClient {
  status?: string;
  pipeline(): RedisPipelineLike;
}

export interface SharedRateLimiterOptions {
  prefix: string;
  windowMs: number;
  max: number;
  env?: string;
  client?: RedisRateLimitClient | null;
}

export interface SharedRateLimiter {
  check(key: string, now?: number): Promise<{ allowed: boolean; retryAfterSec: number }>;
}

export interface RedisSlidingRateLimitClient {
  status?: string;
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export interface SharedSlidingRateLimiterOptions {
  prefix: string;
  windowMs: number;
  max: number;
  env?: string;
  client?: RedisSlidingRateLimitClient | null;
}

export interface RedisCooldownClient {
  status?: string;
  get(key: string): Promise<string | null>;
  psetex(key: string, milliseconds: number, value: string): Promise<unknown>;
}

export interface SharedCooldownOptions {
  prefix: string;
  cooldownMs: number;
  env?: string;
  client?: RedisCooldownClient | null;
}

export interface SharedCooldown {
  check(key: string, now?: number): Promise<{ allowed: boolean; retryAfterMs: number }>;
  record(key: string, savedAt?: number): Promise<void>;
}

function resolveEnv(explicit?: string): string {
  return (explicit ?? process.env.DEPLOY_ENV ?? 'local').trim().toLowerCase() || 'local';
}

const SLIDING_RATE_LIMIT_LUA = `
local key = KEYS[1]
local cutoff = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local member = ARGV[3]
local max = tonumber(ARGV[4])
local windowMs = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2]) or now
  return { 0, math.max(1, oldestScore + windowMs - now) }
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
return { 1, 0 }
`;

/**
 * Redis Sorted Set(ZREMRANGEBYSCORE + ZCARD + ZADD + PEXPIRE) Lua 기반 공유 슬라이딩 윈도우 제한기.
 * Redis 미설정·미연결·오류 시 프로세스 내 타임스탬프 배열로 폴백한다(Fail-open).
 */
export function createSharedSlidingRateLimiter(opts: SharedSlidingRateLimiterOptions): SharedRateLimiter {
  const localWindows = new Map<string, number[]>();
  const env = resolveEnv(opts.env);
  let memberSeq = 0;

  const checkLocal = (key: string, now: number): { allowed: boolean; retryAfterSec: number } => {
    const prev = localWindows.get(key) ?? [];
    const window = prev.filter(t => now - t < opts.windowMs);
    if (window.length >= opts.max) {
      if (window.length === 0) localWindows.delete(key);
      else localWindows.set(key, window);
      const oldest = window[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    }
    for (const [k, ts] of localWindows) {
      if (k !== key && ts.every(t => now - t >= opts.windowMs)) {
        localWindows.delete(k);
      }
    }
    localWindows.set(key, [...window, now]);
    return { allowed: true, retryAfterSec: 0 };
  };

  return {
    async check(key: string, now = Date.now()): Promise<{ allowed: boolean; retryAfterSec: number }> {
      const client = opts.client !== undefined ? opts.client : getRedisClient();
      if (!client || (client.status !== undefined && client.status !== 'ready')) {
        return checkLocal(key, now);
      }
      const redisKey = `pf:${env}:rl:${opts.prefix}:${key}`;
      const cutoff = now - opts.windowMs;
      const member = `${now}:${++memberSeq}`;
      try {
        const res = await client.eval(
          SLIDING_RATE_LIMIT_LUA,
          1,
          redisKey,
          cutoff,
          now,
          member,
          opts.max,
          opts.windowMs,
        );
        if (!Array.isArray(res) || res.length < 2) {
          return checkLocal(key, now);
        }
        const allowed = Number(res[0]) === 1;
        if (allowed) return { allowed: true, retryAfterSec: 0 };
        const retryAfterMs = Number(res[1]);
        const retryAfterSec = Number.isFinite(retryAfterMs)
          ? Math.max(1, Math.ceil(retryAfterMs / 1000))
          : 1;
        return { allowed: false, retryAfterSec };
      } catch (err) {
        warnRedisOnce('sliding-rate-limit', err);
        return checkLocal(key, now);
      }
    },
  };
}

/**
 * 비변경 조회(GET)와 성공 후 기록(PSETEX)을 분리한 공유 쿨다운 제한기.
 * Redis 미설정·미연결·오류 시 프로세스 내 타임스탬프 맵으로 폴백한다(Fail-open).
 */
export function createSharedCooldown(opts: SharedCooldownOptions): SharedCooldown {
  const localTimestamps = new Map<string, number>();
  const env = resolveEnv(opts.env);

  const checkLocal = (key: string, now: number): { allowed: boolean; retryAfterMs: number } => {
    const lastAt = localTimestamps.get(key);
    if (lastAt === undefined || !Number.isFinite(lastAt)) {
      return { allowed: true, retryAfterMs: 0 };
    }
    const elapsed = now - lastAt;
    if (elapsed >= opts.cooldownMs) {
      localTimestamps.delete(key);
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: Math.max(1, opts.cooldownMs - elapsed) };
  };

  const recordLocal = (key: string, savedAt: number): void => {
    for (const [k, ts] of localTimestamps) {
      if (k !== key && savedAt - ts >= opts.cooldownMs) {
        localTimestamps.delete(k);
      }
    }
    localTimestamps.set(key, savedAt);
  };

  return {
    async check(key: string, now = Date.now()): Promise<{ allowed: boolean; retryAfterMs: number }> {
      const client = opts.client !== undefined ? opts.client : getRedisClient();
      if (!client || (client.status !== undefined && client.status !== 'ready')) {
        return checkLocal(key, now);
      }
      const redisKey = `pf:${env}:cd:${opts.prefix}:${key}`;
      try {
        const raw = await client.get(redisKey);
        if (raw === null) return { allowed: true, retryAfterMs: 0 };
        const savedAt = Number(raw);
        if (!Number.isFinite(savedAt)) return { allowed: true, retryAfterMs: 0 };
        const elapsed = now - savedAt;
        if (elapsed >= opts.cooldownMs) return { allowed: true, retryAfterMs: 0 };
        return { allowed: false, retryAfterMs: Math.max(1, opts.cooldownMs - elapsed) };
      } catch (err) {
        warnRedisOnce('cooldown-check', err);
        return checkLocal(key, now);
      }
    },

    async record(key: string, savedAt = Date.now()): Promise<void> {
      const client = opts.client !== undefined ? opts.client : getRedisClient();
      if (!client || (client.status !== undefined && client.status !== 'ready')) {
        recordLocal(key, savedAt);
        return;
      }
      const redisKey = `pf:${env}:cd:${opts.prefix}:${key}`;
      try {
        await client.psetex(redisKey, opts.cooldownMs, String(savedAt));
      } catch (err) {
        warnRedisOnce('cooldown-record', err);
        recordLocal(key, savedAt);
      }
    },
  };
}

/**
 * Redis INCR + PEXPIRE 원자 파이프라인 기반 공유 요청 수 제한기.
 * Redis 미설정·미연결·오류 시 프로세스 내 RateLimiter로 폴백한다(Fail-open).
 */
export function createSharedRateLimiter(opts: SharedRateLimiterOptions): SharedRateLimiter {
  const local = createRateLimiter({ windowMs: opts.windowMs, max: opts.max });
  const env = (opts.env ?? process.env.DEPLOY_ENV ?? 'local').trim().toLowerCase() || 'local';

  const checkLocal = (key: string, now: number): { allowed: boolean; retryAfterSec: number } => {
    if (local.take(key, now)) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: local.retryAfterSec(key, now) };
  };

  return {
    async check(key: string, now = Date.now()): Promise<{ allowed: boolean; retryAfterSec: number }> {
      const client = opts.client !== undefined ? opts.client : getRedisClient();
      if (!client || (client.status !== undefined && client.status !== 'ready')) {
        return checkLocal(key, now);
      }

      const bucket = Math.floor(now / opts.windowMs);
      const redisKey = `pf:${env}:rl:${opts.prefix}:${key}:${bucket}`;
      try {
        const pipe = client.pipeline();
        pipe.incr(redisKey);
        pipe.pexpire(redisKey, opts.windowMs);
        const results = await pipe.exec();
        const first = results?.[0];
        if (!first || first[0]) {
          warnRedisOnce('rate-limit-exec', first?.[0] ?? new Error('empty pipeline result'));
          return checkLocal(key, now);
        }
        const count = Number(first[1]);
        if (!Number.isFinite(count)) {
          return checkLocal(key, now);
        }
        if (count > opts.max) {
          const resetAt = (bucket + 1) * opts.windowMs;
          const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
          return { allowed: false, retryAfterSec };
        }
        return { allowed: true, retryAfterSec: 0 };
      } catch (err) {
        warnRedisOnce('rate-limit', err);
        return checkLocal(key, now);
      }
    },
  };
}

/** 요청한 쪽의 주소. 인그레스가 붙인 X-Forwarded-For의 첫 주소를 쓰고, 없으면 소켓 주소다 */
export function clientKey(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}
