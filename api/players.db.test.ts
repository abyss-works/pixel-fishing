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

describe('닉네임 앞부분 검색', () => {
  const ME = testUid(11);
  const FRIEND = testUid(12);
  const BLOCKER = testUid(13);
  const OTHERS = [testUid(14), testUid(15)];

  beforeAll(async () => {
    await seedUser(env.client, { uid: ME, email: 'me@example.com', nickname: '갈매기', state: {} });
    await seedUser(env.client, { uid: FRIEND, email: 'f@example.com', nickname: '갈대', state: {} });
    await seedUser(env.client, { uid: BLOCKER, email: 'b@example.com', nickname: '갈색곰', state: {} });
    await seedUser(env.client, { uid: OTHERS[0], email: 'o1@example.com', nickname: 'Gal_a', state: {} });
    await seedUser(env.client, { uid: OTHERS[1], email: 'o2@example.com', nickname: 'gal%b', state: {} });
    await seedUser(env.client, { uid: testUid(16), nickname: '갈게스트', state: {} });
    await env.client.query('insert into public.friends (requester_id, addressee_id) values ($1, $2)', [ME, FRIEND]);
    await env.client.query('insert into public.blocks (user_id, blocked_id) values ($1, $2)', [BLOCKER, ME]);
  });

  async function search(nickname: unknown, token: string | null) {
    const { default: handler } = await import('./players.js');
    const out: { status: number; body: unknown } = { status: 0, body: undefined };
    const res = {
      status(code: number) { out.status = code; return res; },
      json(b: unknown) { out.body = b; },
      setHeader() {},
    };
    await handler({ method: 'GET', params: {}, query: { nickname }, headers: sessionHeaders(token) } as never, res as never);
    return out;
  }

  it('앞부분이 같은 계정 유저를 이름 순으로 주고, 나·게스트·친구 관계·차단 사이는 뺀다', async () => {
    expect(await search('갈', userToken(ME))).toEqual({ status: 200, body: { players: [{ uid: TARGET, nickname: '갈치' }] } });
  });

  it('대소문자를 무시하고, %와 _는 글자 그대로 찾는다', async () => {
    expect(await search('gal_', userToken(ME))).toEqual({ status: 200, body: { players: [{ uid: OTHERS[0], nickname: 'Gal_a' }] } });
    expect(await search('GAL%', userToken(ME))).toEqual({ status: 200, body: { players: [{ uid: OTHERS[1], nickname: 'gal%b' }] } });
  });

  it('빈 검색어와 너무 긴 검색어는 400, 게스트는 403, 세션이 없으면 401이다', async () => {
    expect(await search('  ', userToken(ME))).toMatchObject({ status: 400, body: { error: 'bad-nickname' } });
    expect(await search('x'.repeat(33), userToken(ME))).toMatchObject({ status: 400 });
    expect(await search('갈', userToken(GUEST))).toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await search('갈', null)).toMatchObject({ status: 401 });
  });
});
