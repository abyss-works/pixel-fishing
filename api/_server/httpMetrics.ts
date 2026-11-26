// Express HTTP 응답 지표 수집 미들웨어.
// 응답이 끝날 때(finish) KST 날짜·경로 묶음별로 전체·426·429·5xx 건수를 메모리에 누적하고,
// 일정 주기와 종료 신호(stop)에서 저장 함수(persist)로 일괄 플러시한다.
import type { NextFunction, Request, Response } from 'express';
import type { HttpMetricIncrement, HttpMetricRouteGroup } from '../_data/httpMetrics.js';

const KST_OFFSET_MS = 9 * 3_600_000;
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const DEFAULT_MAX_BUFFERED_KEYS = 200;

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

export interface HttpMetricsOptions {
  persist: (rows: HttpMetricIncrement[]) => Promise<void>;
  flushIntervalMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
  maxBufferedKeys?: number;
}

export interface HttpMetricsCollector {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  record: (rawUrl: string | undefined, statusCode: number) => void;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createHttpMetrics(options: HttpMetricsOptions): HttpMetricsCollector {
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const maxBufferedKeys = options.maxBufferedKeys ?? DEFAULT_MAX_BUFFERED_KEYS;
  const now = options.now ?? (() => Date.now());
  const buffer = new Map<string, HttpMetricIncrement>();
  let inFlight: Promise<void> | null = null;

  function addEntry(entry: HttpMetricIncrement): void {
    const key = `${entry.day}\0${entry.routeGroup}`;
    const existing = buffer.get(key);
    if (existing) {
      existing.total += entry.total;
      existing.status426 += entry.status426;
      existing.status429 += entry.status429;
      existing.status5xx += entry.status5xx;
      return;
    }
    if (buffer.size >= maxBufferedKeys) {
      const oldest = buffer.keys().next().value;
      if (oldest !== undefined) buffer.delete(oldest);
    }
    buffer.set(key, { ...entry });
  }

  function record(rawUrl: string | undefined, statusCode: number): void {
    addEntry({
      day: kstDayOf(now()),
      routeGroup: routeGroupOf(rawUrl),
      total: 1,
      status426: statusCode === 426 ? 1 : 0,
      status429: statusCode === 429 ? 1 : 0,
      status5xx: statusCode >= 500 && statusCode <= 599 ? 1 : 0,
    });
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
    const url = req.originalUrl || req.url;
    res.once('finish', () => {
      record(url, res.statusCode);
    });
    next();
  }

  async function stop(): Promise<void> {
    if (timer) clearInterval(timer);
    await flush();
  }

  return { middleware, record, flush, stop };
}
