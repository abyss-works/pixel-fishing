// Better Auth secondaryStorage Redis 구현 — Fail-open 원칙을 따른다.
// Redis 미설정·연결 끊김·오류 시 null 반환 또는 무시를 통해 인증 경로가 중단되지 않게 한다.
import { getRedisClient, warnRedisOnce } from '../_server/redisClient.js';

export interface RedisSecondaryStorageClient {
  status?: string;
  get(key: string): Promise<string | null>;
  getdel?(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, secondsToken: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export interface RedisSecondaryStorageOptions {
  env?: string;
  prefix?: string;
  client?: RedisSecondaryStorageClient | null;
}

export interface AuthSecondaryStorage {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  increment(key: string, ttl: number): Promise<number>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createRedisSecondaryStorage(options: RedisSecondaryStorageOptions = {}): AuthSecondaryStorage {
  const env = (options.env ?? process.env.DEPLOY_ENV ?? 'local').trim().toLowerCase() || 'local';
  const prefix = options.prefix ?? `pf:${env}:auth:`;

  const resolveClient = (): RedisSecondaryStorageClient | null => {
    const client = options.client !== undefined ? options.client : getRedisClient();
    if (!client) return null;
    if (client.status !== undefined && client.status !== 'ready') return null;
    return client;
  };

  return {
    async get(key) {
      const client = resolveClient();
      if (!client) return null;
      try {
        return await client.get(`${prefix}${key}`);
      } catch (err) {
        warnRedisOnce('auth-storage-get', err);
        return null;
      }
    },

    async getAndDelete(key) {
      const client = resolveClient();
      if (!client) return null;
      const fullKey = `${prefix}${key}`;
      try {
        if (typeof client.getdel === 'function') {
          return await client.getdel(fullKey);
        }
        const value = await client.get(fullKey);
        if (value !== null) await client.del(fullKey);
        return value;
      } catch (err) {
        warnRedisOnce('auth-storage-getdel', err);
        return null;
      }
    },

    async increment(key, ttl) {
      const client = resolveClient();
      if (!client) return 1;
      const fullKey = `${prefix}${key}`;
      const safeTtl = Math.max(1, Math.floor(ttl));
      try {
        const count = await client.incr(fullKey);
        if (count === 1 || (await client.ttl(fullKey)) < 0) {
          await client.expire(fullKey, safeTtl);
        }
        return count;
      } catch (err) {
        warnRedisOnce('auth-storage-incr', err);
        return 1;
      }
    },

    async set(key, value, ttl) {
      const client = resolveClient();
      if (!client) return;
      const fullKey = `${prefix}${key}`;
      try {
        if (ttl !== undefined && ttl > 0) {
          await client.set(fullKey, value, 'EX', Math.max(1, Math.floor(ttl)));
        } else {
          await client.set(fullKey, value);
        }
      } catch (err) {
        warnRedisOnce('auth-storage-set', err);
      }
    },

    async delete(key) {
      const client = resolveClient();
      if (!client) return;
      try {
        await client.del(`${prefix}${key}`);
      } catch (err) {
        warnRedisOnce('auth-storage-del', err);
      }
    },
  };
}
