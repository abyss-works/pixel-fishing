// 운영 관측 런타임 조회 게터 및 다중 파드 지표 합산 — 프로세스 기동 시 수집기 게터를 등록하고 관리자 핸들러가 진입점과 결합 없이 읽는다.
import {
  emptyHttpCounts,
  withHttpRates,
  type HttpMetricsCounts,
  type LatencyBuckets,
  type RateLimitReasons,
} from '../_data/httpMetrics.js';
import { emptyWsCounts, type WsMetricsCounts } from '../_data/wsMetrics.js';
import type { SlowHttpRequest } from './httpMetrics.js';
import type { PodMetricsSnapshot } from './realtimeBus.js';

const MAX_SLOW_REQUESTS = 20;
const POD_METRICS_STALE_MS = 90_000;

function parseUpdatedAtMs(updatedAt: unknown): number {
  if (typeof updatedAt === 'number') return updatedAt;
  if (typeof updatedAt === 'string') return Date.parse(updatedAt);
  return NaN;
}

let slowRequestsProvider: () => SlowHttpRequest[] | Promise<SlowHttpRequest[]> = () => [];
let recentHttpProvider: () => HttpMetricsCounts | null | Promise<HttpMetricsCounts | null> = () => null;
let recentWsProvider: () => WsMetricsCounts | null | Promise<WsMetricsCounts | null> = () => null;

export function provideSlowRequests(fn: () => SlowHttpRequest[] | Promise<SlowHttpRequest[]>): void {
  slowRequestsProvider = fn;
}

/** 최근 임계 지연 초과 요청 목록(비식별)을 돌려준다 */
export async function slowRequests(): Promise<SlowHttpRequest[]> {
  return await slowRequestsProvider();
}

export function provideRecentHttpSummary(
  fn: () => HttpMetricsCounts | null | Promise<HttpMetricsCounts | null>,
): void {
  recentHttpProvider = fn;
}

/** 최근 창 기준 HTTP 응답 요약을 돌려준다. 수집기 미등록 시 null */
export async function recentHttpSummary(): Promise<HttpMetricsCounts | null> {
  return await recentHttpProvider();
}

export function provideRecentWsSnapshot(
  fn: () => WsMetricsCounts | null | Promise<WsMetricsCounts | null>,
): void {
  recentWsProvider = fn;
}

/** 최근 창 기준 WebSocket 지표 요약을 돌려준다. 수집기 미등록 시 null */
export async function recentWsSnapshot(): Promise<WsMetricsCounts | null> {
  return await recentWsProvider();
}

export interface PodHttpMetricsInput {
  total?: number;
  status409?: number;
  status426?: number;
  status429?: number;
  rateLimited?: number;
  status4xx?: number;
  status5xx?: number;
  latencyBuckets?: Partial<LatencyBuckets> & { sumMs?: number };
  rateLimitReasons?: Partial<RateLimitReasons>;
}

export interface AggregatedPodMetrics {
  http: HttpMetricsCounts | null;
  ws: WsMetricsCounts | null;
  slowRequests: SlowHttpRequest[];
  connections: number;
  onlineUsers: number;
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 여러 파드의 최근 창 HTTP/WS/슬로우 요청 스냅샷을 단일 관측 뷰로 합산한다 */
export function aggregatePodMetrics(
  snapshots: readonly PodMetricsSnapshot[],
  now = Date.now(),
): AggregatedPodMetrics {
  const httpCounts = emptyHttpCounts();
  const wsCounts = emptyWsCounts();
  let hasHttp = false;
  let hasWs = false;
  let connections = 0;
  let onlineUsers = 0;
  const slow: SlowHttpRequest[] = [];

  for (const snap of snapshots) {
    const updatedAtMs = parseUpdatedAtMs(snap.updatedAt);
    if (!Number.isFinite(updatedAtMs) || now - updatedAtMs > POD_METRICS_STALE_MS) {
      continue;
    }
    connections += num(snap.connections);
    onlineUsers += num(snap.onlineUsers);

    const rawHttp = snap.http;
    if (isRecord(rawHttp)) {
      hasHttp = true;
      httpCounts.total += num(rawHttp.total);
      httpCounts.status409 += num(rawHttp.status409);
      httpCounts.status426 += num(rawHttp.status426);
      httpCounts.status429 += num(rawHttp.status429 ?? rawHttp.rateLimited);
      httpCounts.status4xx += num(rawHttp.status4xx);
      httpCounts.status5xx += num(rawHttp.status5xx);

      const buckets = rawHttp.latencyBuckets;
      if (isRecord(buckets)) {
        httpCounts.le50 += num(buckets.le50);
        httpCounts.le100 += num(buckets.le100);
        httpCounts.le250 += num(buckets.le250);
        httpCounts.le500 += num(buckets.le500);
        httpCounts.le1000 += num(buckets.le1000);
        httpCounts.le2500 += num(buckets.le2500);
        httpCounts.gt2500 += num(buckets.gt2500);
        httpCounts.sumMs += num(buckets.sumMs);
      }

      const reasons = rawHttp.rateLimitReasons;
      if (isRecord(reasons)) {
        httpCounts.catchTooSoon += num(reasons.catchTooSoon);
        httpCounts.letterGap += num(reasons.letterGap);
        httpCounts.other += num(reasons.other);
      }
    }

    const rawWs = snap.ws;
    if (isRecord(rawWs)) {
      hasWs = true;
      wsCounts.upgradesOk += num(rawWs.upgradesOk);
      wsCounts.reject401 += num(rawWs.reject401);
      wsCounts.reject403 += num(rawWs.reject403);
      wsCounts.reject500 += num(rawWs.reject500);
      wsCounts.closeNormal += num(rawWs.closeNormal);
      wsCounts.closeAbnormal += num(rawWs.closeAbnormal);
      wsCounts.closeIdleTimeout += num(rawWs.closeIdleTimeout);
    }

    if (Array.isArray(snap.slowRequests)) {
      for (const item of snap.slowRequests) {
        if (isRecord(item) && typeof item.at === 'string' && typeof item.path === 'string') {
          slow.push(item as unknown as SlowHttpRequest);
        }
      }
    }
  }

  slow.sort((a, b) => {
    const byAt = b.at.localeCompare(a.at);
    return byAt !== 0 ? byAt : b.durationMs - a.durationMs;
  });

  return {
    http: hasHttp ? withHttpRates(httpCounts) : null,
    ws: hasWs ? wsCounts : null,
    slowRequests: slow.slice(0, MAX_SLOW_REQUESTS),
    connections,
    onlineUsers,
  };
}
