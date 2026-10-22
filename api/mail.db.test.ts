// 우편함 함수 — 실제 Postgres에서 본인 목록과 읽음 기록을 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

let env: ActionEnv;
const ME = testUid(951);
const OTHER = testUid(952);

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: ME, state: {} });
  await seedUser(env.client, { uid: OTHER, state: {} });
});
afterAll(async () => {
  await env?.stop();
});

async function callMail(method: string, token: string | null, body?: unknown) {
  const { default: handler } = await import('./mail.js');
  const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, body, headers: token ? { authorization: `Bearer ${token}` } : {} } as never, res as never);
  return out;
}

describe('우편함 함수', () => {
  it('토큰이 없으면 401, GET·POST 외 메서드는 405다', async () => {
    expect(await callMail('GET', null)).toMatchObject({ status: 401 });
    expect(await callMail('DELETE', userToken(ME))).toMatchObject({ status: 405 });
  });

  it('본인 우편만 최근 순으로 돌려주고 캐시하지 않는다', async () => {
    await env.client.query(`insert into public.mails (user_id, title, body, gold, created_at) values
      ($1, '먼저', 'b', 0, '2026-10-01T00:00:00Z'), ($1, '나중', 'b', 300, '2026-10-02T00:00:00Z'), ($2, '남의', 'b', 0, now())`, [ME, OTHER]);
    const res = await callMail('GET', userToken(ME));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect((res.body as { mails: { title: string }[] }).mails.map(m => m.title)).toEqual(['나중', '먼저']);
  });

  it('읽음은 본인 우편에만 처음 한 번 남고, id가 틀리면 400이다', async () => {
    const { rows } = await env.client.query<{ id: string }>(
      `select id from public.mails where user_id = $1 and title = '먼저'`, [ME]);
    const id = Number(rows[0].id);
    expect(await callMail('POST', userToken(OTHER), { id })).toMatchObject({ status: 200 });
    let read = await env.client.query<{ read_at: Date | null }>('select read_at from public.mails where id = $1', [id]);
    expect(read.rows[0].read_at).toBeNull();
    expect(await callMail('POST', userToken(ME), { id })).toMatchObject({ status: 200, body: { ok: true } });
    read = await env.client.query<{ read_at: Date | null }>('select read_at from public.mails where id = $1', [id]);
    expect(read.rows[0].read_at).not.toBeNull();
    expect(await callMail('POST', userToken(ME), { id: 'x' })).toMatchObject({ status: 400, body: { error: 'bad-id' } });
  });
});
