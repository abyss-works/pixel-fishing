// 채팅 함수 — 실제 Postgres에서 신고와 차단·해제, 게스트 거부, 실시간 채널 갱신 호출을 검사한다.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedUser, startActionEnv, testUid, sessionHeaders, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

let env: ActionEnv;
const ME = testUid(961);
const RUDE = testUid(962);
const GUEST = testUid(963);
const blocksChanged = vi.fn();

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: ME, email: 'me@example.test', nickname: '나' });
  await seedUser(env.client, { uid: RUDE, email: 'rude@example.test', nickname: '무례' });
  await seedUser(env.client, { uid: GUEST });
});
afterAll(async () => {
  await env?.stop();
});

async function call(handler: 'blocks' | 'report', method: string, token: string | null, params: Record<string, string> = {}) {
  const { blocksHandler, chatReportHandler } = await import('./chat.js');
  const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  const run = handler === 'blocks' ? blocksHandler(blocksChanged) : chatReportHandler;
  await run({ method, params, headers: sessionHeaders(token) } as never, res as never);
  return out;
}
const blocks = (method: string, token: string | null, uid?: string) => call('blocks', method, token, uid ? { uid } : {});
const report = (token: string | null, id: string) => call('report', 'POST', token, { id });

describe('차단·신고 함수', () => {
  it('세션이 없으면 401, 게스트는 403, 경로에 맞지 않는 메서드는 405다', async () => {
    expect(await blocks('GET', null)).toMatchObject({ status: 401 });
    expect(await blocks('GET', userToken(GUEST))).toMatchObject({ status: 403, body: { error: 'guest' } });
    expect(await blocks('PUT', userToken(GUEST), RUDE)).toMatchObject({ status: 403 });
    expect(await blocks('DELETE', userToken(ME))).toMatchObject({ status: 405 });
    expect(await blocks('GET', userToken(ME), RUDE)).toMatchObject({ status: 405 });
    expect(await call('report', 'GET', userToken(ME), { id: '1' })).toMatchObject({ status: 405 });
  });

  it('차단·해제는 목록을 돌려주고 실시간 채널에 바뀐 id 목록을 알린다', async () => {
    const blocked = await blocks('PUT', userToken(ME), RUDE);
    expect(blocked).toMatchObject({ status: 200, body: { blocks: [{ uid: RUDE, nick: '무례' }] } });
    expect(blocked.headers['cache-control']).toBe('private, no-store');
    expect(blocksChanged).toHaveBeenLastCalledWith(ME, [RUDE]);
    expect(await blocks('GET', userToken(ME))).toMatchObject({ status: 200, body: { blocks: [{ uid: RUDE, nick: '무례' }] } });
    expect(await blocks('DELETE', userToken(ME), RUDE)).toMatchObject({ status: 200, body: { blocks: [] } });
    expect(blocksChanged).toHaveBeenLastCalledWith(ME, []);
  });

  it('차단하면 두 사람 사이의 친구 관계가 끊긴다', async () => {
    await env.client.query('insert into public.friends (requester_id, addressee_id, accepted_at) values ($1, $2, now())', [RUDE, ME]);
    expect(await blocks('PUT', userToken(ME), RUDE)).toMatchObject({ status: 200 });
    const { rows } = await env.client.query('select 1 from public.friends where requester_id = $1 and addressee_id = $2', [RUDE, ME]);
    expect(rows).toEqual([]);
    await blocks('DELETE', userToken(ME), RUDE);
  });

  it('자기 자신·형식이 틀린 id는 400, 없는 계정은 404다', async () => {
    expect(await blocks('PUT', userToken(ME), ME)).toMatchObject({ status: 400, body: { error: 'bad-user' } });
    expect(await blocks('PUT', userToken(ME), 'x')).toMatchObject({ status: 400 });
    expect(await blocks('PUT', userToken(ME), testUid(999))).toMatchObject({ status: 404, body: { error: 'user-missing' } });
  });

  it('신고는 같은 메시지를 다시 해도 한 건이고, 없는 메시지는 404, 틀린 id는 400이다', async () => {
    const { rows } = await env.client.query<{ id: string }>(
      `insert into public.chat_messages (user_id, nick, text) values ($1, '무례', '나쁜 말') returning id`, [RUDE]);
    const id = rows[0].id;
    expect(await report(userToken(ME), id)).toMatchObject({ status: 200, body: { reported: true } });
    expect(await report(userToken(ME), id)).toMatchObject({ status: 200 });
    const count = await env.client.query<{ n: number }>('select count(*)::int as n from public.chat_reports where user_id = $1', [ME]);
    expect(count.rows[0].n).toBe(1);
    expect(await report(userToken(ME), '999999999')).toMatchObject({ status: 404, body: { error: 'chat-missing' } });
    expect(await report(userToken(ME), 'x')).toMatchObject({ status: 400, body: { error: 'bad-id' } });
  });
});
