// cron 핸들러 규약 — 인증(CRON_SECRET bearer)·메서드 가드·성공 경로.
// runArchive와 일별 집계 갱신은 모킹한다. DB·R2를 포함한 전체 흐름은 실제 Postgres 특성 테스트가 맡는다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../cold-archive.js', () => ({
  runArchive: vi.fn(async () => ({
    events: { rows: 0, r2Key: null }, saves: { rows: 0, r2Key: null }, cutoff: 'x',
  })),
}));
vi.mock('../_data/activity.js', () => ({ refreshDailyStats: vi.fn(async () => []) }));
import handler from './archive.js';
import { runArchive } from '../cold-archive.js';
import { refreshDailyStats } from '../_data/activity.js';
import { inStage } from '../cronFailure.js';

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
  afterEach(() => { vi.unstubAllEnvs(); vi.mocked(runArchive).mockClear(); vi.mocked(refreshDailyStats).mockClear(); });

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
    expect(vi.mocked(refreshDailyStats)).not.toHaveBeenCalled();
  });

  it('시크릿 일치 + env 완비면 200 요약 응답', async () => {
    // 접속 문자열만 있으면 된다 — runArchive가 모킹이라 실제 연결은 일어나지 않는다
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@127.0.0.1:1/none');
    vi.stubEnv('R2_ACCOUNT_ID', 'a'); vi.stubEnv('R2_BUCKET', 'b');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'i'); vi.stubEnv('R2_SECRET_ACCESS_KEY', 's');
    const res = mkRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-secret' } } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(runArchive)).toHaveBeenCalledTimes(1);
    // 일별 집계는 아카이브가 events를 옮기기 전에 갱신한다
    expect(vi.mocked(refreshDailyStats).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runArchive).mock.invocationCallOrder[0]);
    expect(res.body).toEqual({ events: { rows: 0, r2Key: null }, saves: { rows: 0, r2Key: null }, cutoff: 'x' });
  });

  it('env 누락이면 500 (Sentry 보고 경로 — DSN 없으면 무음)', async () => {
    // DATABASE_URL 미설정 상태(스텁 안 함)
    const res = mkRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-secret' } } as never, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'archive-failed' });
  });
  describe('실패 기록', () => {
    function stubFullEnv() {
      vi.stubEnv('DATABASE_URL', 'postgres://user:pass@127.0.0.1:1/none');
      vi.stubEnv('R2_ACCOUNT_ID', 'a'); vi.stubEnv('R2_BUCKET', 'b');
      vi.stubEnv('R2_ACCESS_KEY_ID', 'i'); vi.stubEnv('R2_SECRET_ACCESS_KEY', 's');
    }
    const authorized = { method: 'GET', headers: { authorization: 'Bearer test-secret' } } as never;
    const logged = (spy: ReturnType<typeof vi.spyOn>) => JSON.parse((spy.mock.calls[0] as [string, string])[1]) as Record<string, unknown>;

    afterEach(() => { vi.restoreAllMocks(); vi.mocked(runArchive).mockReset(); vi.mocked(refreshDailyStats).mockReset(); });

    it('아카이브가 실패하면 안쪽 단계와 원인을 error로 남기고 500을 돌려준다', async () => {
      stubFullEnv();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failure = Object.assign(new Error('r2 PUT denied'), { code: 'EPIPE' });
      vi.mocked(refreshDailyStats).mockResolvedValue([]);
      vi.mocked(runArchive).mockImplementation(() => inStage('saves-upload', async () => { throw failure; }));
      const res = mkRes();
      await handler(authorized, res as never);
      expect(res.statusCode).toBe(500);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(logged(spy)).toMatchObject({ job: 'archive', stage: 'saves-upload', code: 'EPIPE', message: 'r2 PUT denied' });
    });

    it('일별 집계가 실패하면 daily-stats 단계로 남기고 아카이브를 부르지 않는다', async () => {
      stubFullEnv();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.mocked(refreshDailyStats).mockRejectedValue(new Error('stats failed'));
      const res = mkRes();
      await handler(authorized, res as never);
      expect(res.statusCode).toBe(500);
      expect(logged(spy)).toMatchObject({ stage: 'daily-stats', message: 'stats failed' });
      expect(runArchive).not.toHaveBeenCalled();
    });

    it('설정이 빠졌으면 setup 단계로 남긴다', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const res = mkRes();
      await handler(authorized, res as never);
      expect(res.statusCode).toBe(500);
      expect(logged(spy)).toMatchObject({ stage: 'setup', message: 'missing env: DATABASE_URL' });
    });
  });
});
