// 빈 익명 계정 정리 cron을 실제 Postgres에서 검사한다. dry-run 기본값, 삭제 플래그, 상한, 계정 단위 실패를 고정한다.
// 시각은 실제 시계 기준으로 며칠 전인지로 만든다. 오류 보고는 대역으로 받아 호출을 확인한다.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GONE, rowCounts, seedFullAccount, seeded } from '../_dbTest/accountFixtures.js';
import type { AccountSpec } from '../_dbTest/accountFixtures.js';
import { startActionEnv } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';

vi.mock('../observability.js', () => ({ reportServerIssue: vi.fn(async () => undefined) }));
import { reportServerIssue } from '../observability.js';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const IDLE: AccountSpec = { save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(12) };

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
  process.env.CRON_SECRET = 'test-cron-secret';
});
afterEach(() => {
  delete process.env.PURGE_ANON_ENABLED;
  vi.mocked(reportServerIssue).mockClear();
});
afterAll(async () => {
  await env?.stop();
});

async function callCron(authorization: string | null, method = 'GET') {
  const { default: handler } = await import('./purge-anon.js');
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
  };
  await handler({ method, headers: authorization ? { authorization } : {} } as never, res as never);
  return out;
}

const run = () => callCron('Bearer test-cron-secret');

describe('빈 익명 계정 정리 크론', () => {
  it('GET 외 메서드는 405, 비밀값이 다르면 401이다', async () => {
    expect(await callCron(null, 'POST')).toMatchObject({ status: 405 });
    expect(await callCron('Bearer wrong')).toMatchObject({ status: 401 });
  });

  describe('대상 계정 하나와 대상이 아닌 계정 셋', () => {
    let target: string;
    let others: string[];

    beforeAll(async () => {
      target = await seedFullAccount(env.client, { ...IDLE, nickname: '대상' });
      others = [
        await seedFullAccount(env.client, { ...IDLE, save: { gold: 3, updatedAt: ago(10) }, nickname: '골드' }),
        await seedFullAccount(env.client, { ...IDLE, save: { updatedAt: ago(1) }, nickname: '최근' }),
        await seedFullAccount(env.client, { ...IDLE, email: 'mail@example.test', nickname: '메일' }),
      ];
    });

    it('기본값은 dry-run이다. 대상을 세어 보고하고 아무것도 지우지 않는다', async () => {
      const res = await run();

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        dryRun: true, targets: 1, batch: 1, deleted: 0, skipped: 0, failed: 0, sample: [target.slice(0, 8)],
      });
      for (const uid of [target, ...others]) expect(await rowCounts(env.client, uid)).toEqual(seeded(true));
    });

    it('PURGE_ANON_ENABLED가 1이면 대상의 공개 표 행과 인증 계정을 지우고 다른 계정은 그대로 둔다', async () => {
      process.env.PURGE_ANON_ENABLED = '1';

      const res = await run();

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        dryRun: false, targets: 1, batch: 1, deleted: 1, skipped: 0, failed: 0, sample: [target.slice(0, 8)],
      });
      expect(await rowCounts(env.client, target)).toEqual(GONE);
      for (const uid of others) expect(await rowCounts(env.client, uid)).toEqual(seeded(true));
    });

    it('대상이 더 없으면 삭제를 켜도 0개를 지운다', async () => {
      process.env.PURGE_ANON_ENABLED = '1';

      expect(await run()).toMatchObject({ status: 200, body: { dryRun: false, targets: 0, batch: 0, deleted: 0, sample: [] } });
    });
  });

  it('상한 500을 넘는 대상은 한 번에 500개만 지우고 다음 실행이 나머지를 지운다', async () => {
    await env.client.query(`insert into auth.users (id, aud, is_anonymous, created_at)
      select gen_random_uuid(), 'bulk-test', true, now() - interval '30 days' from generate_series(1, 501)`);
    const remaining = async () => (await env.client.query<{ n: number }>(
      `select count(*)::int as n from auth.users where aud = 'bulk-test'`)).rows[0].n;
    expect(await remaining()).toBe(501);

    expect((await run()).body).toMatchObject({ dryRun: true, targets: 501, batch: 500, deleted: 0 });
    expect(await remaining()).toBe(501);

    process.env.PURGE_ANON_ENABLED = '1';
    expect((await run()).body).toMatchObject({ dryRun: false, targets: 501, batch: 500, deleted: 500, failed: 0 });
    expect(await remaining()).toBe(1);

    expect((await run()).body).toMatchObject({ targets: 1, batch: 1, deleted: 1 });
    expect(await remaining()).toBe(0);
  });

  it('삭제 도중 실패한 계정은 그대로 남기고 나머지를 지우며 500과 보고로 알린다', async () => {
    const failing = await seedFullAccount(env.client, { ...IDLE, nickname: '실패' });
    const passing = await seedFullAccount(env.client, { ...IDLE, nickname: '성공' });
    await env.client.query(`create function public.test_block_delete() returns trigger language plpgsql as $$
      begin if old.user_id = '${failing}' then raise exception 'blocked for test'; end if; return old; end $$`);
    await env.client.query(`create trigger test_block_delete before delete on public.saves_current
      for each row execute function public.test_block_delete()`);
    process.env.PURGE_ANON_ENABLED = '1';
    try {
      const res = await run();

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ error: 'anon-purge-failed', dryRun: false, targets: 2, batch: 2, deleted: 1, failed: 1 });
      expect(reportServerIssue).toHaveBeenCalledTimes(1);
      expect(reportServerIssue).toHaveBeenCalledWith('anon-purge', expect.any(Error),
        expect.objectContaining({ deleted: 1, failed: 1, failedId: failing.slice(0, 8) }));
    } finally {
      await env.client.query('drop trigger test_block_delete on public.saves_current');
      await env.client.query('drop function public.test_block_delete()');
    }
    expect(await rowCounts(env.client, failing)).toEqual(seeded(true));
    expect(await rowCounts(env.client, passing)).toEqual(GONE);
  });
});
