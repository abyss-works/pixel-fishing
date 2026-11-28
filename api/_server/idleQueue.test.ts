import { describe, expect, it, vi } from 'vitest';
import {
  IDLE_QUEUE_TTL_SEC,
  advanceIdleQueue,
  clearIdleQueue,
  idleQueueKey,
  readIdleQueue,
  startIdleQueue,
  touchIdleQueueCatch,
} from './idleQueue.js';
import type { IdleQueueRedisLike } from './idleQueue.js';

function createMemoryRedis(): IdleQueueRedisLike & { store: Map<string, { value: string; ttl: number }> } {
  const store = new Map<string, { value: string; ttl: number }>();
  return {
    status: 'ready',
    store,
    async get(key: string) {
      return store.get(key)?.value ?? null;
    },
    async set(key: string, value: string, _mode: 'EX', ttl: number) {
      store.set(key, { value, ttl });
      return 'OK';
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };
}

describe('idleQueue (Valkey 무상태 방치 큐)', () => {
  it('일반 해역 등록 → 조회 → 포획 시각 갱신 → 해제가 정상 동작한다', async () => {
    const client = createMemoryRedis();
    const opts = { env: 'stage', client };

    const started = await startIdleQueue('u1', 'sea', 1000, opts);
    expect(started).toBe(true);
    expect(client.store.get(idleQueueKey('u1', 'stage'))?.ttl).toBe(IDLE_QUEUE_TTL_SEC);

    const state1 = await readIdleQueue('u1', opts);
    expect(state1).toEqual({
      spotId: 'sea',
      startedAtMs: 1000,
      lastProcessedAtMs: 1000,
      accumulatedSummary: null,
      updatedAtMs: 1000,
    });

    await touchIdleQueueCatch('u1', 'sea', 5000, opts);
    const state2 = await readIdleQueue('u1', opts);
    expect(state2?.lastProcessedAtMs).toBe(5000);

    await advanceIdleQueue('u1', { ...state2!, lastProcessedAtMs: 9000, updatedAtMs: 9000 }, opts);
    expect((await readIdleQueue('u1', opts))?.lastProcessedAtMs).toBe(9000);

    expect(await clearIdleQueue('u1', opts)).toBe(true);
    expect(await readIdleQueue('u1', opts)).toBeNull();
  });

  it('강태공 선수권 대회(championship)는 등록·갱신에서 제외한다', async () => {
    const client = createMemoryRedis();
    const opts = { env: 'prod', client };
    expect(await startIdleQueue('u1', 'championship', 1000, opts)).toBe(false);
    expect(await readIdleQueue('u1', opts)).toBeNull();
  });

  it('Valkey 미연결 또는 명령 실패 시 예외 없이 Fail-open으로 동작한다', async () => {
    expect(await startIdleQueue('u1', 'pond', 1000, { client: null })).toBe(false);
    expect(await readIdleQueue('u1', { client: null })).toBeNull();
    expect(await clearIdleQueue('u1', { client: null })).toBe(false);

    const broken: IdleQueueRedisLike = {
      status: 'ready',
      get: vi.fn().mockRejectedValue(new Error('timeout')),
      set: vi.fn().mockRejectedValue(new Error('timeout')),
      del: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    expect(await startIdleQueue('u1', 'pond', 1000, { client: broken })).toBe(false);
    expect(await readIdleQueue('u1', { client: broken })).toBeNull();
    expect(await clearIdleQueue('u1', { client: broken })).toBe(false);
  });
});
