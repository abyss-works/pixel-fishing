// 친구 함수 — 실제 Postgres에서 계정 전용, 요청·수락·삭제, 차단 사이 거부, 접속 상태 표시를 검사한다.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, startActionEnv, testUid, sessionHeaders, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { providePresence } from './_server/livePresence.js';

let env: ActionEnv;
const A = testUid(961);
const B = testUid(962);
const C = testUid(963);
const GUEST = testUid(964);

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: A, email: 'a@test.dev', nickname: '가람', state: {} });
  await seedUser(env.client, { uid: B, email: 'b@test.dev', nickname: '나루', state: {} });
  await seedUser(env.client, { uid: C, email: 'c@test.dev', nickname: '다온', state: {} });
  await seedUser(env.client, { uid: GUEST, nickname: '손님', state: {} });
});
afterAll(async () => {
  await env?.stop();
});
afterEach(() => providePresence(() => null));

async function call(method: string, token: string | null, body?: unknown) {
  const { default: handler } = await import('./friends.js');
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader() {},
  };
  await handler({ method, body, headers: sessionHeaders(token) } as never, res as never);
  return out;
}

const list = async (token: string) => (await call('GET', token)).body as { friends: { uid: string; state: string; online: boolean; region: string | null }[] };

describe('친구 함수', () => {
  it('세션이 없으면 401, 게스트는 403이다', async () => {
    expect(await call('GET', null)).toMatchObject({ status: 401 });
    expect(await call('GET', userToken(GUEST))).toMatchObject({ status: 403, body: { error: 'account-only' } });
  });

  it('닉네임으로 요청하고 수락하면 친구가 되고, 접속한 친구에게는 접속 여부와 바다가 붙는다', async () => {
    expect(await call('POST', userToken(A), { op: 'request', nickname: '나루' })).toMatchObject({ status: 200, body: { result: 'requested' } });
    expect((await list(userToken(B))).friends).toMatchObject([{ uid: A, state: 'incoming', online: false }]);
    expect(await call('POST', userToken(B), { op: 'accept', uid: A })).toMatchObject({ status: 200 });
    providePresence(uid => (uid === B ? { uid: B, nick: '나루', boat: 1, region: 'deep', x: 0, y: 0, dir: 0, line: false } : null));
    expect((await list(userToken(A))).friends).toEqual([expect.objectContaining({ uid: B, state: 'friend', online: true, region: 'deep' })]);
    expect(await call('POST', userToken(A), { op: 'remove', uid: B })).toMatchObject({ status: 200 });
    expect((await list(userToken(A))).friends).toEqual([]);
  });

  it('없는 닉네임·게스트·차단 사이는 404, 자기 자신은 400이다', async () => {
    expect(await call('POST', userToken(A), { op: 'request', nickname: '없는이름' })).toMatchObject({ status: 404 });
    expect(await call('POST', userToken(A), { op: 'request', nickname: '손님' })).toMatchObject({ status: 404 });
    expect(await call('POST', userToken(A), { op: 'request', nickname: '가람' })).toMatchObject({ status: 400, body: { error: 'self' } });
    await env.client.query('insert into public.blocks (user_id, blocked_id) values ($1, $2)', [C, A]);
    expect(await call('POST', userToken(A), { op: 'request', nickname: '다온' })).toMatchObject({ status: 404 });
  });

  it('형식이 틀린 요청은 400이다', async () => {
    expect(await call('POST', userToken(A), { op: 'request', nickname: '' })).toMatchObject({ status: 400 });
    expect(await call('POST', userToken(A), { op: 'accept', uid: 'x' })).toMatchObject({ status: 400 });
    expect(await call('POST', userToken(A), { op: 'nope', uid: B })).toMatchObject({ status: 400, body: { error: 'bad-op' } });
  });
});
