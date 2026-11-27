import { describe, expect, it, vi } from 'vitest';
import { createRedisSecondaryStorage } from './redisStorage.js';

function createMockRedis() {
  const store = new Map<string, { value: string; ttl?: number }>();
  const client = {
    status: 'ready',
    get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
    getdel: vi.fn(async (key: string) => {
      const entry = store.get(key);
      store.delete(key);
      return entry?.value ?? null;
    }),
    set: vi.fn(async (key: string, value: string, mode?: string | number, ttl?: string | number) => {
      store.set(key, { value, ...(mode === 'EX' && typeof ttl === 'number' ? { ttl } : {}) });
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    incr: vi.fn(async (key: string) => {
      const cur = Number(store.get(key)?.value ?? '0');
      const next = cur + 1;
      store.set(key, { ...store.get(key), value: String(next) });
      return next;
    }),
    ttl: vi.fn(async (key: string) => store.get(key)?.ttl ?? -1),
    expire: vi.fn(async (key: string, sec: number) => {
      const cur = store.get(key);
      if (!cur) return 0;
      cur.ttl = sec;
      return 1;
    }),
  };
  return { client, store };
}

describe('Better Auth Redis secondaryStorage', () => {
  it('get / set(ttl 포함·미포함) / delete / getAndDelete가 접두어 키로 동작한다', async () => {
    const { client, store } = createMockRedis();
    const storage = createRedisSecondaryStorage({ env: 'preview', client });

    await storage.set('sess-1', '{"ok":true}', 60);
    expect(store.get('pf:preview:auth:sess-1')).toEqual({ value: '{"ok":true}', ttl: 60 });
    expect(await storage.get('sess-1')).toBe('{"ok":true}');

    await storage.set('perm-1', 'v1');
    expect(store.get('pf:preview:auth:perm-1')).toEqual({ value: 'v1' });

    expect(await storage.getAndDelete('sess-1')).toBe('{"ok":true}');
    expect(await storage.get('sess-1')).toBeNull();

    await storage.delete('perm-1');
    expect(await storage.get('perm-1')).toBeNull();
  });

  it('increment는 최초 생성 시에만 TTL을 부여하고 이후 증가에는 TTL을 연장하지 않는다', async () => {
    const { client, store } = createMockRedis();
    const storage = createRedisSecondaryStorage({ env: 'production', client });

    expect(await storage.increment('rl:ip', 10)).toBe(1);
    expect(store.get('pf:production:auth:rl:ip')?.ttl).toBe(10);
    expect(await storage.increment('rl:ip', 10)).toBe(2);
    expect(client.expire).toHaveBeenCalledTimes(1);
  });

  it('Redis 오류 또는 null 클라이언트일 때 예외를 던지지 않고 Fail-open으로 동작한다', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom = new Error('READONLY');
    const broken = {
      status: 'ready',
      get: vi.fn(async () => { throw boom; }),
      getdel: vi.fn(async () => { throw boom; }),
      set: vi.fn(async () => { throw boom; }),
      del: vi.fn(async () => { throw boom; }),
      incr: vi.fn(async () => { throw boom; }),
      ttl: vi.fn(async () => -1),
      expire: vi.fn(async () => 0),
    };

    const storage = createRedisSecondaryStorage({ env: 'local', client: broken });
    await expect(storage.get('k')).resolves.toBeNull();
    await expect(storage.getAndDelete('k')).resolves.toBeNull();
    await expect(storage.set('k', 'v', 10)).resolves.toBeUndefined();
    await expect(storage.delete('k')).resolves.toBeUndefined();
    await expect(storage.increment('k', 10)).resolves.toBe(1);

    const nullStorage = createRedisSecondaryStorage({ env: 'local', client: null });
    await expect(nullStorage.get('k')).resolves.toBeNull();
    await expect(nullStorage.increment('k', 10)).resolves.toBe(1);
    warnSpy.mockRestore();
  });
});
