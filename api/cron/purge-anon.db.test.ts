// 빈 익명 계정 정리 cron을 실제 Postgres에서 검사한다. dry-run 기본값, 삭제 플래그, 상한, 계정 단위 실패를 고정한다.
// 시각은 실제 시계 기준으로 며칠 전인지로 만든다. 오류 보고는 대역으로 받아 호출을 확인한다.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GONE, rowCounts, seedFullAccount, seeded } from '../_dbTest/accountFixtures.js';
import type { AccountSpec } from '../_dbTest/accountFixtures.js';
import { seedUser, startActionEnv } from '../_dbTest/actionHarness.js';
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
    await env.client.query(`insert into auth.users (id, email, is_anonymous, created_at)
      select id, id::text || '@bulk-test.invalid', true, now() - interval '30 days'
      from (select gen_random_uuid() as id from generate_series(1, 501)) g`);
    const remaining = async () => (await env.client.query<{ n: number }>(
      `select count(*)::int as n from auth.users where email like '%@bulk-test.invalid'`)).rows[0].n;
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
  it('1년 동안 접속하지 않은 게스트는 진행이 있어도 지우고, 연결된 계정과 1년 안에 접속한 게스트는 남긴다', async () => {
    const OLD = ago(400);
    const before = (await run()).body as { targets: number; staleTargets: number };
    const stale = await seedFullAccount(env.client, { save: { gold: 900, fame: 5, updatedAt: OLD }, createdAt: OLD, lastSignInAt: OLD, nickname: '오래된진행' });
    const recent = await seedFullAccount(env.client, { save: { gold: 900, updatedAt: OLD }, createdAt: OLD, lastSignInAt: ago(300), nickname: '최근진행' });
    const linked = await seedFullAccount(env.client, { save: { gold: 900, updatedAt: OLD }, createdAt: OLD, lastSignInAt: OLD, email: 'linked-cron@example.test', nickname: '연결' });

    const dry = (await run()).body as { targets: number; staleTargets: number };
    expect(dry).toMatchObject({ dryRun: true, deleted: 0 });
    expect(dry.targets - before.targets).toBe(1);
    expect(dry.staleTargets - before.staleTargets).toBe(1);
    expect(await rowCounts(env.client, stale)).toEqual(seeded(true));

    process.env.PURGE_ANON_ENABLED = '1';
    const live = (await run()).body as { staleTargets: number; deleted: number; failed: number };
    expect(live.staleTargets).toBe(dry.staleTargets);
    expect(live.failed).toBe(0);
    expect(await rowCounts(env.client, stale)).toEqual(GONE);
    expect(await rowCounts(env.client, recent)).toEqual(seeded(true));
    expect(await rowCounts(env.client, linked)).toEqual(seeded(true));

    // 이미 지운 뒤의 재실행은 아무것도 지우지 않는다
    const after = (await run()).body as { staleTargets: number };
    expect(after.staleTargets).toBe(before.staleTargets);
  });
  it('보관 기간이 지난 채팅(30일)과 신고(1년)를 dry-run에서도 지운다', async () => {
    const author = await seedUser(env.client, { email: 'chat@example.test' });
    const { rows } = await env.client.query<{ id: string }>(`insert into public.chat_messages (user_id, nick, text, created_at)
      values ($1, 'a', '오래됨', $2), ($1, 'a', '최근', $3) returning id`, [author, ago(31), ago(1)]);
    await env.client.query(`insert into public.chat_reports (user_id, message_id, target_id, lines, created_at)
      values ($1, $2, $1, '[]', $3), ($1, $4, $1, '[]', $5)`, [author, rows[0].id, ago(370), rows[1].id, ago(300)]);

    expect((await run()).body).toMatchObject({ dryRun: true, chat: { messages: 1, reports: 1 } });
    const left = await env.client.query<{ text: string }>('select text from public.chat_messages where user_id = $1', [author]);
    expect(left.rows).toEqual([{ text: '최근' }]);
  });
});
