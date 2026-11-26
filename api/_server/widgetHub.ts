// 데스크톱 위젯 실시간 SSE 허브 — 사용자별 연결 상한, keepalive, 단조 증가 이벤트 id, 종료 정리(SIGTERM·로그아웃)를 관리한다.
import {
  WIDGET_SSE_KEEPALIVE_MS,
} from '../../src/game/rules/widget.js';
import type {
  WidgetBagSummary,
  WidgetCatchItem,
  WidgetFishingState,
  WidgetSeaTheme,
  WidgetSummary,
} from '../../src/game/rules/widget.js';

/** 사용자당 동시 유지 가능한 최대 위젯 SSE 연결 수 */
export const WIDGET_MAX_CONNECTIONS_PER_USER = 5;

export type WidgetSseRes = {
  statusCode: number;
  setHeader(name: string, value: string | number | readonly string[]): unknown;
  write(chunk: string | Uint8Array): boolean;
  end(): unknown;
  on(event: 'close' | 'error', listener: () => void): unknown;
  flushHeaders?: () => void;
  writableEnded?: boolean;
  destroyed?: boolean;
};

export interface WidgetSseClient {
  readonly uid: string;
  readonly res: WidgetSseRes;
  readonly connectedAtMs: number;
  closed: boolean;
  readonly keepaliveTimer: ReturnType<typeof setInterval>;
}

export interface WidgetCatchPublishInput {
  catchItem: WidgetCatchItem;
  bag: WidgetBagSummary;
  fishingState?: WidgetFishingState;
  spotId?: string;
  spotName?: string;
  seaTheme?: WidgetSeaTheme | string;
  serverTimeMs?: number;
}

export interface WidgetSpotPublishInput {
  spotId: string;
  spotName: string;
  seaTheme: WidgetSeaTheme | string;
}

export interface WidgetHubOptions {
  keepaliveMs?: number;
  maxPerUser?: number;
  now?: () => number;
}

export interface WidgetHub {
  addClient(uid: string, res: WidgetSseRes): WidgetSseClient;
  removeClient(client: WidgetSseClient): void;
  sendSummarySync(client: WidgetSseClient, summary: WidgetSummary): void;
  publishCatch(uid: string, input: WidgetCatchPublishInput): string | null;
  publishBagSync(uid: string, bag: WidgetBagSummary, serverTimeMs?: number): string | null;
  publishSpotChanged(uid: string, spot: WidgetSpotPublishInput, serverTimeMs?: number): string | null;
  publishStatusChanged(uid: string, fishingState: WidgetFishingState, serverTimeMs?: number): string | null;
  hasSubscribers(uid: string): boolean;
  subscriberCount(uid?: string): number;
  disconnectUser(uid: string): void;
  close(): void;
}

function formatSseFrame(event: string, data: unknown, id?: string | null): string {
  const idLine = id ? `id: ${id}\n` : '';
  return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 위젯 SSE 구독자 허브 인스턴스를 생성한다 */
export function createWidgetHub(options: WidgetHubOptions = {}): WidgetHub {
  const keepaliveMs = options.keepaliveMs ?? WIDGET_SSE_KEEPALIVE_MS;
  const maxPerUser = options.maxPerUser ?? WIDGET_MAX_CONNECTIONS_PER_USER;
  const now = options.now ?? (() => Date.now());
  const subscribers = new Map<string, Set<WidgetSseClient>>();
  let lastTs = 0;
  let seq = 0;

  const nextEventId = (): string => {
    const ts = Math.max(now(), lastTs);
    lastTs = ts;
    seq += 1;
    return `${ts}-${seq}`;
  };

  const cleanupClient = (client: WidgetSseClient, endResponse: boolean): void => {
    if (client.closed) return;
    client.closed = true;
    clearInterval(client.keepaliveTimer);
    const set = subscribers.get(client.uid);
    if (set) {
      set.delete(client);
      if (set.size === 0) subscribers.delete(client.uid);
    }
    if (endResponse && !client.res.writableEnded && !client.res.destroyed) {
      try {
        client.res.end();
      } catch {
        // 이미 닫힌 소켓의 종료 오류는 무시한다
      }
    }
  };

  const writeRaw = (client: WidgetSseClient, chunk: string): boolean => {
    if (client.closed || client.res.writableEnded || client.res.destroyed) {
      cleanupClient(client, false);
      return false;
    }
    try {
      client.res.write(chunk);
      return true;
    } catch {
      cleanupClient(client, true);
      return false;
    }
  };

  const broadcastEvent = (uid: string, event: string, eventId: string, payload: unknown): string | null => {
    const set = subscribers.get(uid);
    if (!set || set.size === 0) return null;
    const frame = formatSseFrame(event, payload, eventId);
    for (const client of [...set]) {
      writeRaw(client, frame);
    }
    return eventId;
  };

  return {
    addClient(uid, res) {
      let set = subscribers.get(uid);
      if (!set) {
        set = new Set();
        subscribers.set(uid, set);
      }
      while (set.size >= maxPerUser) {
        const oldest = set.values().next().value as WidgetSseClient | undefined;
        if (!oldest) break;
        cleanupClient(oldest, true);
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const keepaliveTimer = setInterval(() => {
        writeRaw(client, ': keepalive\n\n');
      }, keepaliveMs);
      keepaliveTimer.unref?.();

      const client: WidgetSseClient = {
        uid,
        res,
        connectedAtMs: now(),
        closed: false,
        keepaliveTimer,
      };
      set.add(client);

      const onClose = (): void => { cleanupClient(client, false); };
      res.on('close', onClose);
      res.on('error', onClose);

      writeRaw(client, ': connected\n\n');
      return client;
    },

    removeClient(client) {
      cleanupClient(client, false);
    },

    sendSummarySync(client, summary) {
      // 위젯 클라이언트는 summary_sync 이벤트의 data 본문으로 WidgetSummary 객체를 직접 받는다
      writeRaw(client, formatSseFrame('summary_sync', summary, summary.lastEventId));
    },

    publishCatch(uid, input) {
      const set = subscribers.get(uid);
      if (!set || set.size === 0) return null;
      const eventId = nextEventId();
      const serverTimeMs = input.serverTimeMs ?? now();
      return broadcastEvent(uid, 'catch', eventId, {
        type: 'catch',
        eventId,
        catchItem: input.catchItem,
        bag: input.bag,
        ...(input.fishingState !== undefined ? { fishingState: input.fishingState } : {}),
        ...(input.spotId !== undefined ? { spotId: input.spotId } : {}),
        ...(input.spotName !== undefined ? { spotName: input.spotName } : {}),
        ...(input.seaTheme !== undefined ? { seaTheme: input.seaTheme } : {}),
        serverTimeMs,
      });
    },

    publishBagSync(uid, bag, serverTimeMs) {
      const set = subscribers.get(uid);
      if (!set || set.size === 0) return null;
      const eventId = nextEventId();
      return broadcastEvent(uid, 'bag_sync', eventId, {
        type: 'bag_sync',
        eventId,
        bag,
        serverTimeMs: serverTimeMs ?? now(),
      });
    },

    publishSpotChanged(uid, spot, serverTimeMs) {
      const set = subscribers.get(uid);
      if (!set || set.size === 0) return null;
      const eventId = nextEventId();
      return broadcastEvent(uid, 'spot_changed', eventId, {
        type: 'spot_changed',
        eventId,
        spotId: spot.spotId,
        spotName: spot.spotName,
        seaTheme: spot.seaTheme,
        serverTimeMs: serverTimeMs ?? now(),
      });
    },

    publishStatusChanged(uid, fishingState, serverTimeMs) {
      const set = subscribers.get(uid);
      if (!set || set.size === 0) return null;
      const eventId = nextEventId();
      return broadcastEvent(uid, 'status_changed', eventId, {
        type: 'status_changed',
        eventId,
        fishingState,
        serverTimeMs: serverTimeMs ?? now(),
      });
    },

    hasSubscribers(uid) {
      return (subscribers.get(uid)?.size ?? 0) > 0;
    },

    subscriberCount(uid) {
      if (uid !== undefined) return subscribers.get(uid)?.size ?? 0;
      let total = 0;
      for (const set of subscribers.values()) total += set.size;
      return total;
    },

    disconnectUser(uid) {
      const set = subscribers.get(uid);
      if (!set) return;
      for (const client of [...set]) {
        cleanupClient(client, true);
      }
    },

    close() {
      for (const set of [...subscribers.values()]) {
        for (const client of [...set]) {
          cleanupClient(client, true);
        }
      }
      subscribers.clear();
    },
  };
}

let activeHub: WidgetHub = createWidgetHub();

/** 서버 기동·테스트에서 공용 위젯 SSE 허브 인스턴스를 교체한다 */
export function provideWidgetHub(hub: WidgetHub): void {
  activeHub = hub;
}

/** 현재 프로세스의 공용 위젯 SSE 허브를 돌려준다 */
export function widgetHub(): WidgetHub {
  return activeHub;
}
