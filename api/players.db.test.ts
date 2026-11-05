// 공개 프로필 읽기 함수 — 세션이 있으면 게스트도 다른 사용자의 닉네임·배·명성·도감 수를 읽는다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionHeaders, seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

let env: ActionEnv;
const TARGET = testUid(1);
const GUEST = testUid(2);

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: TARGET, email: 'target@example.com', nickname: '갈치', state: {
    fame: 40, boat: 1, dex: { crucian: { normal: { count: 2, maxSize: 30, first: '2026-01-01' } } },
  } });
  await seedUser(env.client, { uid: GUEST, nickname: null });
});
afterAll(async () => {
  await env?.stop();
});

async function callPlayer(uid: unknown, token: string | null, method = 'GET'): Promise<{ status: number; body: unknown }> {
  const { default: handler } = await import('./players.js');
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader() {},
  };
  await handler({ method, params: { uid }, headers: sessionHeaders(token) } as never, res as never);
  return out;
}

describe('공개 프로필 읽기', () => {
  it('세션이 없으면 401이다', async () => {
    expect(await callPlayer(TARGET, null)).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
  });

  it('게스트도 다른 사용자의 공개 프로필을 읽는다', async () => {
    expect(await callPlayer(TARGET, userToken(GUEST))).toEqual({ status: 200,
      body: { nickname: '갈치', boat: 1, rod: 1, fame: 40, dexFish: ['crucian'], artifacts: [], account: true } });
  });

  it('형식이 틀린 uid는 400, 없는 사용자는 404다', async () => {
    expect(await callPlayer('nope', userToken(GUEST))).toMatchObject({ status: 400, body: { error: 'bad-user' } });
    expect(await callPlayer(testUid(99), userToken(GUEST))).toMatchObject({ status: 404, body: { error: 'not-found' } });
  });

  it('GET이 아니면 405다', async () => {
    expect(await callPlayer(TARGET, userToken(GUEST), 'POST')).toMatchObject({ status: 405 });
  });
});
