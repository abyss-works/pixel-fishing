import { lastNDays } from './metrics';
import type { AdminHttpMetricRouteGroup, AdminHttpMetrics } from './types';

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

export interface HttpMetricsView {
  days: number;
  summary: {
    total: number | null;
    status426: number | null;
    status429: number | null;
    status5xx: number | null;
    errorTotal: number | null;
    rate426Text: string;
    rate429Text: string;
    rate5xxText: string;
    errorRateText: string;
  };
  byRoute: {
    routeGroup: AdminHttpMetricRouteGroup;
    label: string;
    total: number;
    status426: number;
    status429: number;
    status5xx: number;
    rate426Text: string;
    rate429Text: string;
    rate5xxText: string;
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
        status426: null,
        status429: null,
        status5xx: null,
        errorTotal: null,
        rate426Text: '—',
        rate429Text: '—',
        rate5xxText: '—',
        errorRateText: '—',
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
      status426: summary.status426,
      status429: summary.status429,
      status5xx: summary.status5xx,
      errorTotal,
      rate426Text: formatErrorRate(summary.rate426),
      rate429Text: formatErrorRate(summary.rate429),
      rate5xxText: formatErrorRate(summary.rate5xx),
      errorRateText: formatErrorRate(errorRate),
    },
    byRoute: byRoute.map(r => ({
      routeGroup: r.routeGroup,
      label: HTTP_ROUTE_GROUP_LABELS[r.routeGroup] ?? r.routeGroup,
      total: r.total,
      status426: r.status426,
      status429: r.status429,
      status5xx: r.status5xx,
      rate426Text: formatErrorRate(r.rate426),
      rate429Text: formatErrorRate(r.rate429),
      rate5xxText: formatErrorRate(r.rate5xx),
    })),
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
