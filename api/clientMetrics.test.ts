// 클라이언트 체감 지표 수집 엔드포인트(POST /api/client-metrics) 단위 테스트.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionOf: vi.fn(async (): Promise<{ id: string; email: string | null } | null> => ({
    id: '00000000-0000-4000-8000-000000000101',
    email: null,
  })),
  recordBeacon: vi.fn(),
}));

vi.mock('./_auth/session.js', () => ({
  sessionOf: mocks.sessionOf,
}));
vi.mock('./_server/clientMetrics.js', async () => {
  const actual = await vi.importActual<typeof import('./_server/clientMetrics.js')>('./_server/clientMetrics.js');
  return {
    ...actual,
    recordClientMetricBeacon: mocks.recordBeacon,
  };
});

import handler, { resetClientMetricsRateLimiterForTest } from './clientMetrics.js';

function call(method: string, body?: unknown, ip = '10.0.0.1') {
  const out = {
    status: 0,
    body: undefined as unknown,
    ended: false,
    headers: {} as Record<string, string>,
  };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    end() { out.ended = true; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  return handler(
    { method, headers: { 'x-forwarded-for': ip }, body, socket: { remoteAddress: ip } } as never,
    res as never,
  ).then(() => out);
}

describe('POST /api/client-metrics 핸들러', () => {
  const prevDbUrl = process.env.DATABASE_URL;
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://unit-test';
    vi.clearAllMocks();
    resetClientMetricsRateLimiterForTest();
    mocks.sessionOf.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000101',
      email: null,
    });
  });
  afterEach(() => {
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
  });

  it('POST 외 메서드는 405를 돌려준다', async () => {
    expect(await call('GET')).toMatchObject({ status: 405, body: { error: 'method-not-allowed' } });
    expect(await call('PUT')).toMatchObject({ status: 405, body: { error: 'method-not-allowed' } });
    expect(mocks.recordBeacon).not.toHaveBeenCalled();
  });

  it('유효한 세션이 없으면 401로 거부하고 기록하지 않는다', async () => {
    mocks.sessionOf.mockResolvedValueOnce(null);
    const res = await call('POST', { lcpMs: 1200 });
    expect(res).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
    expect(mocks.recordBeacon).not.toHaveBeenCalled();
  });

  it('객체와 JSON 문자열 본문을 검증해 수집기에 기록하고 204를 즉답한다', async () => {
    const resObj = await call('POST', { lcpMs: 1200, canvasFrames: 100 });
    expect(resObj).toMatchObject({ status: 204, ended: true });
    expect(mocks.recordBeacon).toHaveBeenCalledTimes(1);

    const resStr = await call('POST', JSON.stringify({ meRttsMs: [95], email: 'leak@example.test' }), '10.0.0.2');
    expect(resStr).toMatchObject({ status: 204, ended: true });
    expect(mocks.recordBeacon).toHaveBeenCalledTimes(2);
    expect(mocks.recordBeacon).toHaveBeenLastCalledWith(expect.objectContaining({ meRttsMs: [95] }));
    expect(JSON.stringify(mocks.recordBeacon.mock.calls)).not.toContain('leak@example.test');
  });

  it('잘못된 본문, 크기 초과, 샘플 수 초과는 400으로 거부한다', async () => {
    expect(await call('POST', 'not-json')).toMatchObject({ status: 400, body: { error: 'bad-metrics' } });
    expect(await call('POST', 'x'.repeat(20_000))).toMatchObject({ status: 400, body: { error: 'bad-metrics' } });
    expect(await call('POST', { actionRttsMs: Array.from({ length: 33 }, () => 10) })).toMatchObject({
      status: 400, body: { error: 'bad-metrics' },
    });
    expect(await call('POST', { canvasFrames: -1 })).toMatchObject({ status: 400, body: { error: 'bad-metrics' } });
    expect(mocks.recordBeacon).not.toHaveBeenCalled();
  });

  it('IP당 분당 요청 상한을 초과하면 429와 Retry-After로 차단한다', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await call('POST', { canvasFrames: 10 }, '10.0.0.99')).status).toBe(204);
    }
    const limited = await call('POST', { canvasFrames: 10 }, '10.0.0.99');
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'rate-limited' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(mocks.recordBeacon).toHaveBeenCalledTimes(20);
  });
});
