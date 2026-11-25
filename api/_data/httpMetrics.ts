// 앱 서버 HTTP 응답 일별 지표(http_metrics_daily) 쓰기·읽기 소유 모듈.
// Express 미들웨어가 메모리에 모은 KST 일별·경로 묶음별 증분을 합산 upsert하고,
// 관리자 조회(readHttpMetrics)로 요약·일별 추이·경로별 합계·원본 행을 돌려준다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { jsonParam } from './json.js';

export const HTTP_METRIC_ROUTE_GROUPS = ['action', 'auth', 'admin', 'api', 'web'] as const;
export type HttpMetricRouteGroup = (typeof HTTP_METRIC_ROUTE_GROUPS)[number];

export interface HttpMetricIncrement {
  day: string;
  routeGroup: HttpMetricRouteGroup;
  total: number;
  status426: number;
  status429: number;
  status5xx: number;
}

export interface HttpMetricsCounts {
  total: number;
  status426: number;
  status429: number;
  status5xx: number;
  rate426: number;
  rate429: number;
  rate5xx: number;
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
  status426: number;
  status429: number;
  status5xx: number;
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

interface MutableCounts {
  total: number;
  status426: number;
  status429: number;
  status5xx: number;
}

const emptyCounts = (): MutableCounts => ({ total: 0, status426: 0, status429: 0, status5xx: 0 });

const rateOf = (count: number, total: number): number =>
  total > 0 ? Math.round((count / total) * 1_000_000) / 1_000_000 : 0;

function withRates(c: MutableCounts): HttpMetricsCounts {
  return {
    total: c.total,
    status426: c.status426,
    status429: c.status429,
    status5xx: c.status5xx,
    rate426: rateOf(c.status426, c.total),
    rate429: rateOf(c.status429, c.total),
    rate5xx: rateOf(c.status5xx, c.total),
  };
}

/**
 * 메모리에 모은 HTTP 지표 증분을 단일 문장으로 합산 upsert한다.
 * 같은 (day, routeGroup) 키가 중복 전달돼도 먼저 합친 뒤 DB에 보낸다.
 */
export async function flushHttpMetrics(db: Executor, increments: readonly HttpMetricIncrement[]): Promise<void> {
  const merged = new Map<string, HttpMetricIncrement>();
  for (const row of increments) {
    if (row.total <= 0 && row.status426 <= 0 && row.status429 <= 0 && row.status5xx <= 0) continue;
    const key = `${row.day}\0${row.routeGroup}`;
    const existing = merged.get(key);
    if (existing) {
      existing.total += row.total;
      existing.status426 += row.status426;
      existing.status429 += row.status429;
      existing.status5xx += row.status5xx;
    } else {
      merged.set(key, { ...row });
    }
  }
  if (merged.size === 0) return;

  const payload = [...merged.values()].map(r => ({
    day: r.day,
    route_group: r.routeGroup,
    total: r.total,
    status_426: r.status426,
    status_429: r.status429,
    status_5xx: r.status5xx,
  }));

  await db.execute(sql`
    insert into public.http_metrics_daily (day, route_group, total, status_426, status_429, status_5xx, updated_at)
    select r.day::date, r.route_group, r.total, r.status_426, r.status_429, r.status_5xx, now()
    from json_to_recordset(${jsonParam(payload)}) as r(
      day text,
      route_group text,
      total bigint,
      status_426 bigint,
      status_429 bigint,
      status_5xx bigint
    )
    on conflict (day, route_group) do update set
      total = public.http_metrics_daily.total + excluded.total,
      status_426 = public.http_metrics_daily.status_426 + excluded.status_426,
      status_429 = public.http_metrics_daily.status_429 + excluded.status_429,
      status_5xx = public.http_metrics_daily.status_5xx + excluded.status_5xx,
      updated_at = now()
  `);
}

type RawDbRow = {
  day: string;
  route_group: HttpMetricRouteGroup;
  total: string | number;
  status_426: string | number;
  status_429: string | number;
  status_5xx: string | number;
};

/**
 * 최근 days일(KST 오늘 포함, 1~90일)의 앱 서버 HTTP 오류율·429 지표를 읽어 집계한다.
 * 클러스터 앞단(ingress-nginx)이 직접 차단한 429 응답은 앱 서버에 닿지 않으므로 scope는 app_server다.
 */
export async function readHttpMetrics(db: Executor, days: number): Promise<HttpMetricsReport> {
  const period = Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS);
  const { rows: dbRows } = await db.execute<RawDbRow>(sql`
    select to_char(day, 'YYYY-MM-DD') as day,
           route_group,
           total,
           status_426,
           status_429,
           status_5xx
    from public.http_metrics_daily
    where day >= (now() at time zone 'Asia/Seoul')::date - ${period - 1}::int
    order by day desc, route_group asc
  `);

  const rows: HttpMetricsRawRow[] = dbRows.map(r => ({
    day: r.day,
    routeGroup: r.route_group,
    total: Number(r.total),
    status426: Number(r.status_426),
    status429: Number(r.status_429),
    status5xx: Number(r.status_5xx),
  }));

  const summaryCounts = emptyCounts();
  const byDay = new Map<string, MutableCounts>();
  const byRouteMap = new Map<HttpMetricRouteGroup, MutableCounts>();

  for (const r of rows) {
    summaryCounts.total += r.total;
    summaryCounts.status426 += r.status426;
    summaryCounts.status429 += r.status429;
    summaryCounts.status5xx += r.status5xx;

    let dayAgg = byDay.get(r.day);
    if (!dayAgg) {
      dayAgg = emptyCounts();
      byDay.set(r.day, dayAgg);
    }
    dayAgg.total += r.total;
    dayAgg.status426 += r.status426;
    dayAgg.status429 += r.status429;
    dayAgg.status5xx += r.status5xx;

    let routeAgg = byRouteMap.get(r.routeGroup);
    if (!routeAgg) {
      routeAgg = emptyCounts();
      byRouteMap.set(r.routeGroup, routeAgg);
    }
    routeAgg.total += r.total;
    routeAgg.status426 += r.status426;
    routeAgg.status429 += r.status429;
    routeAgg.status5xx += r.status5xx;
  }

  const daily: HttpMetricsDayRow[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, counts]) => ({ day, ...withRates(counts) }));

  const byRoute: HttpMetricsRouteRow[] = [...byRouteMap.entries()]
    .map(([routeGroup, counts]) => ({ routeGroup, ...withRates(counts) }))
    .sort((a, b) => (b.total - a.total) || a.routeGroup.localeCompare(b.routeGroup));

  return {
    days: period,
    scope: 'app_server',
    summary: withRates(summaryCounts),
    daily,
    byRoute,
    rows,
  };
}
