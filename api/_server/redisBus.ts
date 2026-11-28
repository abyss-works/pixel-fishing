// Redis Pub/Sub + Hash + SET NX EX 기반 실시간 버스 구현.
// 연결 실패·타임아웃 시 예외를 전파하지 않고 InProcessLiveBus로 Fail-open 폴백한다.
import type { Presence, ServerMessage } from '../../src/game/rules/live.js';
import type { CatchFxPayload } from './livePresence.js';
import { InProcessLiveBus } from './realtimeBus.js';
import type {
  LiveBus, LiveBusEvent, LiveBusHandler, OnlineEntry, PodMetricsSnapshot, RelayBroadcastPayload,
} from './realtimeBus.js';
import { createSubscriberClient, getRedisClient, redisUrl, warnRedisOnce } from './redisClient.js';

export interface RedisCommandLike {
  status?: string;
  publish(channel: string, message: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  set(key: string, value: string, expiryMode: 'EX', time: number, setMode: 'NX'): Promise<'OK' | null>;
  expire?(key: string, seconds: number): Promise<number>;
  eval?(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
}

const POD_METRICS_TTL_SEC = 300;

export interface RedisSubscriberLike {
  status?: string;
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: string[]): Promise<unknown>;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
  on(event: 'ready', listener: () => void): unknown;
  off(event: 'message', listener: (channel: string, message: string) => void): unknown;
  off(event: 'ready', listener: () => void): unknown;
}

export interface RedisLiveBusOptions {
  env?: string;
  client?: RedisCommandLike | null;
  subscriber?: RedisSubscriberLike | null;
  fallback?: InProcessLiveBus;
}

function resolveEnvName(explicit?: string): string {
  const raw = explicit ?? process.env.DEPLOY_ENV ?? 'local';
  const normalized = raw.trim().toLowerCase();
  return normalized || 'local';
}

function parseJsonObject<T>(raw: string): T | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

const REMOVE_IF_OWNED_LUA = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local ok, obj = pcall(cjson.decode, raw)
if ok and type(obj) == 'table' and obj[ARGV[2]] == ARGV[3] then
  return redis.call('HDEL', KEYS[1], ARGV[1])
end
return 0
`;

type StoredPresence = Presence & { _podId?: string };

function stripPresencePodId(stored: StoredPresence): Presence {
  if (!('_podId' in stored)) return stored;
  const { _podId: _ignored, ...presence } = stored;
  return presence;
}

export class RedisLiveBus implements LiveBus {
  private readonly client: RedisCommandLike | null;
  private readonly subscriber: RedisSubscriberLike | null;
  private readonly fallback: InProcessLiveBus;
  private readonly eventsChannel: string;
  private readonly presenceKey: string;
  private readonly onlineKey: string;
  private readonly podsKey: string;
  private readonly alertPrefix: string;
  private readonly handlers = new Set<LiveBusHandler>();
  private subscribed = false;
  private subscribing: Promise<void> | null = null;
  private listenerAttached = false;

  constructor(options: RedisLiveBusOptions = {}) {
    const env = resolveEnvName(options.env);
    this.eventsChannel = `pf:${env}:bus:events`;
    this.presenceKey = `pf:${env}:bus:presence`;
    this.onlineKey = `pf:${env}:bus:online`;
    this.podsKey = `pf:${env}:bus:pods`;
    this.alertPrefix = `pf:${env}:bus:alert:`;
    this.client = options.client !== undefined ? options.client : getRedisClient();
    this.subscriber = options.subscriber !== undefined ? options.subscriber : createSubscriberClient();
    this.fallback = options.fallback ?? new InProcessLiveBus();
  }

  private readonly handleMessage = (channel: string, raw: string): void => {
    if (channel !== this.eventsChannel) return;
    const event = parseJsonObject<LiveBusEvent>(raw);
    if (!event || typeof event.t !== 'string') return;
    this.dispatchLocal(event);
  };

  private readonly handleReady = (): void => {
    if (!this.subscriber || !this.subscribed || this.handlers.size === 0) return;
    void Promise.resolve(this.subscriber.subscribe(this.eventsChannel)).catch(err =>
      warnRedisOnce('bus-resubscribe', err),
    );
  };

  private dispatchLocal(event: LiveBusEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  private async ensureSubscribed(): Promise<void> {
    if (!this.subscriber || this.subscribed) return;
    if (this.subscribing) return this.subscribing;
    this.subscribing = (async () => {
      try {
        if (!this.listenerAttached) {
          this.subscriber!.on('message', this.handleMessage);
          this.subscriber!.on('ready', this.handleReady);
          this.listenerAttached = true;
        }
        if (this.subscriber!.status === 'wait') {
          await this.subscriber!.connect();
        }
        await this.subscriber!.subscribe(this.eventsChannel);
        this.subscribed = true;
      } catch (err) {
        warnRedisOnce('bus-subscribe', err);
      } finally {
        this.subscribing = null;
      }
    })();
    return this.subscribing;
  }

  private async publishEvent(event: LiveBusEvent): Promise<void> {
    if (!this.client) {
      this.dispatchLocal(event);
      return;
    }
    try {
      await this.client.publish(this.eventsChannel, JSON.stringify(event));
    } catch (err) {
      warnRedisOnce('bus-publish', err);
      this.dispatchLocal(event);
    }
  }

  async notifyUser(uid: string, msg: ServerMessage): Promise<void> {
    await this.publishEvent({ t: 'notifyUser', uid, msg });
  }

  async notifyGuild(guildId: string, msg: ServerMessage): Promise<void> {
    await this.publishEvent({ t: 'notifyGuild', guildId, msg });
  }

  async notifyAll(msg: ServerMessage): Promise<void> {
    await this.publishEvent({ t: 'notifyAll', msg });
  }

  async setNick(uid: string, nick: string): Promise<void> {
    await this.publishEvent({ t: 'setNick', uid, nick });
  }

  async setFame(uid: string, fame: number): Promise<void> {
    await this.publishEvent({ t: 'setFame', uid, fame });
  }

  async setBlocked(uid: string, ids: readonly string[]): Promise<void> {
    await this.publishEvent({ t: 'setBlocked', uid, ids: [...ids] });
  }

  async setGuild(uid: string, guild: string | null): Promise<void> {
    await this.publishEvent({ t: 'setGuild', uid, guild });
  }

  async broadcastCatchFx(uid: string, payload: CatchFxPayload): Promise<void> {
    await this.publishEvent({ t: 'broadcastCatchFx', uid, payload });
  }

  async kickUser(uid: string, reason?: string, sourcePodId?: string): Promise<void> {
    await this.publishEvent({
      t: 'kickUser',
      uid,
      ...(reason !== undefined ? { reason } : {}),
      ...(sourcePodId !== undefined ? { sourcePodId } : {}),
    });
  }

  async disconnectWidget(uid: string): Promise<void> {
    await this.publishEvent({ t: 'disconnectWidget', uid });
  }

  async relayBroadcast(payload: RelayBroadcastPayload): Promise<void> {
    await this.publishEvent({ t: 'relayBroadcast', ...payload });
  }

  private async removeHashIfOwned(key: string, field: string, podField: string, podId: string): Promise<void> {
    if (!this.client) return;
    if (typeof this.client.eval === 'function') {
      await this.client.eval(REMOVE_IF_OWNED_LUA, 1, key, field, podField, podId);
      return;
    }
    const raw = await this.client.hget(key, field);
    if (!raw) return;
    const parsed = parseJsonObject<Record<string, unknown>>(raw);
    if (parsed && parsed[podField] === podId) {
      await this.client.hdel(key, field);
    }
  }

  async publishPresence(presence: Presence, podId?: string): Promise<void> {
    if (!this.client) {
      await this.fallback.publishPresence(presence, podId);
      return;
    }
    const stored: StoredPresence = podId !== undefined ? { ...presence, _podId: podId } : presence;
    try {
      await this.client.hset(this.presenceKey, presence.uid, JSON.stringify(stored));
    } catch (err) {
      warnRedisOnce('bus-presence-set', err);
      await this.fallback.publishPresence(presence, podId);
    }
  }

  async removePresence(uid: string, podId?: string): Promise<void> {
    if (!this.client) {
      await this.fallback.removePresence(uid, podId);
      return;
    }
    try {
      if (podId !== undefined) {
        await this.removeHashIfOwned(this.presenceKey, uid, '_podId', podId);
      } else {
        await this.client.hdel(this.presenceKey, uid);
      }
    } catch (err) {
      warnRedisOnce('bus-presence-del', err);
      await this.fallback.removePresence(uid, podId);
    }
  }

  async listPresence(): Promise<Presence[]> {
    if (!this.client) return this.fallback.listPresence();
    try {
      const raw = await this.client.hgetall(this.presenceKey);
      const result: Presence[] = [];
      for (const value of Object.values(raw)) {
        const parsed = parseJsonObject<StoredPresence>(value);
        if (parsed && typeof parsed.uid === 'string') result.push(stripPresencePodId(parsed));
      }
      return result;
    } catch (err) {
      warnRedisOnce('bus-presence-list', err);
      return this.fallback.listPresence();
    }
  }

  async presenceOf(uid: string): Promise<Presence | null> {
    if (!this.client) return this.fallback.presenceOf(uid);
    try {
      const raw = await this.client.hget(this.presenceKey, uid);
      if (!raw) return null;
      const parsed = parseJsonObject<StoredPresence>(raw);
      return parsed && typeof parsed.uid === 'string' ? stripPresencePodId(parsed) : null;
    } catch (err) {
      warnRedisOnce('bus-presence-get', err);
      return this.fallback.presenceOf(uid);
    }
  }

  async publishOnline(entry: OnlineEntry): Promise<void> {
    if (!this.client) {
      await this.fallback.publishOnline(entry);
      return;
    }
    try {
      await this.client.hset(this.onlineKey, entry.uid, JSON.stringify(entry));
    } catch (err) {
      warnRedisOnce('bus-online-set', err);
      await this.fallback.publishOnline(entry);
    }
  }

  async removeOnline(uid: string, podId?: string): Promise<void> {
    if (!this.client) {
      await this.fallback.removeOnline(uid, podId);
      return;
    }
    try {
      if (podId !== undefined) {
        await this.removeHashIfOwned(this.onlineKey, uid, 'podId', podId);
      } else {
        await this.client.hdel(this.onlineKey, uid);
      }
    } catch (err) {
      warnRedisOnce('bus-online-del', err);
      await this.fallback.removeOnline(uid, podId);
    }
  }

  async listOnline(): Promise<OnlineEntry[]> {
    if (!this.client) return this.fallback.listOnline();
    try {
      const raw = await this.client.hgetall(this.onlineKey);
      const result: OnlineEntry[] = [];
      for (const value of Object.values(raw)) {
        const parsed = parseJsonObject<OnlineEntry>(value);
        if (parsed && typeof parsed.uid === 'string') result.push(parsed);
      }
      return result;
    } catch (err) {
      warnRedisOnce('bus-online-list', err);
      return this.fallback.listOnline();
    }
  }

  async isUserOnline(uid: string): Promise<boolean> {
    if (!this.client) return this.fallback.isUserOnline(uid);
    try {
      const raw = await this.client.hget(this.onlineKey, uid);
      if (!raw) return false;
      const parsed = parseJsonObject<OnlineEntry>(raw);
      return Boolean(parsed && typeof parsed.uid === 'string');
    } catch (err) {
      warnRedisOnce('bus-online-get', err);
      return this.fallback.isUserOnline(uid);
    }
  }

  async acquireAlertLock(key: string, ttlSec: number): Promise<boolean> {
    const safeTtl = Math.max(1, Math.floor(ttlSec));
    if (!this.client) return this.fallback.acquireAlertLock(key, safeTtl);
    try {
      const res = await this.client.set(`${this.alertPrefix}${key}`, '1', 'EX', safeTtl, 'NX');
      return res === 'OK';
    } catch (err) {
      warnRedisOnce('bus-alert-lock', err);
      return this.fallback.acquireAlertLock(key, safeTtl);
    }
  }

  async publishPodMetrics(podId: string, metrics: PodMetricsSnapshot): Promise<void> {
    const payload: PodMetricsSnapshot = { ...metrics, podId };
    if (!this.client) {
      await this.fallback.publishPodMetrics(podId, payload);
      return;
    }
    try {
      await this.client.hset(this.podsKey, podId, JSON.stringify(payload));
      if (typeof this.client.expire === 'function') {
        await this.client.expire(this.podsKey, POD_METRICS_TTL_SEC);
      }
    } catch (err) {
      warnRedisOnce('bus-pod-metrics-set', err);
      await this.fallback.publishPodMetrics(podId, payload);
    }
  }

  async removePodMetrics(podId: string): Promise<void> {
    if (!this.client) {
      await this.fallback.removePodMetrics(podId);
      return;
    }
    try {
      await this.client.hdel(this.podsKey, podId);
    } catch (err) {
      warnRedisOnce('bus-pod-metrics-del', err);
      await this.fallback.removePodMetrics(podId);
    }
  }

  async listPodMetrics(): Promise<PodMetricsSnapshot[]> {
    if (!this.client) return this.fallback.listPodMetrics();
    try {
      const raw = await this.client.hgetall(this.podsKey);
      const result: PodMetricsSnapshot[] = [];
      for (const value of Object.values(raw)) {
        const parsed = parseJsonObject<PodMetricsSnapshot>(value);
        if (parsed && typeof parsed.podId === 'string') result.push(parsed);
      }
      return result;
    } catch (err) {
      warnRedisOnce('bus-pod-metrics-list', err);
      return this.fallback.listPodMetrics();
    }
  }

  subscribe(handler: LiveBusHandler): () => void {
    this.handlers.add(handler);
    void this.ensureSubscribed();
    return () => {
      this.handlers.delete(handler);
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
    if (this.subscriber) {
      if (this.listenerAttached) {
        this.subscriber.off('message', this.handleMessage);
        this.subscriber.off('ready', this.handleReady);
        this.listenerAttached = false;
      }
      try {
        if (this.subscribed) await this.subscriber.unsubscribe(this.eventsChannel);
      } catch {
        // 종료 중 오류는 무시한다
      }
      this.subscribed = false;
      try {
        await this.subscriber.quit();
      } catch {
        this.subscriber.disconnect();
      }
    }
    await this.fallback.close();
  }
}

/** REDIS_URL 설정 여부에 따라 RedisLiveBus 또는 InProcessLiveBus를 만든다 */
export function createLiveBus(): LiveBus {
  return redisUrl() ? new RedisLiveBus() : new InProcessLiveBus();
}
