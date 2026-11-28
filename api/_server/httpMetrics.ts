// Express HTTP 응답 지표 수집 미들웨어.
// 응답이 끝날 때(finish) KST 날짜·경로 묶음별로 상태 코드·지연 버킷·429 사유를 메모리에 누적하고,
// 비식별 슬로우 요청 링 버퍼와 최근 창 요약을 유지하며 주기적·종료 시점(stop)에 DB로 플러시한다.
import type { ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import {
  emptyHttpCounts,
  latencyBucketsOf,
  withHttpRates,
  type HttpMetricIncrement,
  type HttpMetricRouteGroup,
  type HttpMetricsCounts,
  type LatencyBuckets,
  type MutableHttpCounts,
  type RateLimitReasons,
} from '../_data/httpMetrics.js';

const KST_OFFSET_MS = 9 * 3_600_000;
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const DEFAULT_MAX_BUFFERED_KEYS = 200;
const DEFAULT_SLOW_THRESHOLD_MS = 500;
const DEFAULT_MAX_SLOW_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 300_000;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;

export type RateLimitReason = 'catch-too-soon' | 'letter-gap';

const rateLimitReasonByRes = new WeakMap<ServerResponse, RateLimitReason>();

/** 429 응답을 반환하기 직전에 응답 객체에 속도 제한 사유를 표시한다 */
export function markRateLimitReason(res: ServerResponse, reason: RateLimitReason): void {
  rateLimitReasonByRes.set(res, reason);
}

/** 요청 경로에서 쿼리·해시를 떼고 UUID·숫자 ID 세그먼트를 :id로 치환해 PII를 제거한다 */
export function sanitizeMetricPath(rawUrl: string | undefined): string {
  const withoutQuery = (rawUrl ?? '/').split('?', 1)[0]?.split('#', 1)[0] ?? '/';
  if (!withoutQuery || withoutQuery === '/') return '/';
  const normalized = withoutQuery
    .split('/')
    .map(seg => (UUID_SEGMENT.test(seg) || NUMERIC_SEGMENT.test(seg) ? ':id' : seg))
    .join('/');
  return normalized || '/';
}

const matchesPrefix = (path: string, prefix: string): boolean =>
  path === prefix || path.startsWith(`${prefix}/`);

/** 요청 경로를 action·auth·admin·api·web 5개 묶음으로 분류한다 */
export function routeGroupOf(rawUrl: string | undefined): HttpMetricRouteGroup {
  const path = (rawUrl ?? '/').split('?', 1)[0] ?? '/';
  if (matchesPrefix(path, '/api/action')) return 'action';
  if (matchesPrefix(path, '/api/auth')) return 'auth';
  if (matchesPrefix(path, '/api/admin')) return 'admin';
  if (matchesPrefix(path, '/api')) return 'api';
  return 'web';
}

/** UTC 밀리초 시각을 KST(UTC+9) 날짜 문자열(YYYY-MM-DD)로 바꾼다 */
export function kstDayOf(nowMs = Date.now()): string {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface SlowHttpRequest {
  at: string;
  method: string;
  routeGroup: HttpMetricRouteGroup;
  path: string;
  statusCode: number;
  durationMs: number;
}

export interface HttpRecordOptions {
  durationMs?: number;
  method?: string;
  rateLimitReason?: RateLimitReason;
}

export interface HttpMetricsOptions {
  persist: (rows: HttpMetricIncrement[]) => Promise<void>;
  flushIntervalMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
  maxBufferedKeys?: number;
  slowThresholdMs?: number;
  maxSlowRequests?: number;
  windowMs?: number;
}

export type HttpWindowSnapshot = HttpMetricsCounts & {
  latencyBuckets: LatencyBuckets & { sumMs: number };
};

export interface HttpMetricsCollector {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  record: (rawUrl: string | undefined, statusCode: number, opts?: HttpRecordOptions) => void;
  slowRequests: () => SlowHttpRequest[];
  recentWindowSummary: () => HttpMetricsCounts;
  recentWindowSnapshot: () => HttpWindowSnapshot;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
}

const emptyBuckets = (): LatencyBuckets & { sumMs: number } => ({
  le50: 0, le100: 0, le250: 0, le500: 0, le1000: 0, le2500: 0, gt2500: 0, sumMs: 0,
});

const emptyRateLimitReasons = (): RateLimitReasons => ({
  catchTooSoon: 0, letterGap: 0, other: 0,
});

function addBucket(target: MutableHttpCounts | (LatencyBuckets & { sumMs: number }), durationMs: number): void {
  const d = Math.max(0, Math.round(durationMs));
  target.sumMs += d;
  if (d <= 50) target.le50 += 1;
  else if (d <= 100) target.le100 += 1;
  else if (d <= 250) target.le250 += 1;
  else if (d <= 500) target.le500 += 1;
  else if (d <= 1000) target.le1000 += 1;
  else if (d <= 2500) target.le2500 += 1;
  else target.gt2500 += 1;
}

export function createHttpMetrics(options: HttpMetricsOptions): HttpMetricsCollector {
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const maxBufferedKeys = options.maxBufferedKeys ?? DEFAULT_MAX_BUFFERED_KEYS;
  const slowThresholdMs = options.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS;
  const maxSlowRequests = options.maxSlowRequests ?? DEFAULT_MAX_SLOW_REQUESTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? (() => Date.now());
  const buffer = new Map<string, HttpMetricIncrement>();
  const slowRing: SlowHttpRequest[] = [];
  const windowBuckets = new Map<number, { maxAtMs: number; counts: MutableHttpCounts }>();
  let inFlight: Promise<void> | null = null;

  function addEntry(entry: HttpMetricIncrement): void {
    const key = `${entry.day}\0${entry.routeGroup}`;
    const existing = buffer.get(key);
    const b = entry.latencyBuckets;
    const rl = entry.rateLimitReasons;
    if (existing) {
      existing.total += entry.total;
      existing.status409 = (existing.status409 ?? 0) + (entry.status409 ?? 0);
      existing.status426 += entry.status426;
      existing.status429 += entry.status429;
      existing.status4xx = (existing.status4xx ?? 0) + (entry.status4xx ?? 0);
      existing.status5xx += entry.status5xx;
      if (b) {
        const dst = (existing.latencyBuckets ??= emptyBuckets());
        dst.le50 = (dst.le50 ?? 0) + (b.le50 ?? 0);
        dst.le100 = (dst.le100 ?? 0) + (b.le100 ?? 0);
        dst.le250 = (dst.le250 ?? 0) + (b.le250 ?? 0);
        dst.le500 = (dst.le500 ?? 0) + (b.le500 ?? 0);
        dst.le1000 = (dst.le1000 ?? 0) + (b.le1000 ?? 0);
        dst.le2500 = (dst.le2500 ?? 0) + (b.le2500 ?? 0);
        dst.gt2500 = (dst.gt2500 ?? 0) + (b.gt2500 ?? 0);
        dst.sumMs = (dst.sumMs ?? 0) + (b.sumMs ?? 0);
      }
      if (rl) {
        const dst = (existing.rateLimitReasons ??= emptyRateLimitReasons());
        dst.catchTooSoon = (dst.catchTooSoon ?? 0) + (rl.catchTooSoon ?? 0);
        dst.letterGap = (dst.letterGap ?? 0) + (rl.letterGap ?? 0);
        dst.other = (dst.other ?? 0) + (rl.other ?? 0);
      }
      return;
    }
    if (buffer.size >= maxBufferedKeys) {
      const oldest = buffer.keys().next().value;
      if (oldest !== undefined) buffer.delete(oldest);
    }
    buffer.set(key, {
      day: entry.day,
      routeGroup: entry.routeGroup,
      total: entry.total,
      status409: entry.status409 ?? 0,
      status426: entry.status426,
      status429: entry.status429,
      status4xx: entry.status4xx ?? 0,
      status5xx: entry.status5xx,
      latencyBuckets: { ...emptyBuckets(), ...b },
      rateLimitReasons: { ...emptyRateLimitReasons(), ...rl },
    });
  }

  function pruneWindow(nowMs: number): void {
    for (const [sec, bucket] of windowBuckets) {
      if (nowMs - bucket.maxAtMs >= windowMs) windowBuckets.delete(sec);
    }
  }

  function recordWindow(
    nowMs: number,
    statusCode: number,
    durationMs: number | undefined,
    rlReason: RateLimitReason | undefined,
  ): void {
    pruneWindow(nowMs);
    const sec = Math.floor(nowMs / 1000);
    let slot = windowBuckets.get(sec);
    if (!slot) {
      slot = { maxAtMs: nowMs, counts: emptyHttpCounts() };
      windowBuckets.set(sec, slot);
    } else if (nowMs > slot.maxAtMs) {
      slot.maxAtMs = nowMs;
    }
    const c = slot.counts;
    c.total += 1;
    if (statusCode === 409) c.status409 += 1;
    if (statusCode === 426) c.status426 += 1;
    if (statusCode === 429) {
      c.status429 += 1;
      if (rlReason === 'catch-too-soon') c.catchTooSoon += 1;
      else if (rlReason === 'letter-gap') c.letterGap += 1;
      else c.other += 1;
    }
    if (statusCode >= 400 && statusCode <= 499) c.status4xx += 1;
    if (statusCode >= 500 && statusCode <= 599) c.status5xx += 1;
    if (durationMs !== undefined) addBucket(c, durationMs);
  }

  function record(rawUrl: string | undefined, statusCode: number, opts?: HttpRecordOptions): void {
    const nowMs = now();
    const routeGroup = routeGroupOf(rawUrl);
    const durationMs = opts?.durationMs;
    const rlReason = opts?.rateLimitReason;
    const buckets = emptyBuckets();
    if (durationMs !== undefined) addBucket(buckets, durationMs);

    const rateLimitReasons = emptyRateLimitReasons();
    if (statusCode === 429) {
      if (rlReason === 'catch-too-soon') rateLimitReasons.catchTooSoon = 1;
      else if (rlReason === 'letter-gap') rateLimitReasons.letterGap = 1;
      else rateLimitReasons.other = 1;
    }

    addEntry({
      day: kstDayOf(nowMs),
      routeGroup,
      total: 1,
      status409: statusCode === 409 ? 1 : 0,
      status426: statusCode === 426 ? 1 : 0,
      status429: statusCode === 429 ? 1 : 0,
      status4xx: statusCode >= 400 && statusCode <= 499 ? 1 : 0,
      status5xx: statusCode >= 500 && statusCode <= 599 ? 1 : 0,
      latencyBuckets: buckets,
      rateLimitReasons,
    });
    recordWindow(nowMs, statusCode, durationMs, rlReason);

    if (durationMs !== undefined && durationMs >= slowThresholdMs && maxSlowRequests > 0) {
      const rounded = Math.max(0, Math.round(durationMs));
      slowRing.push({
        at: new Date(nowMs).toISOString(),
        method: (opts?.method ?? 'GET').toUpperCase(),
        routeGroup,
        path: sanitizeMetricPath(rawUrl),
        statusCode,
        durationMs: rounded,
      });
      if (slowRing.length > maxSlowRequests) {
        slowRing.splice(0, slowRing.length - maxSlowRequests);
      }
    }
  }

  function slowRequests(): SlowHttpRequest[] {
    return [...slowRing].reverse();
  }

  function sumWindowCounts(): MutableHttpCounts {
    const nowMs = now();
    pruneWindow(nowMs);
    const totalCounts = emptyHttpCounts();
    for (const { counts } of windowBuckets.values()) {
      totalCounts.total += counts.total;
      totalCounts.status409 += counts.status409;
      totalCounts.status426 += counts.status426;
      totalCounts.status429 += counts.status429;
      totalCounts.status4xx += counts.status4xx;
      totalCounts.status5xx += counts.status5xx;
      totalCounts.le50 += counts.le50;
      totalCounts.le100 += counts.le100;
      totalCounts.le250 += counts.le250;
      totalCounts.le500 += counts.le500;
      totalCounts.le1000 += counts.le1000;
      totalCounts.le2500 += counts.le2500;
      totalCounts.gt2500 += counts.gt2500;
      totalCounts.sumMs += counts.sumMs;
      totalCounts.catchTooSoon += counts.catchTooSoon;
      totalCounts.letterGap += counts.letterGap;
      totalCounts.other += counts.other;
    }
    return totalCounts;
  }

  function recentWindowSummary(): HttpMetricsCounts {
    return withHttpRates(sumWindowCounts());
  }

  function recentWindowSnapshot(): HttpWindowSnapshot {
    const counts = sumWindowCounts();
    return {
      ...withHttpRates(counts),
      latencyBuckets: latencyBucketsOf(counts),
    };
  }

  async function drainOnce(): Promise<void> {
    if (buffer.size === 0) return;
    const batch = [...buffer.values()];
    buffer.clear();
    try {
      await options.persist(batch);
    } catch (error) {
      // 저장에 실패하면 이번 배치분을 현재 버퍼에 다시 합산해 다음 플러시에서 재시도한다.
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

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const startMs = performance.now();
    const url = req.originalUrl || req.url;
    const method = req.method || 'GET';
    res.once('finish', () => {
      const durationMs = Math.max(0, Math.round(performance.now() - startMs));
      const rateLimitReason = rateLimitReasonByRes.get(res);
      record(url, res.statusCode, { durationMs, method, rateLimitReason });
    });
    next();
  }

  async function stop(): Promise<void> {
    if (timer) clearInterval(timer);
    await flush();
  }

  return { middleware, record, slowRequests, recentWindowSummary, recentWindowSnapshot, flush, stop };
}
