// WebSocket 메모리 지표 수집기.
// 업그레이드 성공·거부(401/403/500)·종료 유형(normal/abnormal/idle_timeout)을 KST 일별로 누적하고,
// 주기적·종료 시점(stop)에 DB로 플러시하며 최근 슬라이딩 창 스냅샷을 제공한다.
import { emptyWsCounts, type WsMetricIncrement, type WsMetricsCounts } from '../_data/wsMetrics.js';
import { kstDayOf } from './httpMetrics.js';

const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const DEFAULT_WINDOW_MS = 300_000;

export type WsCloseKind = 'normal' | 'abnormal' | 'idle_timeout';

export interface WsMetricsOptions {
  persist: (rows: WsMetricIncrement[]) => Promise<void>;
  flushIntervalMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
  windowMs?: number;
}

export interface WsMetricsCollector {
  onUpgradeOk: () => void;
  onReject: (status: 401 | 403 | 500) => void;
  onClose: (kind: WsCloseKind) => void;
  recentSnapshot: () => WsMetricsCounts;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
}

function addCounts(dst: WsMetricsCounts, src: WsMetricsCounts): void {
  dst.upgradesOk += src.upgradesOk;
  dst.reject401 += src.reject401;
  dst.reject403 += src.reject403;
  dst.reject500 += src.reject500;
  dst.closeNormal += src.closeNormal;
  dst.closeAbnormal += src.closeAbnormal;
  dst.closeIdleTimeout += src.closeIdleTimeout;
}

export function createWsMetrics(options: WsMetricsOptions): WsMetricsCollector {
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? (() => Date.now());
  const buffer = new Map<string, WsMetricIncrement>();
  const windowBuckets = new Map<number, { maxAtMs: number; counts: WsMetricsCounts }>();
  let inFlight: Promise<void> | null = null;

  function addEntry(entry: WsMetricIncrement): void {
    const existing = buffer.get(entry.day);
    if (existing) {
      addCounts(existing, entry);
      return;
    }
    buffer.set(entry.day, { ...entry });
  }

  function pruneWindow(nowMs: number): void {
    for (const [sec, bucket] of windowBuckets) {
      if (nowMs - bucket.maxAtMs >= windowMs) windowBuckets.delete(sec);
    }
  }

  function recordEvent(patch: Partial<WsMetricsCounts>): void {
    const nowMs = now();
    const day = kstDayOf(nowMs);
    const inc: WsMetricIncrement = {
      day,
      ...emptyWsCounts(),
      ...patch,
    };
    addEntry(inc);

    pruneWindow(nowMs);
    const sec = Math.floor(nowMs / 1000);
    let slot = windowBuckets.get(sec);
    if (!slot) {
      slot = { maxAtMs: nowMs, counts: emptyWsCounts() };
      windowBuckets.set(sec, slot);
    } else if (nowMs > slot.maxAtMs) {
      slot.maxAtMs = nowMs;
    }
    addCounts(slot.counts, inc);
  }

  const onUpgradeOk = () => recordEvent({ upgradesOk: 1 });
  const onReject = (status: 401 | 403 | 500) => {
    if (status === 401) recordEvent({ reject401: 1 });
    else if (status === 403) recordEvent({ reject403: 1 });
    else recordEvent({ reject500: 1 });
  };
  const onClose = (kind: WsCloseKind) => {
    if (kind === 'normal') recordEvent({ closeNormal: 1 });
    else if (kind === 'abnormal') recordEvent({ closeAbnormal: 1 });
    else recordEvent({ closeIdleTimeout: 1 });
  };

  function recentSnapshot(): WsMetricsCounts {
    const nowMs = now();
    pruneWindow(nowMs);
    const summary = emptyWsCounts();
    for (const { counts } of windowBuckets.values()) {
      addCounts(summary, counts);
    }
    return summary;
  }

  async function drainOnce(): Promise<void> {
    if (buffer.size === 0) return;
    const batch = [...buffer.values()];
    buffer.clear();
    try {
      await options.persist(batch);
    } catch (error) {
      for (const item of batch) addEntry(item);
      options.onError?.(error);
    }
  }

  async function flush(): Promise<void> {
    while (inFlight) {
      await inFlight;
    }
    if (buffer.size === 0) return;
    const run = drainOnce().finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    await run;
  }

  const timer = flushIntervalMs > 0
    ? setInterval(() => { void flush(); }, flushIntervalMs)
    : null;
  timer?.unref();

  async function stop(): Promise<void> {
    if (timer) clearInterval(timer);
    await flush();
  }

  return { onUpgradeOk, onReject, onClose, recentSnapshot, flush, stop };
}
