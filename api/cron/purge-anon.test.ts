// 빈 익명 계정 정리 cron 핸들러의 규약을 검사한다. 인증과 메서드 가드, dry-run 기본값, 삭제 플래그,
// 요약 응답, 실패 보고를 다룬다. 저장 모듈은 모킹하고, SQL 동작은 실제 Postgres 테스트가 맡는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_data/account.js', () => ({ selectPurgeTargets: vi.fn(), purgeAccount: vi.fn() }));
vi.mock('../_db/client.js', () => ({ database: vi.fn(() => ({ db: 'DB', withTransaction: 'TX' })) }));
vi.mock('../observability.js', () => ({ reportServerIssue: vi.fn(async () => undefined) }));
import handler from './purge-anon.js';
import { purgeAccount, selectPurgeTargets } from '../_data/account.js';
import { reportServerIssue } from '../observability.js';

const NOW = '2030-03-04T05:06:07.000Z';
const CUTOFF = '2030-02-25T05:06:07.000Z';
const id = (n: number) => `3f2a91bc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (count: number) => Array.from({ length: count }, (_, i) => id(i + 1));

function mkRes() {
  const r = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) { r.statusCode = code; return r; },
    json(b: unknown) { r.body = b; },
  };
  return r;
}

async function call(authorization: string | null = 'Bearer test-secret', method = 'GET') {
  const res = mkRes();
  await handler({ method, headers: authorization ? { authorization } : {} } as never, res as never);
  return res;
}

function targets(total: number, listed = total) {
  vi.mocked(selectPurgeTargets).mockResolvedValue({ total, ids: ids(listed) });
}

describe('api/cron/purge-anon 핸들러', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@127.0.0.1:1/none');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
    vi.mocked(purgeAccount).mockResolvedValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.mocked(selectPurgeTargets).mockReset();
    vi.mocked(purgeAccount).mockReset();
    vi.mocked(reportServerIssue).mockClear();
  });

  it('GET 외 메서드는 405다', async () => {
    expect((await call('Bearer test-secret', 'POST')).statusCode).toBe(405);
  });

  it('Authorization이 없거나 다르면 401이고 저장 모듈을 부르지 않는다', async () => {
    expect((await call(null)).statusCode).toBe(401);
    expect((await call('Bearer wrong')).statusCode).toBe(401);
    expect(selectPurgeTargets).not.toHaveBeenCalled();
    expect(purgeAccount).not.toHaveBeenCalled();
  });

  it('CRON_SECRET이 설정되지 않았으면 어떤 헤더도 401이다', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).statusCode).toBe(401);
    expect(selectPurgeTargets).not.toHaveBeenCalled();
  });

  it('DATABASE_URL이 없으면 500이고 보고한다', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const res = await call();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'anon-purge-failed' });
    expect(reportServerIssue).toHaveBeenCalledWith('anon-purge', expect.any(Error));
  });

  it('삭제 플래그가 없으면 dry-run이다. 선정만 하고 지우지 않으며 요약을 돌려준다', async () => {
    targets(3);
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      dryRun: true, cutoff: CUTOFF, targets: 3, batch: 3, deleted: 0, skipped: 0, failed: 0,
      sample: ['3f2a91bc', '3f2a91bc', '3f2a91bc'],
    });
    expect(selectPurgeTargets).toHaveBeenCalledWith('DB', CUTOFF, 500);
    expect(purgeAccount).not.toHaveBeenCalled();
  });

  it.each(['', '0', 'true', 'yes', ' 1', '1 '])('PURGE_ANON_ENABLED가 %j이면 dry-run이다', async value => {
    vi.stubEnv('PURGE_ANON_ENABLED', value);
    targets(2);
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, deleted: 0 });
    expect(purgeAccount).not.toHaveBeenCalled();
  });

  it('PURGE_ANON_ENABLED가 1이면 선정된 계정을 하나씩 지우고 지운 수를 센다', async () => {
    vi.stubEnv('PURGE_ANON_ENABLED', '1');
    targets(3);
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ dryRun: false, targets: 3, batch: 3, deleted: 3, skipped: 0, failed: 0 });
    expect(vi.mocked(purgeAccount).mock.calls).toEqual(ids(3).map(uid => ['TX', uid, CUTOFF]));
    expect(reportServerIssue).not.toHaveBeenCalled();
  });

  it('재확인에서 대상이 아니게 된 계정은 지운 수에 넣지 않고 skipped로 센다', async () => {
    vi.stubEnv('PURGE_ANON_ENABLED', '1');
    targets(3);
    vi.mocked(purgeAccount).mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ targets: 3, batch: 3, deleted: 2, skipped: 1, failed: 0 });
  });

  it('상한을 넘는 대상은 선정된 batch만 처리하고 전체 수는 targets에 남긴다', async () => {
    vi.stubEnv('PURGE_ANON_ENABLED', '1');
    targets(700, 500);
    const res = await call();
    expect(res.body).toMatchObject({ targets: 700, batch: 500, deleted: 500 });
    expect(purgeAccount).toHaveBeenCalledTimes(500);
  });

  it('대상이 없으면 모두 0이고 sample은 비어 있다', async () => {
    vi.stubEnv('PURGE_ANON_ENABLED', '1');
    targets(0);
    const res = await call();
    expect(res.body).toEqual({ dryRun: false, cutoff: CUTOFF, targets: 0, batch: 0, deleted: 0, skipped: 0, failed: 0, sample: [] });
    expect(purgeAccount).not.toHaveBeenCalled();
  });

  it('sample은 최대 5개이고 id 앞 8자리만 담는다', async () => {
    targets(7);
    const res = await call();
    const { sample } = res.body as { sample: string[] };
    expect(sample).toHaveLength(5);
    expect(sample.every(s => s.length === 8)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(id(1));
  });

  it('일부 계정이 실패해도 나머지를 계속 처리하고, 한 번 보고하며 500으로 응답한다', async () => {
    vi.stubEnv('PURGE_ANON_ENABLED', '1');
    targets(3);
    const failure = new Error('blocked');
    vi.mocked(purgeAccount).mockResolvedValueOnce(true).mockRejectedValueOnce(failure).mockResolvedValueOnce(true);
    const res = await call();
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'anon-purge-failed', dryRun: false, targets: 3, deleted: 2, failed: 1 });
    expect(purgeAccount).toHaveBeenCalledTimes(3);
    expect(reportServerIssue).toHaveBeenCalledTimes(1);
    expect(reportServerIssue).toHaveBeenCalledWith('anon-purge', failure,
      expect.objectContaining({ deleted: 2, failed: 1, failedId: '3f2a91bc' }));
  });

  it('대상 선정이 실패하면 500이고 보고하며 지우지 않는다', async () => {
    vi.stubEnv('PURGE_ANON_ENABLED', '1');
    const failure = new Error('select failed');
    vi.mocked(selectPurgeTargets).mockRejectedValue(failure);
    const res = await call();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'anon-purge-failed' });
    expect(reportServerIssue).toHaveBeenCalledWith('anon-purge', failure);
    expect(purgeAccount).not.toHaveBeenCalled();
  });
});
