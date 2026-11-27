import { formatLatencyMs, HTTP_ROUTE_GROUP_LABELS } from './httpMetrics';
import { fmtNum } from './metrics';
import type {
  AdminHttpMetricRouteGroup,
  AdminOpsAlert,
  AdminOpsAlertCode,
  AdminOpsHealth,
  AdminWsMetricsCounts,
} from './types';

export const OPS_ALERT_SEVERITY_LABELS: Record<AdminOpsAlert['severity'], string> = {
  crit: '위험',
  warn: '주의',
};

export const OPS_WS_REJECT_LABELS = {
  reject401: '인증 실패 (401)',
  reject403: '권한 거부 (403)',
  reject500: '서버 오류 (500)',
} as const;

export const OPS_WS_CLOSE_LABELS = {
  closeNormal: '정상 종료',
  closeAbnormal: '비정상 종료',
  closeIdleTimeout: '유휴 종료',
} as const;

/** 가동 시간(초)을 일, 시간, 분, 초 문자열로 포맷한다 */
export function formatUptime(uptimeSec: number): string {
  if (!Number.isFinite(uptimeSec) || uptimeSec < 0) return '--';
  const totalSec = Math.floor(uptimeSec);
  if (totalSec < 60) return `${totalSec}초`;
  const totalMin = Math.floor(totalSec / 60);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}일 ${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
}

/** DB 용량(바이트)을 MB 또는 GB 문자열로 포맷한다 */
export function formatDbSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '확인 불가';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2).replace(/\.?0+$/, '')} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1).replace(/\.0$/, '')} MB`;
}

function formatKstDateTimeSec(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(5, 19).replace('T', ' ');
}

function formatRatioPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return '--';
  return `${Number((ratio * 100).toFixed(2))}%`;
}

function formatSafeCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '--';
  return fmtNum(value);
}

function summarizeWsCounts(counts: AdminWsMetricsCounts) {
  const rejectTotal = counts.reject401 + counts.reject403 + counts.reject500;
  const closeTotal = counts.closeNormal + counts.closeAbnormal + counts.closeIdleTimeout;
  const abnormalRate = closeTotal > 0 ? counts.closeAbnormal / closeTotal : 0;
  return {
    upgradesOk: counts.upgradesOk,
    reject401: counts.reject401,
    reject403: counts.reject403,
    reject500: counts.reject500,
    rejectTotal,
    closeNormal: counts.closeNormal,
    closeAbnormal: counts.closeAbnormal,
    closeIdleTimeout: counts.closeIdleTimeout,
    closeTotal,
    abnormalRateText: formatRatioPct(abnormalRate),
  };
}

export interface OpsHealthWsDailyView {
  day: string;
  dayLabel: string;
  upgradesOk: number;
  reject401: number;
  reject403: number;
  reject500: number;
  rejectTotal: number;
  closeNormal: number;
  closeAbnormal: number;
  closeIdleTimeout: number;
  abnormalRateText: string;
}

export interface OpsHealthSlowRequestView {
  atText: string;
  method: string;
  routeGroup: AdminHttpMetricRouteGroup;
  routeLabel: string;
  path: string;
  statusCode: number;
  durationText: string;
  durationMs: number;
}

export interface OpsHealthAlertView {
  code: AdminOpsAlertCode;
  severity: AdminOpsAlert['severity'];
  severityLabel: string;
  title: string;
  detail: string;
  observed: number;
  threshold: number;
}

export interface OpsHealthView {
  runtime: {
    uptimeText: string;
    memoryText: string;
    heapUsedMb: number | null;
    rssMb: number | null;
  };
  database: {
    poolInUse: number | null;
    poolTotal: number | null;
    poolIdle: number | null;
    poolWaiting: number | null;
    poolMax: number | null;
    poolText: string;
    poolCompactText: string;
    dbSizeText: string;
    activeConnectionsText: string;
  };
  ws: {
    onlineCount: number | null;
    onlineCountText: string;
    upgradesOk: number;
    reject401: number;
    reject403: number;
    reject500: number;
    rejectTotal: number;
    closeNormal: number;
    closeAbnormal: number;
    closeIdleTimeout: number;
    closeTotal: number;
    abnormalRateText: string;
    daily: OpsHealthWsDailyView[];
  };
  slowRequests: OpsHealthSlowRequestView[];
  alerts: OpsHealthAlertView[];
}

/** 런타임, 소켓, DB 상태 및 임계 경보를 화면 표시용 구조로 변환한다 */
export function selectOpsHealthView(data: AdminOpsHealth | null): OpsHealthView {
  if (!data) {
    return {
      runtime: {
        uptimeText: '--',
        memoryText: '--',
        heapUsedMb: null,
        rssMb: null,
      },
      database: {
        poolInUse: null,
        poolTotal: null,
        poolIdle: null,
        poolWaiting: null,
        poolMax: null,
        poolText: '--',
        poolCompactText: '--',
        dbSizeText: '--',
        activeConnectionsText: '--',
      },
      ws: {
        onlineCount: null,
        onlineCountText: '--',
        upgradesOk: 0,
        reject401: 0,
        reject403: 0,
        reject500: 0,
        rejectTotal: 0,
        closeNormal: 0,
        closeAbnormal: 0,
        closeIdleTimeout: 0,
        closeTotal: 0,
        abnormalRateText: '--',
        daily: [],
      },
      slowRequests: [],
      alerts: [],
    };
  }

  const { runtime, database, ws, slowRequests, alerts } = data;
  const poolInUse = Math.max(0, database.poolTotal - database.poolIdle);
  const wsSummary = summarizeWsCounts(ws.summary);

  return {
    runtime: {
      uptimeText: formatUptime(runtime.uptimeSec),
      memoryText: Number.isFinite(runtime.heapUsedMb) && Number.isFinite(runtime.rssMb)
        && runtime.heapUsedMb >= 0 && runtime.rssMb >= 0
        ? `${Math.round(runtime.heapUsedMb)} / ${Math.round(runtime.rssMb)} MB`
        : '--',
      heapUsedMb: runtime.heapUsedMb,
      rssMb: runtime.rssMb,
    },
    database: {
      poolInUse,
      poolTotal: database.poolTotal,
      poolIdle: database.poolIdle,
      poolWaiting: database.poolWaiting,
      poolMax: database.poolMax,
      poolText: `${formatSafeCount(poolInUse)}/${formatSafeCount(database.poolTotal)}/${formatSafeCount(database.poolMax)} (대기 ${formatSafeCount(database.poolWaiting)})`,
      poolCompactText: `${formatSafeCount(poolInUse)}/${formatSafeCount(database.poolMax)} (대기 ${formatSafeCount(database.poolWaiting)})`,
      dbSizeText: formatDbSize(database.dbSizeBytes),
      activeConnectionsText: database.activeConnections === null ? '권한 제한' : formatSafeCount(database.activeConnections),
    },
    ws: {
      onlineCount: ws.onlineCount,
      onlineCountText: formatSafeCount(ws.onlineCount),
      ...wsSummary,
      daily: ws.daily.map(row => ({
        day: row.day,
        dayLabel: row.day.slice(5),
        ...summarizeWsCounts(row),
      })),
    },
    slowRequests: slowRequests.map(req => ({
      atText: formatKstDateTimeSec(req.at),
      method: req.method,
      routeGroup: req.routeGroup,
      routeLabel: HTTP_ROUTE_GROUP_LABELS[req.routeGroup] ?? req.routeGroup,
      path: req.path,
      statusCode: req.statusCode,
      durationText: formatLatencyMs(req.durationMs),
      durationMs: req.durationMs,
    })),
    alerts: alerts.map(alert => ({
      code: alert.code,
      severity: alert.severity,
      severityLabel: OPS_ALERT_SEVERITY_LABELS[alert.severity],
      title: alert.title,
      detail: alert.detail,
      observed: alert.observed,
      threshold: alert.threshold,
    })),
  };
}
