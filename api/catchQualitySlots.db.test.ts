// 캐치 품질 집계의 슬롯 효과 열(with_bait) — 이벤트 payload에 미끼 슬롯 또는 도시락 슬롯 요리 id가 실린 캐치를 센다.
// 뷰(v_catch_quality)와 읽기 함수가 같은 값을 준다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSessionHeaders, seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

const ADMIN = testUid(1501);
const PLAYER = testUid(1502);
let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: ADMIN, email: 'quality-admin@example.test', nickname: '운영' });
  await seedUser(env.client, { uid: PLAYER, email: 'quality-player@example.test', nickname: '플레이어' });
  await env.client.query('insert into public.admins (user_id) values ($1)', [ADMIN]);
  // 같은 날의 캐치 6건 — 슬롯 없음 2, 미끼 슬롯 1, 도시락 슬롯 1, 두 슬롯 모두 1, 옛 미끼 키 1(키가 있으면 센다)
  const payloads = [
    { judgment: 'good', size: 10 },
    { judgment: 'perfect', size: 12 },
    { judgment: 'perfect', size: 14, bait: 'cook-bait-rare' },
    { judgment: 'auto', size: 16, lunch: 'cook-lunch-rare' },
    { judgment: 'good', size: 18, bait: 'cook-bait-judge', lunch: 'cook-lunch-bite' },
    { judgment: 'good', size: 20, bait: 'worm' },
  ];
  for (const payload of payloads) {
    await env.client.query(
      `insert into public.events (user_id, type, payload, created_at) values ($1, 'catch', $2, now() - interval '40 days')`,
      [PLAYER, payload]);
  }
});
afterAll(async () => {
  await env?.stop();
});

type Row = Record<string, unknown>;

async function viewRows(): Promise<Row[]> {
  const { client } = env;
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`,
      [JSON.stringify({ sub: ADMIN, role: 'authenticated' }), ADMIN]);
    const { rows } = await client.query(`select coalesce(json_agg(t), '[]'::json) as rows
      from (select * from public.v_catch_quality where day = ((now() - interval '40 days') at time zone 'Asia/Seoul')::date) t`);
    return rows[0].rows as Row[];
  } finally {
    await client.query('rollback');
  }
}

describe('캐치 품질 슬롯 열', () => {
  it('뷰는 미끼 또는 도시락 슬롯 id가 payload에 있는 캐치를 센다', async () => {
    expect(await viewRows()).toEqual([expect.objectContaining({ catches: 6, perfect: 2, with_bait: 4 })]);
  });

  it('읽기 함수도 같은 값을 준다', async () => {
    const { default: handler } = await import('./admin.js');
    const out: { status: number; body: unknown } = { status: 0, body: undefined };
    const res = {
      status(code: number) { out.status = code; return res; },
      json(b: unknown) { out.body = b; },
      setHeader() {},
    };
    await handler({ method: 'GET', query: { q: 'catchQuality', days: '90' }, headers: adminSessionHeaders(userToken(ADMIN)) } as never, res as never);
    expect(out.status).toBe(200);
    const day = (await viewRows())[0].day;
    expect((out.body as Row[]).find(r => r.day === day)).toMatchObject({ catches: 6, perfect: 2, with_bait: 4 });
  });
});
