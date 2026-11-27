// 운영 상태 임계 경보 판정·쿨다운 발송기 단위 테스트.
import { describe, expect, it, vi } from 'vitest';
import { createOpsAlertDispatcher, evaluateOpsAlerts } from './opsAlerts.js';

const healthyInput = () => ({
  http: { total: 100, status5xx: 0, p95Ms: 120 },
  pool: { total: 4, idle: 3, waiting: 0, max: 10 },
  ws: { reject500: 0, closeNormal: 18, closeAbnormal: 1, closeIdleTimeout: 1 },
});

describe('evaluateOpsAlerts', () => {
  it('정상 상태에서는 경보를 내지 않고 최소 표본 미만도 억제한다', () => {
    expect(evaluateOpsAlerts(healthyInput())).toEqual([]);
    expect(evaluateOpsAlerts({
      http: { total: 19, status5xx: 10, p95Ms: 3000 },
      pool: { total: 1, idle: 1, waiting: 0, max: 10 },
      ws: { reject500: 0, closeNormal: 0, closeAbnormal: 9, closeIdleTimeout: 0 },
    })).toEqual([]);
  });

  it('HTTP 5xx 비율(warn >= 1%, crit >= 5%)과 p95 지연(warn >= 1000ms, crit >= 2500ms)을 판정한다', () => {
    const warn = evaluateOpsAlerts({
      ...healthyInput(),
      http: { total: 100, status5xx: 1, p95Ms: 1000 },
    });
    expect(warn.map(a => [a.code, a.severity])).toEqual([
      ['http-5xx-rate', 'warn'],
      ['http-p95-high', 'warn'],
    ]);

    const crit = evaluateOpsAlerts({
      ...healthyInput(),
      http: { total: 20, status5xx: 1, p95Ms: 2500 },
    });
    expect(crit.map(a => [a.code, a.severity])).toEqual([
      ['http-5xx-rate', 'crit'],
      ['http-p95-high', 'crit'],
    ]);
  });

  it('DB 풀 압박(waiting >= 2 warn, >= 5 crit, 점유율 >= 80% warn)을 판정한다', () => {
    const utilWarn = evaluateOpsAlerts({
      ...healthyInput(),
      pool: { total: 8, idle: 0, waiting: 0, max: 10 },
    });
    expect(utilWarn.map(a => [a.code, a.severity])).toEqual([['db-pool-pressure', 'warn']]);

    const waitWarn = evaluateOpsAlerts({
      ...healthyInput(),
      pool: { total: 10, idle: 0, waiting: 2, max: 10 },
    });
    expect(waitWarn.map(a => [a.code, a.severity])).toEqual([['db-pool-pressure', 'warn']]);

    const waitCrit = evaluateOpsAlerts({
      ...healthyInput(),
      pool: { total: 10, idle: 0, waiting: 5, max: 10 },
    });
    expect(waitCrit.map(a => [a.code, a.severity])).toEqual([['db-pool-pressure', 'crit']]);
  });

  it('WebSocket 비정상 종료율(>= 20%, 최소 10건)과 업그레이드 500 거부(>= 1)를 판정한다', () => {
    const alerts = evaluateOpsAlerts({
      ...healthyInput(),
      ws: { reject500: 1, closeNormal: 7, closeAbnormal: 2, closeIdleTimeout: 1 },
    });
    expect(alerts.map(a => [a.code, a.severity])).toEqual([
      ['ws-abnormal-close', 'warn'],
      ['ws-upgrade-500', 'crit'],
    ]);
  });
});

describe('createOpsAlertDispatcher', () => {
  it('같은 경보 코드는 쿨다운 동안 중복 발송하지 않고 만료 후 재발송한다', async () => {
    let nowMs = 1_000_000;
    const reportIssue = vi.fn(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }));
    const dispatcher = createOpsAlertDispatcher({
      reportIssue,
      webhookUrl: 'https://hooks.example.test/ops',
      cooldownMs: 900_000,
      now: () => nowMs,
      fetchImpl,
    });

    const alert = evaluateOpsAlerts({
      ...healthyInput(),
      ws: { reject500: 1, closeNormal: 0, closeAbnormal: 0, closeIdleTimeout: 0 },
    });

    const sent1 = await dispatcher.dispatch(alert);
    expect(sent1).toHaveLength(1);
    expect(reportIssue).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://hooks.example.test/ops');

    nowMs += 60_000;
    const sent2 = await dispatcher.dispatch(alert);
    expect(sent2).toHaveLength(0);
    expect(reportIssue).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    nowMs += 900_000;
    const sent3 = await dispatcher.dispatch(alert);
    expect(sent3).toHaveLength(1);
    expect(reportIssue).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('웹훅 실패·타임아웃이나 reportIssue 실패가 나도 절대 예외를 전파하지 않는다', async () => {
    const reportIssue = vi.fn(async () => { throw new Error('sentry-down'); });
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new DOMException('aborted', 'TimeoutError'); });
    const dispatcher = createOpsAlertDispatcher({
      reportIssue,
      webhookUrl: 'https://hooks.example.test/ops',
      fetchImpl,
    });
    const alert = evaluateOpsAlerts({
      ...healthyInput(),
      ws: { reject500: 2, closeNormal: 0, closeAbnormal: 0, closeIdleTimeout: 0 },
    });

    await expect(dispatcher.dispatch(alert)).resolves.toHaveLength(1);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect((fetchImpl.mock.calls[0]?.[1] as { signal?: AbortSignal })?.signal).toBeInstanceOf(AbortSignal);
  });

  it('웹훅 응답이 non-2xx(429/500)여도 예외를 던지지 않고 경보 코드와 상태 코드만 console.warn으로 남긴다', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const reportIssue = vi.fn(async () => {});
      const secretWebhookUrl = 'https://hooks.example.test/services/SECRET_TOKEN_XYZ';
      const fetchImpl = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('rate-limit-secret-body', { status: 429 }))
        .mockResolvedValueOnce(new Response('internal-error-body', { status: 500 }));
      const dispatcher = createOpsAlertDispatcher({
        reportIssue,
        webhookUrl: secretWebhookUrl,
        cooldownMs: 0,
        fetchImpl,
      });

      const alert = evaluateOpsAlerts({
        ...healthyInput(),
        ws: { reject500: 1, closeNormal: 0, closeAbnormal: 0, closeIdleTimeout: 0 },
      });

      await expect(dispatcher.dispatch(alert)).resolves.toHaveLength(1);
      await expect(dispatcher.dispatch(alert)).resolves.toHaveLength(1);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      const call1 = JSON.stringify(warnSpy.mock.calls[0]);
      const call2 = JSON.stringify(warnSpy.mock.calls[1]);
      expect(call1).toContain('ws-upgrade-500');
      expect(call1).toContain('429');
      expect(call2).toContain('ws-upgrade-500');
      expect(call2).toContain('500');
      expect(call1 + call2).not.toContain('hooks.example.test');
      expect(call1 + call2).not.toContain('SECRET_TOKEN_XYZ');
      expect(call1 + call2).not.toContain('rate-limit-secret-body');
      expect(call1 + call2).not.toContain('internal-error-body');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('acquireLock이 false를 반환하면 중복 경보 발송을 건너뛴다', async () => {
    const reportIssue = vi.fn(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }));
    const acquireLock = vi.fn(async () => true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const dispatcher = createOpsAlertDispatcher({
      reportIssue,
      webhookUrl: 'https://hooks.example.test/ops',
      cooldownMs: 0,
      fetchImpl,
      acquireLock,
    });

    const alert = evaluateOpsAlerts({
      ...healthyInput(),
      ws: { reject500: 1, closeNormal: 0, closeAbnormal: 0, closeIdleTimeout: 0 },
    });

    const sent1 = await dispatcher.dispatch(alert);
    expect(sent1).toHaveLength(1);
    expect(acquireLock).toHaveBeenCalledTimes(1);
    expect(acquireLock).toHaveBeenCalledWith('ops-alert:ws-upgrade-500', 1);
    expect(reportIssue).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const sent2 = await dispatcher.dispatch(alert);
    expect(sent2).toHaveLength(0);
    expect(acquireLock).toHaveBeenCalledTimes(2);
    expect(reportIssue).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('acquireLock이 예외를 던져도 Fail-open으로 경보를 발송하고 예외를 전파하지 않는다', async () => {
    const reportIssue = vi.fn(async () => {});
    const acquireLock = vi.fn(async () => { throw new Error('redis-down'); });

    const dispatcher = createOpsAlertDispatcher({
      reportIssue,
      cooldownMs: 900_000,
      acquireLock,
    });

    const alert = evaluateOpsAlerts({
      ...healthyInput(),
      ws: { reject500: 1, closeNormal: 0, closeAbnormal: 0, closeIdleTimeout: 0 },
    });

    await expect(dispatcher.dispatch(alert)).resolves.toHaveLength(1);
    expect(reportIssue).toHaveBeenCalledTimes(1);
  });
});
