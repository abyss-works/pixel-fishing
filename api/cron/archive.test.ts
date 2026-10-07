// cron 핸들러 규약 — 인증(CRON_SECRET bearer)·메서드 가드·성공 경로.
// runArchive는 모킹한다(네트워크부는 스테이징 통합 QA — 스펙 5절).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../cold-archive.js', () => ({
  runArchive: vi.fn(async () => ({
    events: { rows: 0, r2Key: null }, saves: { rows: 0, r2Key: null }, cutoff: 'x',
  })),
}));
import handler from './archive.js';
import { runArchive } from '../cold-archive.js';

function mkRes() {
  const r = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) { r.statusCode = code; return r; },
    json(b: unknown) { r.body = b; },
  };
  return r;
}

describe('api/cron/archive 핸들러', () => {
  beforeEach(() => { vi.stubEnv('CRON_SECRET', 'test-secret'); });
  afterEach(() => { vi.unstubAllEnvs(); vi.mocked(runArchive).mockClear(); });

  it('GET 외 메서드는 405', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(405);
  });

  it('Authorization 없음/불일치는 401 — runArchive 미호출', async () => {
    const res = mkRes();
    await handler({ method: 'GET', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(401);
    const res2 = mkRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } } as never, res2 as never);
    expect(res2.statusCode).toBe(401);
    expect(vi.mocked(runArchive)).not.toHaveBeenCalled();
  });

  it('시크릿 일치 + env 완비면 200 요약 응답', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://s.example');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    vi.stubEnv('R2_ACCOUNT_ID', 'a'); vi.stubEnv('R2_BUCKET', 'b');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'i'); vi.stubEnv('R2_SECRET_ACCESS_KEY', 's');
    const res = mkRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-secret' } } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(runArchive)).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ events: { rows: 0, r2Key: null }, saves: { rows: 0, r2Key: null }, cutoff: 'x' });
  });

  it('env 누락이면 500 (Sentry 보고 경로 — DSN 없으면 무음)', async () => {
    // VITE_SUPABASE_URL 미설정 상태(스텁 안 함)
    const res = mkRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-secret' } } as never, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'archive-failed' });
  });
});
