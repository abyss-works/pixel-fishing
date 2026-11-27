// Redis / Valkey 연결 래퍼 — Fail-open 원칙을 따른다.
// REDIS_URL이 비어 있거나 연결이 끊겨도 예외를 던지지 않고 null 또는 폴백으로 동작한다.
import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';

const CONNECT_TIMEOUT_MS = 1500;
const COMMAND_TIMEOUT_MS = 1000;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 10_000;
const WARN_INTERVAL_MS = 30_000;

let lastWarnAtMs = 0;

/** Redis 경고 로그가 폭주하지 않도록 간격을 제한해 남긴다 */
export function warnRedisOnce(context: string, err?: unknown, nowMs = Date.now()): void {
  if (lastWarnAtMs !== 0 && nowMs - lastWarnAtMs < WARN_INTERVAL_MS) return;
  lastWarnAtMs = nowMs;
  const message = err instanceof Error ? err.message : err ? String(err) : 'unavailable';
  console.warn(`[redis] ${context}: ${message}`);
}

export function redisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.REDIS_URL?.trim();
  return raw ? raw : null;
}

const BASE_OPTIONS: RedisOptions = {
  lazyConnect: true,
  connectTimeout: CONNECT_TIMEOUT_MS,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (times: number) => Math.min(times * RETRY_BASE_MS, RETRY_MAX_MS),
};

let singleton: Redis | null = null;
let singletonUrl: string | null = null;

/** 공유 명령용 Redis 클라이언트를 돌려준다. REDIS_URL이 없으면 null이다 */
export function getRedisClient(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  if (singleton && singletonUrl === url) return singleton;
  if (singleton) {
    singleton.disconnect();
    singleton = null;
  }
  try {
    const client = new Redis(url, { ...BASE_OPTIONS, commandTimeout: COMMAND_TIMEOUT_MS });
    client.on('error', err => warnRedisOnce('client-error', err));
    void client.connect().catch(err => warnRedisOnce('connect', err));
    singleton = client;
    singletonUrl = url;
    return client;
  } catch (err) {
    warnRedisOnce('init', err);
    return null;
  }
}

/** Pub/Sub 구독 전용 Redis 클라이언트를 새로 만든다. REDIS_URL이 없으면 null이다 */
export function createSubscriberClient(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  try {
    const sub = new Redis(url, BASE_OPTIONS);
    sub.on('error', err => warnRedisOnce('subscriber-error', err));
    return sub;
  } catch (err) {
    warnRedisOnce('subscriber-init', err);
    return null;
  }
}

/** 공유 Redis 클라이언트가 즉시 명령을 처리할 수 있는 상태인지 확인한다 */
export function isRedisReady(): boolean {
  return singleton !== null && singleton.status === 'ready';
}

/** 테스트·종료 시 공유 클라이언트를 정리한다 */
export async function closeRedisClient(): Promise<void> {
  const current = singleton;
  singleton = null;
  singletonUrl = null;
  lastWarnAtMs = 0;
  if (!current) return;
  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
