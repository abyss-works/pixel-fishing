import { describe, expect, it, vi } from 'vitest';
import type { Presence } from '../../src/game/rules/live.js';
import { InProcessLiveBus } from './realtimeBus.js';
import type { LiveBusEvent } from './realtimeBus.js';
import { RedisLiveBus } from './redisBus.js';

function createMockRedisPair() {
  const kv = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const client = {
    status: 'ready',
    publish: vi.fn(async (channel: string, message: string) => {
      for (const fn of listeners.get('message') ?? []) {
        fn(channel, message);
      }
      return 1;
    }),
    hset: vi.fn(async (key: string, field: string, value: string) => {
      let map = hashes.get(key);
      if (!map) {
        map = new Map();
        hashes.set(key, map);
      }
      map.set(field, value);
      return 1;
    }),
    hdel: vi.fn(async (key: string, field: string) => {
      return hashes.get(key)?.delete(field) ? 1 : 0;
    }),
    hget: vi.fn(async (key: string, field: string) => {
      return hashes.get(key)?.get(field) ?? null;
    }),
    hgetall: vi.fn(async (key: string) => {
      const map = hashes.get(key);
      if (!map) return {};
      return Object.fromEntries(map.entries());
    }),
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number, nx: string) => {
      if (nx === 'NX' && kv.has(key)) return null;
      kv.set(key, value);
      return 'OK';
    }),
    expire: vi.fn(async (_key: string, _seconds: number) => 1),
  };

  const subscriber = {
    status: 'ready',
    subscribe: vi.fn(async () => 1),
    unsubscribe: vi.fn(async () => 1),
    connect: vi.fn(async () => {}),
    quit: vi.fn(async () => 'OK'),
    disconnect: vi.fn(),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(fn);
      listeners.set(event, arr);
    }),
    off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(event, arr.filter(item => item !== fn));
    }),
  };

  return { client, subscriber, hashes, kv, listeners };
}

const samplePresence: Presence = {
  uid: 'u1',
  nick: '강태공',
  boat: 1,
  fame: 120,
  region: 'village',
  x: 10,
  y: 20,
  dir: 1,
  line: false,
};

describe('RedisLiveBus', () => {
  it('Pub/Sub 채널로 이벤트를 직렬화해 발행하고 구독 핸들러로 라우팅한다', async () => {
    const { client, subscriber } = createMockRedisPair();
    const bus = new RedisLiveBus({ env: 'preview', client: client as never, subscriber: subscriber as never });
    const received: LiveBusEvent[] = [];
    const unsub = bus.subscribe(ev => received.push(ev));

    await bus.notifyUser('u1', { t: 'mail' });
    await bus.notifyGuild('g1', { t: 'guild', kind: 'updated', guild: 'g1', nick: null });
    await bus.notifyAll({ t: 'notices', notices: [] });
    await bus.setNick('u1', '새닉');
    await bus.setFame('u1', 500);
    await bus.setBlocked('u1', ['u2']);
    await bus.setGuild('u1', 'g1');
    await bus.broadcastCatchFx('u1', { fishId: 'carp', form: 'normal' });
    await bus.kickUser('u1', 'replaced');
    await bus.disconnectWidget('u1');

    expect(subscriber.subscribe).toHaveBeenCalledWith('pf:preview:bus:events');
    expect(client.publish).toHaveBeenCalledTimes(10);
    expect(client.publish).toHaveBeenCalledWith('pf:preview:bus:events', expect.any(String));
    expect(received.map(e => e.t)).toEqual([
      'notifyUser',
      'notifyGuild',
      'notifyAll',
      'setNick',
      'setFame',
      'setBlocked',
      'setGuild',
      'broadcastCatchFx',
      'kickUser',
      'disconnectWidget',
    ]);

    unsub();
    await bus.notifyUser('u1', { t: 'mail' });
    expect(received).toHaveLength(10);
    await bus.close();
  });

  it('Presence Hash를 저장·조회·제거하고 깨진 JSON 항목은 무시한다', async () => {
    const { client, subscriber, hashes } = createMockRedisPair();
    const bus = new RedisLiveBus({ env: 'production', client: client as never, subscriber: subscriber as never });

    await bus.publishPresence(samplePresence);
    hashes.get('pf:production:bus:presence')?.set('broken', '{invalid-json');

    const list = await bus.listPresence();
    expect(list).toEqual([samplePresence]);

    await bus.removePresence('u1');
    expect(await bus.listPresence()).toEqual([]);
    await bus.close();
  });

  it('경보 락은 SET NX EX로 상호배제를 보장한다', async () => {
    const { client, subscriber } = createMockRedisPair();
    const bus = new RedisLiveBus({ env: 'production', client: client as never, subscriber: subscriber as never });

    expect(await bus.acquireAlertLock('5xx-surge', 900)).toBe(true);
    expect(await bus.acquireAlertLock('5xx-surge', 900)).toBe(false);
    expect(client.set).toHaveBeenCalledWith('pf:production:bus:alert:5xx-surge', '1', 'EX', 900, 'NX');
    await bus.close();
  });

  it('파드 메트릭 Hash를 기록하고 TTL을 설정하며 조회·제거한다', async () => {
    const { client, subscriber } = createMockRedisPair();
    const bus = new RedisLiveBus({ env: 'production', client: client as never, subscriber: subscriber as never });

    await bus.publishPodMetrics('pod-a', { podId: 'pod-a', updatedAt: '2026-11-27T00:00:00Z', connections: 12 });
    expect(client.expire).toHaveBeenCalledWith('pf:production:bus:pods', 300);

    const metrics = await bus.listPodMetrics();
    expect(metrics).toEqual([{ podId: 'pod-a', updatedAt: '2026-11-27T00:00:00Z', connections: 12 }]);

    await bus.removePodMetrics('pod-a');
    expect(client.hdel).toHaveBeenCalledWith('pf:production:bus:pods', 'pod-a');
    expect(await bus.listPodMetrics()).toEqual([]);
    await bus.close();
  });

  it('Redis 예외 또는 미연결 시 예외를 던지지 않고 인메모리 폴백(Fail-open)으로 동작한다', async () => {
    const { client, subscriber } = createMockRedisPair();
    const boom = new Error('ECONNREFUSED');
    client.publish.mockRejectedValue(boom);
    client.hset.mockRejectedValue(boom);
    client.hdel.mockRejectedValue(boom);
    client.hgetall.mockRejectedValue(boom);
    client.set.mockRejectedValue(boom);
    subscriber.subscribe.mockRejectedValue(boom);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallback = new InProcessLiveBus();
    const bus = new RedisLiveBus({
      env: 'local',
      client: client as never,
      subscriber: subscriber as never,
      fallback,
    });

    const received: LiveBusEvent[] = [];
    bus.subscribe(ev => received.push(ev));

    await expect(bus.notifyUser('u1', { t: 'mail' })).resolves.toBeUndefined();
    expect(received).toEqual([{ t: 'notifyUser', uid: 'u1', msg: { t: 'mail' } }]);

    await expect(bus.publishPresence(samplePresence)).resolves.toBeUndefined();
    expect(await bus.listPresence()).toEqual([samplePresence]);
    await expect(bus.removePresence('u1')).resolves.toBeUndefined();
    expect(await bus.listPresence()).toEqual([]);

    expect(await bus.acquireAlertLock('db-down', 60)).toBe(true);
    expect(await bus.acquireAlertLock('db-down', 60)).toBe(false);

    await expect(bus.publishPodMetrics('pod-1', { podId: 'pod-1', updatedAt: '2026-11-27T00:00:00Z' })).resolves.toBeUndefined();
    expect(await bus.listPodMetrics()).toEqual([{ podId: 'pod-1', updatedAt: '2026-11-27T00:00:00Z' }]);
    await expect(bus.removePodMetrics('pod-1')).resolves.toBeUndefined();
    expect(await bus.listPodMetrics()).toEqual([]);

    await bus.close();
    warnSpy.mockRestore();
  });

  it('Redis 클라이언트가 null이어도 인메모리 폴백으로 정상 동작한다', async () => {
    const bus = new RedisLiveBus({ env: 'local', client: null, subscriber: null });
    const received: LiveBusEvent[] = [];
    bus.subscribe(ev => received.push(ev));

    await bus.notifyAll({ t: 'mail' });
    expect(received).toEqual([{ t: 'notifyAll', msg: { t: 'mail' } }]);
    expect(await bus.acquireAlertLock('k', 10)).toBe(true);
    await bus.close();
  });

  it('subscriber가 재연결되어 ready 이벤트가 다시 발생하면 이벤트 채널을 재구독한다', async () => {
    const { client, subscriber, listeners } = createMockRedisPair();
    const bus = new RedisLiveBus({ env: 'preview', client: client as never, subscriber: subscriber as never });
    bus.subscribe(() => {});

    // 초기 subscribe 비동기 완료 대기
    await Promise.resolve();
    await Promise.resolve();
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);

    for (const fn of listeners.get('ready') ?? []) {
      fn();
    }
    await Promise.resolve();
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
    expect(subscriber.subscribe).toHaveBeenLastCalledWith('pf:preview:bus:events');
    await bus.close();
  });

  it('relayBroadcast 이벤트와 sourcePodId를 발행·구독한다', async () => {
    const { client, subscriber } = createMockRedisPair();
    const bus = new RedisLiveBus({ env: 'preview', client: client as never, subscriber: subscriber as never });
    const received: LiveBusEvent[] = [];
    bus.subscribe(ev => received.push(ev));

    await bus.relayBroadcast({
      sourcePodId: 'pod-a',
      fromUid: 'u1',
      msg: { t: 'typing', uid: 'u1', on: true },
    });
    await bus.kickUser('u1', 'replaced', 'pod-b');

    expect(received).toEqual([
      {
        t: 'relayBroadcast',
        sourcePodId: 'pod-a',
        fromUid: 'u1',
        msg: { t: 'typing', uid: 'u1', on: true },
      },
      {
        t: 'kickUser',
        uid: 'u1',
        reason: 'replaced',
        sourcePodId: 'pod-b',
      },
    ]);
    await bus.close();
  });

  it('온라인 명부(publishOnline/listOnline/isUserOnline)와 presenceOf를 조회한다', async () => {
    const { client, subscriber } = createMockRedisPair();
    const bus = new RedisLiveBus({ env: 'production', client: client as never, subscriber: subscriber as never });

    expect(await bus.isUserOnline('u1')).toBe(false);
    expect(await bus.presenceOf('u1')).toBeNull();

    await bus.publishOnline({ uid: 'u1', guest: false, podId: 'pod-a', updatedAtMs: 1000 });
    await bus.publishPresence(samplePresence, 'pod-a');

    expect(await bus.isUserOnline('u1')).toBe(true);
    expect(await bus.listOnline()).toEqual([{ uid: 'u1', guest: false, podId: 'pod-a', updatedAtMs: 1000 }]);
    expect(await bus.presenceOf('u1')).toEqual(samplePresence);
    expect(await bus.listPresence()).toEqual([samplePresence]);

    await bus.close();
  });

  it('소유 파드 보호: 다른 podId로 removePresence/removeOnline 호출 시 신 파드의 정보를 지우지 않는다', async () => {
    const { client, subscriber } = createMockRedisPair();
    const bus = new RedisLiveBus({ env: 'production', client: client as never, subscriber: subscriber as never });

    await bus.publishPresence(samplePresence, 'pod-new');
    await bus.publishOnline({ uid: 'u1', guest: false, podId: 'pod-new', updatedAtMs: 2000 });

    await bus.removePresence('u1', 'pod-old');
    await bus.removeOnline('u1', 'pod-old');
    expect(await bus.presenceOf('u1')).toEqual(samplePresence);
    expect(await bus.isUserOnline('u1')).toBe(true);

    await bus.removePresence('u1', 'pod-new');
    await bus.removeOnline('u1', 'pod-new');
    expect(await bus.presenceOf('u1')).toBeNull();
    expect(await bus.isUserOnline('u1')).toBe(false);
    await bus.close();
  });

  it('InProcessLiveBus도 소유 파드 보호와 온라인 명부·presenceOf를 지원한다', async () => {
    const bus = new InProcessLiveBus();
    await bus.publishPresence(samplePresence, 'pod-2');
    await bus.publishOnline({ uid: 'u1', guest: false, podId: 'pod-2', updatedAtMs: 3000 });

    await bus.removePresence('u1', 'pod-1');
    await bus.removeOnline('u1', 'pod-1');
    expect(await bus.presenceOf('u1')).toEqual(samplePresence);
    expect(await bus.isUserOnline('u1')).toBe(true);

    await bus.removePresence('u1', 'pod-2');
    await bus.removeOnline('u1', 'pod-2');
    expect(await bus.presenceOf('u1')).toBeNull();
    expect(await bus.isUserOnline('u1')).toBe(false);
    await bus.close();
  });
});
