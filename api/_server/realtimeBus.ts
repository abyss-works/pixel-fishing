// 실시간 버스 공유 계약 및 단일 프로세스 인메모리 폴백 구현.
// 다중 파드 환경에서는 RedisLiveBus가 구현하고, 로컬·단위·Redis 장애 시 InProcessLiveBus로 폴백한다.
import type { Presence, ServerMessage } from '../../src/game/rules/live.js';
import type { CatchFxPayload } from './livePresence.js';

export interface RelayBroadcastPayload {
  sourcePodId: string;
  fromUid: string;
  msg: ServerMessage;
  room?: 'global' | 'local' | 'guild';
  region?: string | null;
  guildId?: string | null;
}

export interface OnlineEntry {
  uid: string;
  guest: boolean;
  podId: string;
  updatedAtMs: number;
}

export type LiveBusEvent =
  | { t: 'notifyUser'; uid: string; msg: ServerMessage; sourcePodId?: string }
  | { t: 'notifyGuild'; guildId: string; msg: ServerMessage; sourcePodId?: string }
  | { t: 'notifyAll'; msg: ServerMessage; sourcePodId?: string }
  | { t: 'setNick'; uid: string; nick: string; sourcePodId?: string }
  | { t: 'setFame'; uid: string; fame: number; sourcePodId?: string }
  | { t: 'setBlocked'; uid: string; ids: string[]; sourcePodId?: string }
  | { t: 'setGuild'; uid: string; guild: string | null; sourcePodId?: string }
  | { t: 'broadcastCatchFx'; uid: string; payload: CatchFxPayload; sourcePodId?: string }
  | { t: 'kickUser'; uid: string; reason?: string; sourcePodId?: string }
  | { t: 'disconnectWidget'; uid: string; sourcePodId?: string }
  | ({ t: 'relayBroadcast' } & RelayBroadcastPayload);

export type LiveBusHandler = (event: LiveBusEvent) => void;

export interface PodMetricsSnapshot {
  podId: string;
  updatedAt: string;
  connections?: number;
  onlineUsers?: number;
  [key: string]: unknown;
}

export interface LiveBus {
  notifyUser(uid: string, msg: ServerMessage): Promise<void>;
  notifyGuild(guildId: string, msg: ServerMessage): Promise<void>;
  notifyAll(msg: ServerMessage): Promise<void>;
  setNick(uid: string, nick: string): Promise<void>;
  setFame(uid: string, fame: number): Promise<void>;
  setBlocked(uid: string, ids: readonly string[]): Promise<void>;
  setGuild(uid: string, guild: string | null): Promise<void>;
  broadcastCatchFx(uid: string, payload: CatchFxPayload): Promise<void>;
  kickUser(uid: string, reason?: string, sourcePodId?: string): Promise<void>;
  disconnectWidget(uid: string): Promise<void>;
  relayBroadcast(payload: RelayBroadcastPayload): Promise<void>;
  publishPresence(presence: Presence, podId?: string): Promise<void>;
  removePresence(uid: string, podId?: string): Promise<void>;
  listPresence(): Promise<Presence[]>;
  presenceOf(uid: string): Promise<Presence | null>;
  publishOnline(entry: OnlineEntry): Promise<void>;
  removeOnline(uid: string, podId?: string): Promise<void>;
  listOnline(): Promise<OnlineEntry[]>;
  isUserOnline(uid: string): Promise<boolean>;
  acquireAlertLock(key: string, ttlSec: number): Promise<boolean>;
  publishPodMetrics(podId: string, metrics: PodMetricsSnapshot): Promise<void>;
  removePodMetrics(podId: string): Promise<void>;
  listPodMetrics(): Promise<PodMetricsSnapshot[]>;
  subscribe(handler: LiveBusHandler): () => void;
  close(): Promise<void>;
}

/** 단일 프로세스 인메모리 LiveBus 구현 */
export class InProcessLiveBus implements LiveBus {
  private readonly handlers = new Set<LiveBusHandler>();
  private readonly presences = new Map<string, { presence: Presence; podId?: string }>();
  private readonly onlineEntries = new Map<string, OnlineEntry>();
  private readonly alertLocks = new Map<string, number>();
  private readonly podMetrics = new Map<string, PodMetricsSnapshot>();

  private emit(event: LiveBusEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  async notifyUser(uid: string, msg: ServerMessage): Promise<void> {
    this.emit({ t: 'notifyUser', uid, msg });
  }

  async notifyGuild(guildId: string, msg: ServerMessage): Promise<void> {
    this.emit({ t: 'notifyGuild', guildId, msg });
  }

  async notifyAll(msg: ServerMessage): Promise<void> {
    this.emit({ t: 'notifyAll', msg });
  }

  async setNick(uid: string, nick: string): Promise<void> {
    this.emit({ t: 'setNick', uid, nick });
  }

  async setFame(uid: string, fame: number): Promise<void> {
    this.emit({ t: 'setFame', uid, fame });
  }

  async setBlocked(uid: string, ids: readonly string[]): Promise<void> {
    this.emit({ t: 'setBlocked', uid, ids: [...ids] });
  }

  async setGuild(uid: string, guild: string | null): Promise<void> {
    this.emit({ t: 'setGuild', uid, guild });
  }

  async broadcastCatchFx(uid: string, payload: CatchFxPayload): Promise<void> {
    this.emit({ t: 'broadcastCatchFx', uid, payload });
  }

  async kickUser(uid: string, reason?: string, sourcePodId?: string): Promise<void> {
    this.emit({
      t: 'kickUser',
      uid,
      ...(reason !== undefined ? { reason } : {}),
      ...(sourcePodId !== undefined ? { sourcePodId } : {}),
    });
  }

  async disconnectWidget(uid: string): Promise<void> {
    this.emit({ t: 'disconnectWidget', uid });
  }

  async relayBroadcast(payload: RelayBroadcastPayload): Promise<void> {
    this.emit({ t: 'relayBroadcast', ...payload });
  }

  async publishPresence(presence: Presence, podId?: string): Promise<void> {
    this.presences.set(presence.uid, { presence, podId });
  }

  async removePresence(uid: string, podId?: string): Promise<void> {
    const existing = this.presences.get(uid);
    if (!existing) return;
    if (podId !== undefined && existing.podId !== podId) return;
    this.presences.delete(uid);
  }

  async listPresence(): Promise<Presence[]> {
    return [...this.presences.values()].map(entry => entry.presence);
  }

  async presenceOf(uid: string): Promise<Presence | null> {
    return this.presences.get(uid)?.presence ?? null;
  }

  async publishOnline(entry: OnlineEntry): Promise<void> {
    this.onlineEntries.set(entry.uid, entry);
  }

  async removeOnline(uid: string, podId?: string): Promise<void> {
    const existing = this.onlineEntries.get(uid);
    if (!existing) return;
    if (podId !== undefined && existing.podId !== podId) return;
    this.onlineEntries.delete(uid);
  }

  async listOnline(): Promise<OnlineEntry[]> {
    return [...this.onlineEntries.values()];
  }

  async isUserOnline(uid: string): Promise<boolean> {
    return this.onlineEntries.has(uid);
  }

  async acquireAlertLock(key: string, ttlSec: number): Promise<boolean> {
    const now = Date.now();
    const expiresAt = this.alertLocks.get(key);
    if (expiresAt !== undefined && expiresAt > now) {
      return false;
    }
    this.alertLocks.set(key, now + Math.max(1, ttlSec) * 1000);
    return true;
  }

  async publishPodMetrics(podId: string, metrics: PodMetricsSnapshot): Promise<void> {
    this.podMetrics.set(podId, { ...metrics, podId });
  }

  async removePodMetrics(podId: string): Promise<void> {
    this.podMetrics.delete(podId);
  }

  async listPodMetrics(): Promise<PodMetricsSnapshot[]> {
    return [...this.podMetrics.values()];
  }

  subscribe(handler: LiveBusHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
    this.presences.clear();
    this.onlineEntries.clear();
    this.alertLocks.clear();
    this.podMetrics.clear();
  }
}
