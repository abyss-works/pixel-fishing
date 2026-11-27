import { lastNDays } from './metrics';
import type {
  AdminHttpLatencySummary,
  AdminHttpMetricCounts,
  AdminHttpMetricRouteGroup,
  AdminHttpMetrics,
  AdminHttpRateLimitReasons,
} from './types';

export const HTTP_ROUTE_GROUP_LABELS: Record<AdminHttpMetricRouteGroup, string> = {
  action: '게임 액션',
  auth: '인증',
  admin: '관리자',
  api: '일반 API',
  web: '웹',
};

export const HTTP_SCOPE_NOTICE =
  '앱 서버 통과 요청 기준이에요. 클러스터 앞단(ingress-nginx)에서 직접 차단한 429 응답은 앱 서버에 닿지 않아 포함되지 않아요.';

/** 0~1 오류율을 소수 둘째 자리까지의 퍼센트 문자열로 포맷한다 */
export function formatErrorRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  const pct = Number((rate * 100).toFixed(2));
  return `${pct}%`;
}

/** 지연 시간(ms)을 정수 문자열 또는 빈 표기('--')로 포맷한다 */
export function formatLatencyMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '--';
  return `${Math.round(ms)}ms`;
}

export interface HttpLatencyView {
  p50Text: string;
  p95Text: string;
  p99Text: string;
  avgText: string;
  samples: number;
}

const EMPTY_LATENCY_VIEW: HttpLatencyView = {
  p50Text: '--',
  p95Text: '--',
  p99Text: '--',
  avgText: '--',
  samples: 0,
};

const EMPTY_RATE_LIMIT_REASONS: AdminHttpRateLimitReasons = {
  catchTooSoon: 0,
  letterGap: 0,
  other: 0,
};

function selectLatencyView(latency?: AdminHttpLatencySummary): HttpLatencyView {
  if (!latency) return { ...EMPTY_LATENCY_VIEW };
  return {
    p50Text: formatLatencyMs(latency.p50Ms),
    p95Text: formatLatencyMs(latency.p95Ms),
    p99Text: formatLatencyMs(latency.p99Ms),
    avgText: formatLatencyMs(latency.avgMs),
    samples: latency.samples,
  };
}

function resolveExtendedCounts(counts: AdminHttpMetricCounts) {
  const status409 = counts.status409 ?? 0;
  const status4xx = counts.status4xx ?? 0;
  const rate409 = counts.rate409 ?? (counts.total > 0 ? status409 / counts.total : 0);
  const rate4xx = counts.rate4xx ?? (counts.total > 0 ? status4xx / counts.total : 0);
  return {
    status409,
    status4xx,
    rate409Text: formatErrorRate(rate409),
    rate4xxText: formatErrorRate(rate4xx),
    latency: selectLatencyView(counts.latency),
    rateLimitReasons: counts.rateLimitReasons ? { ...counts.rateLimitReasons } : { ...EMPTY_RATE_LIMIT_REASONS },
  };
}

export interface HttpMetricsView {
  days: number;
  summary: {
    total: number | null;
    status409: number | null;
    status426: number | null;
    status429: number | null;
    status4xx: number | null;
    status5xx: number | null;
    errorTotal: number | null;
    rate409Text: string;
    rate426Text: string;
    rate429Text: string;
    rate4xxText: string;
    rate5xxText: string;
    errorRateText: string;
    latency: HttpLatencyView;
    rateLimitReasons: AdminHttpRateLimitReasons;
  };
  byRoute: {
    routeGroup: AdminHttpMetricRouteGroup;
    label: string;
    total: number;
    status409: number;
    status426: number;
    status429: number;
    status4xx: number;
    status5xx: number;
    rate409Text: string;
    rate426Text: string;
    rate429Text: string;
    rate5xxText: string;
    p95Text: string;
    avgText: string;
  }[];
  series: {
    labels: string[];
    collected: number;
    total: number[];
    status426: number[];
    status429: number[];
    status5xx: number[];
  };
  rows: AdminHttpMetrics['rows'];
}

/** HTTP 오류율·429 응답을 개요·운영 탭 표시용 구조로 변환한다 */
export function selectHttpMetricsView(data: AdminHttpMetrics | null, days: number): HttpMetricsView {
  const axis = lastNDays(days);
  const labels = axis.map(d => d.slice(5));
  if (!data) {
    const empty = axis.map(() => Number.NaN);
    return {
      days,
      summary: {
        total: null,
        status409: null,
        status426: null,
        status429: null,
        status4xx: null,
        status5xx: null,
        errorTotal: null,
        rate409Text: '--',
        rate426Text: '—',
        rate429Text: '—',
        rate4xxText: '--',
        rate5xxText: '—',
        errorRateText: '—',
        latency: { ...EMPTY_LATENCY_VIEW },
        rateLimitReasons: { ...EMPTY_RATE_LIMIT_REASONS },
      },
      byRoute: [],
      series: {
        labels,
        collected: 0,
        total: [...empty],
        status426: [...empty],
        status429: [...empty],
        status5xx: [...empty],
      },
      rows: [],
    };
  }
  const { summary, daily, byRoute, rows } = data;
  const errorTotal = summary.status426 + summary.status429 + summary.status5xx;
  const errorRate = summary.total > 0 ? errorTotal / summary.total : 0;
  const summaryExt = resolveExtendedCounts(summary);
  const byDay = new Map(daily.map(r => [r.day, r]));
  let collected = 0;
  const totalSeries: number[] = [];
  const s426Series: number[] = [];
  const s429Series: number[] = [];
  const s5xxSeries: number[] = [];
  for (const day of axis) {
    const row = byDay.get(day);
    if (!row) {
      totalSeries.push(Number.NaN);
      s426Series.push(Number.NaN);
      s429Series.push(Number.NaN);
      s5xxSeries.push(Number.NaN);
    } else {
      collected++;
      totalSeries.push(row.total);
      s426Series.push(row.status426);
      s429Series.push(row.status429);
      s5xxSeries.push(row.status5xx);
    }
  }

  return {
    days: data.days,
    summary: {
      total: summary.total,
      status409: summaryExt.status409,
      status426: summary.status426,
      status429: summary.status429,
      status4xx: summaryExt.status4xx,
      status5xx: summary.status5xx,
      errorTotal,
      rate409Text: summaryExt.rate409Text,
      rate426Text: formatErrorRate(summary.rate426),
      rate429Text: formatErrorRate(summary.rate429),
      rate4xxText: summaryExt.rate4xxText,
      rate5xxText: formatErrorRate(summary.rate5xx),
      errorRateText: formatErrorRate(errorRate),
      latency: summaryExt.latency,
      rateLimitReasons: summaryExt.rateLimitReasons,
    },
    byRoute: byRoute.map(r => {
      const ext = resolveExtendedCounts(r);
      return {
        routeGroup: r.routeGroup,
        label: HTTP_ROUTE_GROUP_LABELS[r.routeGroup] ?? r.routeGroup,
        total: r.total,
        status409: ext.status409,
        status426: r.status426,
        status429: r.status429,
        status4xx: ext.status4xx,
        status5xx: r.status5xx,
        rate409Text: ext.rate409Text,
        rate426Text: formatErrorRate(r.rate426),
        rate429Text: formatErrorRate(r.rate429),
        rate5xxText: formatErrorRate(r.rate5xx),
        p95Text: ext.latency.p95Text,
        avgText: ext.latency.avgText,
      };
    }),
    series: {
      labels,
      collected,
      total: totalSeries,
      status426: s426Series,
      status429: s429Series,
      status5xx: s5xxSeries,
    },
    rows,
  };
}
