// 운영 상태 종합(opsHealth) 읽기 모듈 — 런타임 메모리·DB 연결 풀·DB 크기·HTTP/WS 지표·슬로우 요청·경보를 조합한다.
// 모든 반환 필드에는 개인식별정보(Zero-PII)를 포함하지 않는다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { SlowHttpRequest } from '../_server/httpMetrics.js';
import { evaluateOpsAlerts, type OpsAlert } from '../_server/opsAlerts.js';
import { readHttpMetrics, type HttpMetricsCounts } from './httpMetrics.js';
import { readWsMetrics, type WsMetricsCounts, type WsMetricsDayRow } from './wsMetrics.js';

export interface PoolStatsSource {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  options?: { max?: number };
}

export interface OpsHealthOptions {
  days: number;
  onlineCount: number;
  slowRequests: readonly SlowHttpRequest[];
  recentHttp?: HttpMetricsCounts | null;
  recentWs?: WsMetricsCounts | null;
  runtime?: {
    uptimeSec: number;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  } | null;
  pool?: {
    total: number;
    idle: number;
    waiting: number;
    max: number;
  } | null;
}

export interface OpsHealthReport {
  runtime: {
    uptimeSec: number;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  database: {
    poolTotal: number;
    poolIdle: number;
    poolWaiting: number;
    poolMax: number;
    dbSizeBytes: number | null;
    activeConnections: number | null;
  };
  httpSummary: HttpMetricsCounts;
  ws: {
    onlineCount: number;
    summary: WsMetricsCounts;
    daily: WsMetricsDayRow[];
  };
  slowRequests: SlowHttpRequest[];
  alerts: OpsAlert[];
}

const MAX_SLOW_LIST = 20;
const roundMb = (bytes: number): number => Math.round((bytes / 1_048_576) * 10) / 10;

async function readDbSizeBytes(db: Executor): Promise<number | null> {
  try {
    const { rows } = await db.execute<{ size_bytes: string | number }>(
      sql`select pg_database_size(current_database())::bigint as size_bytes`,
    );
    const raw = rows[0]?.size_bytes;
    return raw === undefined || raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

async function readActiveConnections(db: Executor): Promise<number | null> {
  try {
    const { rows } = await db.execute<{ active_connections: string | number }>(
      sql`select count(*)::int as active_connections from pg_stat_activity where datname = current_database() and state = 'active'`,
    );
    const raw = rows[0]?.active_connections;
    return raw === undefined || raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

/** 런타임·DB·HTTP·WebSocket 상태와 임계 경보를 비식별 형태로 조회한다 */
export async function readOpsHealth(
  db: Executor,
  pool: PoolStatsSource | null | undefined,
  opts: OpsHealthOptions,
): Promise<OpsHealthReport> {
  const [httpReport, wsReport, dbSizeBytes, activeConnections] = await Promise.all([
    readHttpMetrics(db, opts.days),
    readWsMetrics(db, opts.days),
    readDbSizeBytes(db),
    readActiveConnections(db),
  ]);

  const mem = process.memoryUsage();
  const runtime = opts.runtime ?? {
    uptimeSec: Math.floor(process.uptime()),
    rssMb: roundMb(mem.rss),
    heapUsedMb: roundMb(mem.heapUsed),
    heapTotalMb: roundMb(mem.heapTotal),
  };
  const poolTotal = opts.pool ? opts.pool.total : (pool?.totalCount ?? 0);
  const poolIdle = opts.pool ? opts.pool.idle : (pool?.idleCount ?? 0);
  const poolWaiting = opts.pool ? opts.pool.waiting : (pool?.waitingCount ?? 0);
  const poolMax = opts.pool ? opts.pool.max : (pool?.options?.max ?? 0);

  const alertHttp = opts.recentHttp ?? httpReport.summary;
  const alertWs = opts.recentWs ?? wsReport.summary;
  const alerts = evaluateOpsAlerts({
    http: {
      total: alertHttp.total,
      status5xx: alertHttp.status5xx,
      p95Ms: alertHttp.latency.p95Ms,
      samples: alertHttp.latency.samples,
    },
    pool: {
      total: poolTotal,
      idle: poolIdle,
      waiting: poolWaiting,
      max: poolMax,
    },
    ws: alertWs,
  });

  return {
    runtime,
    database: {
      poolTotal,
      poolIdle,
      poolWaiting,
      poolMax,
      dbSizeBytes,
      activeConnections,
    },
    httpSummary: httpReport.summary,
    ws: {
      onlineCount: opts.onlineCount,
      summary: wsReport.summary,
      daily: wsReport.daily,
    },
    slowRequests: opts.slowRequests.slice(0, MAX_SLOW_LIST),
    alerts,
  };
}
