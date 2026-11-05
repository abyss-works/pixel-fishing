// 마지막 위치 — 실제 Postgres에서 저장 덮어쓰기, 본인 읽기, 계정 정리 삭제를 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { database } from './_db/client.js';
import { deleteUserPosition, saveLastPosition } from './_data/position.js';

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});

async function callPosition(token: string | null, method = 'GET') {
  const { default: handler } = await import('./position.js');
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader() {},
  };
  await handler({ method, headers: sessionHeaders(token) } as never, res as never);
  return out;
}

describe('마지막 위치 읽기 함수', () => {
  let me: string;
  let other: string;
  beforeAll(async () => {
    me = await seedUser(env.client, { uid: testUid(301) });
    other = await seedUser(env.client, { uid: testUid(302) });
  });

  it('GET 외 메서드는 405, 세션이 없으면 401이다', async () => {
    expect((await callPosition(userToken(me), 'POST')).status).toBe(405);
    expect((await callPosition(null)).status).toBe(401);
  });

  it('기록이 없으면 null이고, 저장하면 마지막으로 쓴 자리를 본인에게만 돌려준다', async () => {
    expect(await callPosition(userToken(me))).toEqual({ status: 200, body: { position: null } });
    await saveLastPosition(database().db, me, { region: 'world', x: 100.5, y: 200 });
    await saveLastPosition(database().db, me, { region: 'village', x: 30, y: 40.25 });
    await saveLastPosition(database().db, other, { region: 'world', x: 1, y: 2 });
    expect(await callPosition(userToken(me))).toEqual({ status: 200, body: { position: { region: 'village', x: 30, y: 40.25 } } });
  });

  it('계정 정리는 마지막 위치를 지운다', async () => {
    await deleteUserPosition(database().db, other);
    expect(await callPosition(userToken(other))).toEqual({ status: 200, body: { position: null } });
  });
});
