import { formatLatencyMs } from './httpMetrics';
import type { AdminClientLatencyStat, AdminClientMetrics } from './types';

export const CLIENT_METRICS_SCOPE_NOTICE =
  '실제 브라우저 세션 비콘 집계이며, 개인정보나 계정 식별자를 수집하지 않아요.';

export interface ClientLatencyView {
  p50Text: string;
  p95Text: string;
  avgText: string;
  samples: number;
}

export interface ClientMetricsDailyRowView {
  day: string;
  reports: number;
  lcpP95Text: string;
  inpP95Text: string;
  ttfbP95Text: string;
  clsText: string;
  actionP95Text: string;
  meP95Text: string;
  longFramePctText: string;
  conflicts409: number;
  wsReconnects: number;
  wsAbnormalCloses: number;
}

export interface ClientMetricsView {
  days: number;
  reports: number;
  lcp: ClientLatencyView;
  inp: ClientLatencyView;
  ttfb: ClientLatencyView;
  clsText: string;
  actionRtt: ClientLatencyView & { timeouts: number; conflicts409: number };
  meRtt: ClientLatencyView & { timeouts: number };
  canvas: {
    frames: number;
    longFrames: number;
    longFramePctText: string;
  };
  ws: {
    reconnects: number;
    abnormalCloses: number;
  };
  daily: ClientMetricsDailyRowView[];
}

const EMPTY_LATENCY: ClientLatencyView = {
  p50Text: '--',
  p95Text: '--',
  avgText: '--',
  samples: 0,
};

function selectLatencyView(stat?: AdminClientLatencyStat | null): ClientLatencyView {
  if (!stat) return { ...EMPTY_LATENCY };
  return {
    p50Text: formatLatencyMs(stat.p50Ms),
    p95Text: formatLatencyMs(stat.p95Ms),
    avgText: formatLatencyMs(stat.avgMs),
    samples: stat.samples,
  };
}

function formatCls(clsAvg: number | null | undefined): string {
  if (clsAvg === null || clsAvg === undefined || !Number.isFinite(clsAvg) || clsAvg < 0) return '--';
  return clsAvg.toFixed(3);
}

function formatLongFramePct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct) || pct < 0) return '--';
  return `${Number(pct.toFixed(1))}%`;
}

/** 클라이언트 체감 성능, RTT, 프레임, 소켓 재연결 지표를 화면 표시용 구조로 변환한다 */
export function selectClientMetricsView(data: AdminClientMetrics | null, days: number): ClientMetricsView {
  if (!data) {
    return {
      days,
      reports: 0,
      lcp: { ...EMPTY_LATENCY },
      inp: { ...EMPTY_LATENCY },
      ttfb: { ...EMPTY_LATENCY },
      clsText: '--',
      actionRtt: { ...EMPTY_LATENCY, timeouts: 0, conflicts409: 0 },
      meRtt: { ...EMPTY_LATENCY, timeouts: 0 },
      canvas: { frames: 0, longFrames: 0, longFramePctText: '--' },
      ws: { reconnects: 0, abnormalCloses: 0 },
      daily: [],
    };
  }

  const { summary, daily } = data;
  return {
    days: data.days,
    reports: summary.reports,
    lcp: selectLatencyView(summary.lcp),
    inp: selectLatencyView(summary.inp),
    ttfb: selectLatencyView(summary.ttfb),
    clsText: formatCls(summary.clsAvg),
    actionRtt: {
      ...selectLatencyView(summary.actionRtt),
      timeouts: summary.actionRtt.timeouts,
      conflicts409: summary.actionRtt.conflicts409,
    },
    meRtt: {
      ...selectLatencyView(summary.meRtt),
      timeouts: summary.meRtt.timeouts,
    },
    canvas: {
      frames: summary.canvasFrames,
      longFrames: summary.canvasLongFrames,
      longFramePctText: formatLongFramePct(summary.longFramePct),
    },
    ws: {
      reconnects: summary.wsReconnects,
      abnormalCloses: summary.wsAbnormalCloses,
    },
    daily: daily.map(row => ({
      day: row.day,
      reports: row.reports,
      lcpP95Text: formatLatencyMs(row.lcp.p95Ms),
      inpP95Text: formatLatencyMs(row.inp.p95Ms),
      ttfbP95Text: formatLatencyMs(row.ttfb.p95Ms),
      clsText: formatCls(row.clsAvg),
      actionP95Text: formatLatencyMs(row.actionRtt.p95Ms),
      meP95Text: formatLatencyMs(row.meRtt.p95Ms),
      longFramePctText: formatLongFramePct(row.longFramePct),
      conflicts409: row.actionRtt.conflicts409,
      wsReconnects: row.wsReconnects,
      wsAbnormalCloses: row.wsAbnormalCloses,
    })),
  };
}
