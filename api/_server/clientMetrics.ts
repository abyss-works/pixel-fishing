// 클라이언트 체감 지표 서버 수집기 및 비콘 페이로드 파서.
// 엄격히 검증·정규화한 비식별 수치 비콘만 KST 일별 메모리 버퍼에 적재하고,
// 주기적(30s) 및 종료 시점(stop)에 DB로 플러시한다.
import {
  addClientCounts,
  emptyClientCounts,
  type ClientMetricIncrement,
} from '../_data/clientMetrics.js';
import { kstDayOf } from './httpMetrics.js';

const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const MAX_LATENCY_MS = 120_000;
const MAX_RTT_SAMPLES = 32;
const MAX_CLS_VALUE = 100;
const MAX_CANVAS_FRAMES = 500_000;
const MAX_EVENT_COUNT = 10_000;

export interface ParsedClientMetricBeacon {
  lcpMs?: number;
  inpMs?: number;
  ttfbMs?: number;
  clsX1000?: number;
  actionRttsMs: number[];
  actionTimeouts: number;
  actionConflicts409: number;
  meRttsMs: number[];
  meTimeouts: number;
  canvasFrames: number;
  canvasLongFrames: number;
  wsReconnects: number;
  wsAbnormalCloses: number;
}

export interface ClientMetricsOptions {
  persist: (rows: ClientMetricIncrement[]) => Promise<void>;
  flushIntervalMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

export interface ClientMetricsCollector {
  record: (beacon: ParsedClientMetricBeacon) => void;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
}

function readLatencyMs(raw: unknown): number | null | 'invalid' {
  if (raw === undefined) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > MAX_LATENCY_MS) {
    return 'invalid';
  }
  return Math.round(raw);
}

function readLatencyList(raw: unknown): number[] | 'invalid' {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_RTT_SAMPLES) return 'invalid';
  const out: number[] = [];
  for (const item of raw) {
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > MAX_LATENCY_MS) {
      return 'invalid';
    }
    out.push(Math.round(item));
  }
  return out;
}

function readIntCount(raw: unknown, max: number): number | 'invalid' {
  if (raw === undefined) return 0;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > max) {
    return 'invalid';
  }
  return raw;
}

/**
 * 클라이언트 비콘 본문을 엄격하게 검증·정규화한다.
 * 비음수 유한 수치와 상한 내 값만 허용하고 문자열·미지 필드·PII는 모두 무시·제거한다.
 */
export function parseClientMetricBeacon(raw: unknown): ParsedClientMetricBeacon | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const lcpMs = readLatencyMs(obj.lcpMs);
  const inpMs = readLatencyMs(obj.inpMs);
  const ttfbMs = readLatencyMs(obj.ttfbMs);
  if (lcpMs === 'invalid' || inpMs === 'invalid' || ttfbMs === 'invalid') return null;

  let clsX1000: number | undefined;
  if (obj.cls !== undefined) {
    if (typeof obj.cls !== 'number' || !Number.isFinite(obj.cls) || obj.cls < 0 || obj.cls > MAX_CLS_VALUE) {
      return null;
    }
    clsX1000 = Math.round(obj.cls * 1000);
  }

  const actionRttsMs = readLatencyList(obj.actionRttsMs);
  const meRttsMs = readLatencyList(obj.meRttsMs);
  if (actionRttsMs === 'invalid' || meRttsMs === 'invalid') return null;

  const actionTimeouts = readIntCount(obj.actionTimeouts, MAX_EVENT_COUNT);
  const actionConflicts409 = readIntCount(obj.actionConflicts409, MAX_EVENT_COUNT);
  const meTimeouts = readIntCount(obj.meTimeouts, MAX_EVENT_COUNT);
  const canvasFrames = readIntCount(obj.canvasFrames, MAX_CANVAS_FRAMES);
  const canvasLongFrames = readIntCount(obj.canvasLongFrames, MAX_CANVAS_FRAMES);
  const wsReconnects = readIntCount(obj.wsReconnects, MAX_EVENT_COUNT);
  const wsAbnormalCloses = readIntCount(obj.wsAbnormalCloses, MAX_EVENT_COUNT);

  if (
    actionTimeouts === 'invalid'
    || actionConflicts409 === 'invalid'
    || meTimeouts === 'invalid'
    || canvasFrames === 'invalid'
    || canvasLongFrames === 'invalid'
    || wsReconnects === 'invalid'
    || wsAbnormalCloses === 'invalid'
  ) {
    return null;
  }

  const normalizedCanvasLongFrames = Math.min(canvasLongFrames, canvasFrames);

  const hasData = lcpMs !== null
    || inpMs !== null
    || ttfbMs !== null
    || clsX1000 !== undefined
    || actionRttsMs.length > 0
    || actionTimeouts > 0
    || actionConflicts409 > 0
    || meRttsMs.length > 0
    || meTimeouts > 0
    || canvasFrames > 0
    || normalizedCanvasLongFrames > 0
    || wsReconnects > 0
    || wsAbnormalCloses > 0;

  if (!hasData) return null;

  return {
    ...(lcpMs !== null ? { lcpMs } : {}),
    ...(inpMs !== null ? { inpMs } : {}),
    ...(ttfbMs !== null ? { ttfbMs } : {}),
    ...(clsX1000 !== undefined ? { clsX1000 } : {}),
    actionRttsMs,
    actionTimeouts,
    actionConflicts409,
    meRttsMs,
    meTimeouts,
    canvasFrames,
    canvasLongFrames: normalizedCanvasLongFrames,
    wsReconnects,
    wsAbnormalCloses,
  };
}

function toIncrement(day: string, b: ParsedClientMetricBeacon): ClientMetricIncrement {
  const inc: ClientMetricIncrement = { day, ...emptyClientCounts(), reports: 1 };

  if (b.lcpMs !== undefined) {
    inc.lcpCount = 1;
    inc.lcpSumMs = b.lcpMs;
    if (b.lcpMs <= 1500) inc.lcpLe1500 = 1;
    else if (b.lcpMs <= 2500) inc.lcpLe2500 = 1;
    else if (b.lcpMs <= 4000) inc.lcpLe4000 = 1;
    else inc.lcpGt4000 = 1;
  }

  if (b.inpMs !== undefined) {
    inc.inpCount = 1;
    inc.inpSumMs = b.inpMs;
    if (b.inpMs <= 100) inc.inpLe100 = 1;
    else if (b.inpMs <= 200) inc.inpLe200 = 1;
    else if (b.inpMs <= 500) inc.inpLe500 = 1;
    else inc.inpGt500 = 1;
  }

  if (b.ttfbMs !== undefined) {
    inc.ttfbCount = 1;
    inc.ttfbSumMs = b.ttfbMs;
    if (b.ttfbMs <= 200) inc.ttfbLe200 = 1;
    else if (b.ttfbMs <= 500) inc.ttfbLe500 = 1;
    else if (b.ttfbMs <= 1000) inc.ttfbLe1000 = 1;
    else inc.ttfbGt1000 = 1;
  }

  if (b.clsX1000 !== undefined) {
    inc.clsCount = 1;
    inc.clsSumX1000 = b.clsX1000;
  }

  for (const rtt of b.actionRttsMs) {
    inc.actionRttCount += 1;
    inc.actionRttSumMs += rtt;
    if (rtt <= 100) inc.actionRttLe100 += 1;
    else if (rtt <= 250) inc.actionRttLe250 += 1;
    else if (rtt <= 500) inc.actionRttLe500 += 1;
    else if (rtt <= 1000) inc.actionRttLe1000 += 1;
    else inc.actionRttGt1000 += 1;
  }
  inc.actionTimeouts = b.actionTimeouts;
  inc.actionConflicts409 = b.actionConflicts409;

  for (const rtt of b.meRttsMs) {
    inc.meRttCount += 1;
    inc.meRttSumMs += rtt;
    if (rtt <= 100) inc.meRttLe100 += 1;
    else if (rtt <= 250) inc.meRttLe250 += 1;
    else if (rtt <= 500) inc.meRttLe500 += 1;
    else if (rtt <= 1000) inc.meRttLe1000 += 1;
    else inc.meRttGt1000 += 1;
  }
  inc.meTimeouts = b.meTimeouts;

  inc.canvasFrames = b.canvasFrames;
  inc.canvasLongFrames = b.canvasLongFrames;
  inc.wsReconnects = b.wsReconnects;
  inc.wsAbnormalCloses = b.wsAbnormalCloses;
  return inc;
}

export function createClientMetrics(options: ClientMetricsOptions): ClientMetricsCollector {
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const now = options.now ?? (() => Date.now());
  const buffer = new Map<string, ClientMetricIncrement>();
  let inFlight: Promise<void> | null = null;

  function addEntry(entry: ClientMetricIncrement): void {
    const existing = buffer.get(entry.day);
    if (existing) {
      addClientCounts(existing, entry);
      return;
    }
    buffer.set(entry.day, { ...entry });
  }

  function record(beacon: ParsedClientMetricBeacon): void {
    const day = kstDayOf(now());
    addEntry(toIncrement(day, beacon));
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

  return { record, flush, stop };
}

let recorder: (beacon: ParsedClientMetricBeacon) => void = () => {};

/** 서버 기동 시 클라이언트 지표 수집기 기록 함수를 등록한다 */
export function provideClientMetricsRecorder(fn: (beacon: ParsedClientMetricBeacon) => void): void {
  recorder = fn;
}

/** 검증된 클라이언트 지표 비콘을 활성 수집기에 적재한다 */
export function recordClientMetricBeacon(beacon: ParsedClientMetricBeacon): void {
  recorder(beacon);
}
