// 앱 서버 HTTP 응답 일별 지표(http_metrics_daily) 쓰기·읽기 소유 모듈.
// Express 미들웨어가 메모리에 모은 KST 일별·경로 묶음별 증분을 합산 upsert하고,
// 관리자 조회(readHttpMetrics)로 요약·일별 추이·경로별 합계·원본 행을 돌려준다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { jsonParam } from './json.js';

export const HTTP_METRIC_ROUTE_GROUPS = ['action', 'auth', 'admin', 'api', 'web'] as const;
export type HttpMetricRouteGroup = (typeof HTTP_METRIC_ROUTE_GROUPS)[number];

export interface LatencyBuckets {
  le50: number;
  le100: number;
  le250: number;
  le500: number;
  le1000: number;
  le2500: number;
  gt2500: number;
}

export interface LatencySummary {
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  avgMs: number | null;
  samples: number;
}

export interface RateLimitReasons {
  catchTooSoon: number;
  letterGap: number;
  other: number;
}

export interface HttpMetricIncrement {
  day: string;
  routeGroup: HttpMetricRouteGroup;
  total: number;
  status409?: number;
  status426: number;
  status429: number;
  status4xx?: number;
  status5xx: number;
  latencyBuckets?: Partial<LatencyBuckets> & { sumMs?: number };
  rateLimitReasons?: Partial<RateLimitReasons>;
}

export interface HttpMetricsCounts {
  total: number;
  status409: number;
  status426: number;
  status429: number;
  status4xx: number;
  status5xx: number;
  rate409: number;
  rate426: number;
  rate429: number;
  rate4xx: number;
  rate5xx: number;
  latency: LatencySummary;
  rateLimitReasons: RateLimitReasons;
}

export interface HttpMetricsDayRow extends HttpMetricsCounts {
  day: string;
}

export interface HttpMetricsRouteRow extends HttpMetricsCounts {
  routeGroup: HttpMetricRouteGroup;
}

export interface HttpMetricsRawRow {
  day: string;
  routeGroup: HttpMetricRouteGroup;
  total: number;
  status409: number;
  status426: number;
  status429: number;
  status4xx: number;
  status5xx: number;
  latencyBuckets: LatencyBuckets & { sumMs: number };
  rateLimitReasons: RateLimitReasons;
}

export interface HttpMetricsReport {
  days: number;
  scope: 'app_server';
  summary: HttpMetricsCounts;
  daily: HttpMetricsDayRow[];
  byRoute: HttpMetricsRouteRow[];
  rows: HttpMetricsRawRow[];
}

const MAX_DAYS = 90;

export interface MutableHttpCounts {
  total: number;
  status409: number;
  status426: number;
  status429: number;
  status4xx: number;
  status5xx: number;
  le50: number;
  le100: number;
  le250: number;
  le500: number;
  le1000: number;
  le2500: number;
  gt2500: number;
  sumMs: number;
  catchTooSoon: number;
  letterGap: number;
  other: number;
}

export const emptyHttpCounts = (): MutableHttpCounts => ({
  total: 0,
  status409: 0,
  status426: 0,
  status429: 0,
  status4xx: 0,
  status5xx: 0,
  le50: 0,
  le100: 0,
  le250: 0,
  le500: 0,
  le1000: 0,
  le2500: 0,
  gt2500: 0,
  sumMs: 0,
  catchTooSoon: 0,
  letterGap: 0,
  other: 0,
});

const rateOf = (count: number, total: number): number =>
  total > 0 ? Math.round((count / total) * 1_000_000) / 1_000_000 : 0;

/** 지연 히스토그램 버킷과 합계 시간으로 p50·p95·p99·평균(ms)을 추정한다 */
export function estimateLatencyPercentiles(buckets: LatencyBuckets, sumMs: number): LatencySummary {
  const samples =
    buckets.le50
    + buckets.le100
    + buckets.le250
    + buckets.le500
    + buckets.le1000
    + buckets.le2500
    + buckets.gt2500;
  if (samples <= 0) {
    return { p50Ms: null, p95Ms: null, p99Ms: null, avgMs: null, samples: 0 };
  }
  const avgMs = Math.round(sumMs / samples);
  const gtUpper = Math.max(2500, avgMs);
  const steps: readonly [number, number][] = [
    [buckets.le50, 50],
    [buckets.le100, 100],
    [buckets.le250, 250],
    [buckets.le500, 500],
    [buckets.le1000, 1000],
    [buckets.le2500, 2500],
    [buckets.gt2500, gtUpper],
  ];
  const pick = (q: number): number => {
    const rank = Math.ceil(samples * q);
    let cum = 0;
    for (const [count, upper] of steps) {
      cum += count;
      if (cum >= rank) return upper;
    }
    return gtUpper;
  };
  return {
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
    p99Ms: pick(0.99),
    avgMs,
    samples,
  };
}

export function latencyBucketsOf(c: MutableHttpCounts): LatencyBuckets & { sumMs: number } {
  return {
    le50: c.le50,
    le100: c.le100,
    le250: c.le250,
    le500: c.le500,
    le1000: c.le1000,
    le2500: c.le2500,
    gt2500: c.gt2500,
    sumMs: c.sumMs,
  };
}

export function withHttpRates(c: MutableHttpCounts): HttpMetricsCounts {
  return {
    total: c.total,
    status409: c.status409,
    status426: c.status426,
    status429: c.status429,
    status4xx: c.status4xx,
    status5xx: c.status5xx,
    rate409: rateOf(c.status409, c.total),
    rate426: rateOf(c.status426, c.total),
    rate429: rateOf(c.status429, c.total),
    rate4xx: rateOf(c.status4xx, c.total),
    rate5xx: rateOf(c.status5xx, c.total),
    latency: estimateLatencyPercentiles(c, c.sumMs),
    rateLimitReasons: {
      catchTooSoon: c.catchTooSoon,
      letterGap: c.letterGap,
      other: c.other,
    },
  };
}

interface NormalizedIncrement {
  day: string;
  routeGroup: HttpMetricRouteGroup;
  total: number;
  status409: number;
  status426: number;
  status429: number;
  status4xx: number;
  status5xx: number;
  le50: number;
  le100: number;
  le250: number;
  le500: number;
  le1000: number;
  le2500: number;
  gt2500: number;
  sumMs: number;
  catchTooSoon: number;
  letterGap: number;
  other: number;
}

function normalizeIncrement(row: HttpMetricIncrement): NormalizedIncrement {
  const b = row.latencyBuckets;
  const rl = row.rateLimitReasons;
  return {
    day: row.day,
    routeGroup: row.routeGroup,
    total: row.total,
    status409: row.status409 ?? 0,
    status426: row.status426,
    status429: row.status429,
    status4xx: row.status4xx ?? 0,
    status5xx: row.status5xx,
    le50: b?.le50 ?? 0,
    le100: b?.le100 ?? 0,
    le250: b?.le250 ?? 0,
    le500: b?.le500 ?? 0,
    le1000: b?.le1000 ?? 0,
    le2500: b?.le2500 ?? 0,
    gt2500: b?.gt2500 ?? 0,
    sumMs: b?.sumMs ?? 0,
    catchTooSoon: rl?.catchTooSoon ?? 0,
    letterGap: rl?.letterGap ?? 0,
    other: rl?.other ?? 0,
  };
}

function isEmptyIncrement(r: NormalizedIncrement): boolean {
  return r.total <= 0
    && r.status409 <= 0
    && r.status426 <= 0
    && r.status429 <= 0
    && r.status4xx <= 0
    && r.status5xx <= 0
    && r.le50 <= 0
    && r.le100 <= 0
    && r.le250 <= 0
    && r.le500 <= 0
    && r.le1000 <= 0
    && r.le2500 <= 0
    && r.gt2500 <= 0
    && r.sumMs <= 0
    && r.catchTooSoon <= 0
    && r.letterGap <= 0
    && r.other <= 0;
}

function addNormalized(dst: MutableHttpCounts, src: NormalizedIncrement): void {
  dst.total += src.total;
  dst.status409 += src.status409;
  dst.status426 += src.status426;
  dst.status429 += src.status429;
  dst.status4xx += src.status4xx;
  dst.status5xx += src.status5xx;
  dst.le50 += src.le50;
  dst.le100 += src.le100;
  dst.le250 += src.le250;
  dst.le500 += src.le500;
  dst.le1000 += src.le1000;
  dst.le2500 += src.le2500;
  dst.gt2500 += src.gt2500;
  dst.sumMs += src.sumMs;
  dst.catchTooSoon += src.catchTooSoon;
  dst.letterGap += src.letterGap;
  dst.other += src.other;
}

/**
 * 메모리에 모은 HTTP 지표 증분을 단일 문장으로 합산 upsert한다.
 * 같은 (day, routeGroup) 키가 중복 전달돼도 먼저 합친 뒤 DB에 보낸다.
 */
export async function flushHttpMetrics(db: Executor, increments: readonly HttpMetricIncrement[]): Promise<void> {
  const merged = new Map<string, NormalizedIncrement>();
  for (const raw of increments) {
    const row = normalizeIncrement(raw);
    if (isEmptyIncrement(row)) continue;
    const key = `${row.day}\0${row.routeGroup}`;
    const existing = merged.get(key);
    if (existing) {
      addNormalized(existing, row);
    } else {
      merged.set(key, { ...row });
    }
  }
  if (merged.size === 0) return;

  const payload = [...merged.values()].map(r => ({
    day: r.day,
    route_group: r.routeGroup,
    total: r.total,
    status_409: r.status409,
    status_426: r.status426,
    status_429: r.status429,
    status_4xx: r.status4xx,
    status_5xx: r.status5xx,
    lat_le_50: r.le50,
    lat_le_100: r.le100,
    lat_le_250: r.le250,
    lat_le_500: r.le500,
    lat_le_1000: r.le1000,
    lat_le_2500: r.le2500,
    lat_gt_2500: r.gt2500,
    lat_sum_ms: r.sumMs,
    rl_catch_too_soon: r.catchTooSoon,
    rl_letter_gap: r.letterGap,
    rl_other: r.other,
  }));

  await db.execute(sql`
    insert into public.http_metrics_daily (
      day, route_group, total, status_409, status_426, status_429, status_4xx, status_5xx,
      lat_le_50, lat_le_100, lat_le_250, lat_le_500, lat_le_1000, lat_le_2500, lat_gt_2500, lat_sum_ms,
      rl_catch_too_soon, rl_letter_gap, rl_other, updated_at
    )
    select r.day::date, r.route_group, r.total, r.status_409, r.status_426, r.status_429, r.status_4xx, r.status_5xx,
           r.lat_le_50, r.lat_le_100, r.lat_le_250, r.lat_le_500, r.lat_le_1000, r.lat_le_2500, r.lat_gt_2500, r.lat_sum_ms,
           r.rl_catch_too_soon, r.rl_letter_gap, r.rl_other, now()
    from json_to_recordset(${jsonParam(payload)}) as r(
      day text,
      route_group text,
      total bigint,
      status_409 bigint,
      status_426 bigint,
      status_429 bigint,
      status_4xx bigint,
      status_5xx bigint,
      lat_le_50 bigint,
      lat_le_100 bigint,
      lat_le_250 bigint,
      lat_le_500 bigint,
      lat_le_1000 bigint,
      lat_le_2500 bigint,
      lat_gt_2500 bigint,
      lat_sum_ms bigint,
      rl_catch_too_soon bigint,
      rl_letter_gap bigint,
      rl_other bigint
    )
    on conflict (day, route_group) do update set
      total = public.http_metrics_daily.total + excluded.total,
      status_409 = public.http_metrics_daily.status_409 + excluded.status_409,
      status_426 = public.http_metrics_daily.status_426 + excluded.status_426,
      status_429 = public.http_metrics_daily.status_429 + excluded.status_429,
      status_4xx = public.http_metrics_daily.status_4xx + excluded.status_4xx,
      status_5xx = public.http_metrics_daily.status_5xx + excluded.status_5xx,
      lat_le_50 = public.http_metrics_daily.lat_le_50 + excluded.lat_le_50,
      lat_le_100 = public.http_metrics_daily.lat_le_100 + excluded.lat_le_100,
      lat_le_250 = public.http_metrics_daily.lat_le_250 + excluded.lat_le_250,
      lat_le_500 = public.http_metrics_daily.lat_le_500 + excluded.lat_le_500,
      lat_le_1000 = public.http_metrics_daily.lat_le_1000 + excluded.lat_le_1000,
      lat_le_2500 = public.http_metrics_daily.lat_le_2500 + excluded.lat_le_2500,
      lat_gt_2500 = public.http_metrics_daily.lat_gt_2500 + excluded.lat_gt_2500,
      lat_sum_ms = public.http_metrics_daily.lat_sum_ms + excluded.lat_sum_ms,
      rl_catch_too_soon = public.http_metrics_daily.rl_catch_too_soon + excluded.rl_catch_too_soon,
      rl_letter_gap = public.http_metrics_daily.rl_letter_gap + excluded.rl_letter_gap,
      rl_other = public.http_metrics_daily.rl_other + excluded.rl_other,
      updated_at = now()
  `);
}

type RawDbRow = {
  day: string;
  route_group: HttpMetricRouteGroup;
  total: string | number;
  status_409: string | number;
  status_426: string | number;
  status_429: string | number;
  status_4xx: string | number;
  status_5xx: string | number;
  lat_le_50: string | number;
  lat_le_100: string | number;
  lat_le_250: string | number;
  lat_le_500: string | number;
  lat_le_1000: string | number;
  lat_le_2500: string | number;
  lat_gt_2500: string | number;
  lat_sum_ms: string | number;
  rl_catch_too_soon: string | number;
  rl_letter_gap: string | number;
  rl_other: string | number;
};

/**
 * 최근 days일(KST 오늘 포함, 1~90일)의 앱 서버 HTTP 오류율·429·지연 지표를 읽어 집계한다.
 * 클러스터 앞단(ingress-nginx)이 직접 차단한 429 응답은 앱 서버에 닿지 않으므로 scope는 app_server다.
 */
export async function readHttpMetrics(db: Executor, days: number): Promise<HttpMetricsReport> {
  const period = Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS);
  const { rows: dbRows } = await db.execute<RawDbRow>(sql`
    select to_char(day, 'YYYY-MM-DD') as day,
           route_group,
           total,
           status_409,
           status_426,
           status_429,
           status_4xx,
           status_5xx,
           lat_le_50,
           lat_le_100,
           lat_le_250,
           lat_le_500,
           lat_le_1000,
           lat_le_2500,
           lat_gt_2500,
           lat_sum_ms,
           rl_catch_too_soon,
           rl_letter_gap,
           rl_other
    from public.http_metrics_daily
    where day >= (now() at time zone 'Asia/Seoul')::date - ${period - 1}::int
    order by day desc, route_group asc
  `);

  const rows: HttpMetricsRawRow[] = dbRows.map(r => ({
    day: r.day,
    routeGroup: r.route_group,
    total: Number(r.total),
    status409: Number(r.status_409),
    status426: Number(r.status_426),
    status429: Number(r.status_429),
    status4xx: Number(r.status_4xx),
    status5xx: Number(r.status_5xx),
    latencyBuckets: {
      le50: Number(r.lat_le_50),
      le100: Number(r.lat_le_100),
      le250: Number(r.lat_le_250),
      le500: Number(r.lat_le_500),
      le1000: Number(r.lat_le_1000),
      le2500: Number(r.lat_le_2500),
      gt2500: Number(r.lat_gt_2500),
      sumMs: Number(r.lat_sum_ms),
    },
    rateLimitReasons: {
      catchTooSoon: Number(r.rl_catch_too_soon),
      letterGap: Number(r.rl_letter_gap),
      other: Number(r.rl_other),
    },
  }));

  const summaryCounts = emptyHttpCounts();
  const byDay = new Map<string, MutableHttpCounts>();
  const byRouteMap = new Map<HttpMetricRouteGroup, MutableHttpCounts>();

  const accumulate = (agg: MutableHttpCounts, r: HttpMetricsRawRow) => {
    agg.total += r.total;
    agg.status409 += r.status409;
    agg.status426 += r.status426;
    agg.status429 += r.status429;
    agg.status4xx += r.status4xx;
    agg.status5xx += r.status5xx;
    agg.le50 += r.latencyBuckets.le50;
    agg.le100 += r.latencyBuckets.le100;
    agg.le250 += r.latencyBuckets.le250;
    agg.le500 += r.latencyBuckets.le500;
    agg.le1000 += r.latencyBuckets.le1000;
    agg.le2500 += r.latencyBuckets.le2500;
    agg.gt2500 += r.latencyBuckets.gt2500;
    agg.sumMs += r.latencyBuckets.sumMs;
    agg.catchTooSoon += r.rateLimitReasons.catchTooSoon;
    agg.letterGap += r.rateLimitReasons.letterGap;
    agg.other += r.rateLimitReasons.other;
  };

  for (const r of rows) {
    accumulate(summaryCounts, r);

    let dayAgg = byDay.get(r.day);
    if (!dayAgg) {
      dayAgg = emptyHttpCounts();
      byDay.set(r.day, dayAgg);
    }
    accumulate(dayAgg, r);

    let routeAgg = byRouteMap.get(r.routeGroup);
    if (!routeAgg) {
      routeAgg = emptyHttpCounts();
      byRouteMap.set(r.routeGroup, routeAgg);
    }
    accumulate(routeAgg, r);
  }

  const daily: HttpMetricsDayRow[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, counts]) => ({ day, ...withHttpRates(counts) }));

  const byRoute: HttpMetricsRouteRow[] = [...byRouteMap.entries()]
    .map(([routeGroup, counts]) => ({ routeGroup, ...withHttpRates(counts) }))
    .sort((a, b) => (b.total - a.total) || a.routeGroup.localeCompare(b.routeGroup));

  return {
    days: period,
    scope: 'app_server',
    summary: withHttpRates(summaryCounts),
    daily,
    byRoute,
    rows,
  };
}
