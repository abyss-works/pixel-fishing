// 운영 상태 임계 경보 평가와 쿨다운 기반 알림 발송기.
// 모든 판정은 비식별 숫자 지표만 사용하며, 알림 실패가 서버 동작을 막지 않는다.

export type OpsAlertCode =
  | 'http-5xx-rate'
  | 'http-p95-high'
  | 'db-pool-pressure'
  | 'ws-abnormal-close'
  | 'ws-upgrade-500';

export interface OpsAlert {
  code: OpsAlertCode;
  severity: 'warn' | 'crit';
  title: string;
  detail: string;
  observed: number;
  threshold: number;
}

export interface OpsAlertInput {
  http: {
    total: number;
    status5xx: number;
    p95Ms: number | null;
    samples?: number;
  };
  pool: {
    total: number;
    idle: number;
    waiting: number;
    max: number;
  };
  ws: {
    reject500: number;
    closeNormal: number;
    closeAbnormal: number;
    closeIdleTimeout: number;
  };
}

const HTTP_MIN_SAMPLES = 20;
const WS_MIN_CLOSES = 10;
const DEFAULT_COOLDOWN_MS = 900_000;
const WEBHOOK_TIMEOUT_MS = 3000;

const roundRate = (v: number): number => Math.round(v * 1_000_000) / 1_000_000;

/** 최근 HTTP·DB 풀·WebSocket 지표를 임계치와 대조해 활성 경보 목록을 산출한다 */
export function evaluateOpsAlerts(input: OpsAlertInput): OpsAlert[] {
  const alerts: OpsAlert[] = [];

  if (input.http.total >= HTTP_MIN_SAMPLES) {
    const rate = roundRate(input.http.status5xx / input.http.total);
    if (rate >= 0.05) {
      alerts.push({
        code: 'http-5xx-rate',
        severity: 'crit',
        title: 'HTTP 5xx 오류율 위험',
        detail: `최근 HTTP 5xx 오류율 ${(rate * 100).toFixed(2)}% (${input.http.status5xx}/${input.http.total})`,
        observed: rate,
        threshold: 0.05,
      });
    } else if (rate >= 0.01) {
      alerts.push({
        code: 'http-5xx-rate',
        severity: 'warn',
        title: 'HTTP 5xx 오류율 주의',
        detail: `최근 HTTP 5xx 오류율 ${(rate * 100).toFixed(2)}% (${input.http.status5xx}/${input.http.total})`,
        observed: rate,
        threshold: 0.01,
      });
    }
  }

  const latencySamples = input.http.samples ?? input.http.total;
  if (input.http.p95Ms !== null && latencySamples >= HTTP_MIN_SAMPLES) {
    if (input.http.p95Ms >= 2500) {
      alerts.push({
        code: 'http-p95-high',
        severity: 'crit',
        title: 'HTTP p95 지연 위험',
        detail: `최근 HTTP p95 지연 ${input.http.p95Ms}ms (표본 ${latencySamples}건)`,
        observed: input.http.p95Ms,
        threshold: 2500,
      });
    } else if (input.http.p95Ms >= 1000) {
      alerts.push({
        code: 'http-p95-high',
        severity: 'warn',
        title: 'HTTP p95 지연 주의',
        detail: `최근 HTTP p95 지연 ${input.http.p95Ms}ms (표본 ${latencySamples}건)`,
        observed: input.http.p95Ms,
        threshold: 1000,
      });
    }
  }

  const inUse = Math.max(0, input.pool.total - input.pool.idle);
  const util = input.pool.max > 0 ? roundRate(inUse / input.pool.max) : 0;
  if (input.pool.waiting >= 5) {
    alerts.push({
      code: 'db-pool-pressure',
      severity: 'crit',
      title: 'DB 연결 풀 대기 위험',
      detail: `DB 연결 풀 대기 ${input.pool.waiting}건 (사용 ${inUse}/${input.pool.max})`,
      observed: input.pool.waiting,
      threshold: 5,
    });
  } else if (input.pool.waiting >= 2) {
    alerts.push({
      code: 'db-pool-pressure',
      severity: 'warn',
      title: 'DB 연결 풀 대기 주의',
      detail: `DB 연결 풀 대기 ${input.pool.waiting}건 (사용 ${inUse}/${input.pool.max})`,
      observed: input.pool.waiting,
      threshold: 2,
    });
  } else if (input.pool.max > 0 && util >= 0.8) {
    alerts.push({
      code: 'db-pool-pressure',
      severity: 'warn',
      title: 'DB 연결 풀 포화 주의',
      detail: `DB 연결 풀 사용률 ${(util * 100).toFixed(1)}% (${inUse}/${input.pool.max})`,
      observed: util,
      threshold: 0.8,
    });
  }

  const totalCloses = input.ws.closeNormal + input.ws.closeAbnormal + input.ws.closeIdleTimeout;
  if (totalCloses >= WS_MIN_CLOSES) {
    const abnormalRate = roundRate(input.ws.closeAbnormal / totalCloses);
    if (abnormalRate >= 0.2) {
      alerts.push({
        code: 'ws-abnormal-close',
        severity: 'warn',
        title: 'WebSocket 비정상 종료율 주의',
        detail: `WebSocket 비정상 종료율 ${(abnormalRate * 100).toFixed(1)}% (${input.ws.closeAbnormal}/${totalCloses})`,
        observed: abnormalRate,
        threshold: 0.2,
      });
    }
  }

  if (input.ws.reject500 >= 1) {
    alerts.push({
      code: 'ws-upgrade-500',
      severity: 'crit',
      title: 'WebSocket 업그레이드 500 오류',
      detail: `WebSocket 업그레이드 500 거부 ${input.ws.reject500}건`,
      observed: input.ws.reject500,
      threshold: 1,
    });
  }

  return alerts;
}

export interface OpsAlertDispatcherOptions {
  reportIssue: (what: string, detail: unknown, context?: Record<string, unknown>) => Promise<void> | void;
  webhookUrl?: string;
  cooldownMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export interface OpsAlertDispatcher {
  dispatch: (alerts: readonly OpsAlert[]) => Promise<OpsAlert[]>;
}

/** 동일 경보 코드의 쿨다운 중복 발송을 억제하고 이슈 보고 및 선택 웹훅 POST를 안전하게 실행한다 */
export function createOpsAlertDispatcher(options: OpsAlertDispatcherOptions): OpsAlertDispatcher {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = options.now ?? (() => Date.now());
  const fetchImpl = options.fetchImpl ?? fetch;
  const webhookUrl = options.webhookUrl?.trim() ? options.webhookUrl.trim() : null;
  const lastSentAt = new Map<OpsAlertCode, number>();

  async function dispatch(alerts: readonly OpsAlert[]): Promise<OpsAlert[]> {
    const currentNow = now();
    const toSend: OpsAlert[] = [];
    for (const alert of alerts) {
      const prev = lastSentAt.get(alert.code);
      if (prev !== undefined && currentNow - prev < cooldownMs) continue;
      lastSentAt.set(alert.code, currentNow);
      toSend.push(alert);
    }
    if (toSend.length === 0) return [];

    const tasks: Promise<void>[] = [];
    for (const alert of toSend) {
      tasks.push(
        Promise.resolve()
          .then(() => options.reportIssue(`ops-alert:${alert.code}`, alert.detail, {
            code: alert.code,
            severity: alert.severity,
            observed: alert.observed,
            threshold: alert.threshold,
          }))
          .catch(() => {}),
      );
      if (webhookUrl) {
        tasks.push(
          Promise.resolve()
            .then(() => fetchImpl(webhookUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ...alert, at: new Date(currentNow).toISOString() }),
              signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
            }))
            .then(res => {
              if (!res.ok) {
                console.warn('[ops-alerts] webhook non-ok response', { code: alert.code, status: res.status });
              }
            })
            .catch(() => {}),
        );
      }
    }
    await Promise.allSettled(tasks);
    return toSend;
  }

  return { dispatch };
}
