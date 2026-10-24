// 계정 함수 — 실제 Postgres에서 본인 탈퇴가 모든 계정 행과 인증 계정을 지우는지 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GONE, rowCounts, seedFullAccount, seeded } from './_dbTest/accountFixtures.js';
import { callAction, startActionEnv, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});

async function callAccount(method: string, token: string | null, body?: unknown) {
  const { default: handler } = await import('./account.js');
  const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, body, headers: token ? { authorization: `Bearer ${token}` } : {} } as never, res as never);
  return out;
}

const ACTIVE = { email: 'me@example.com', save: { gold: 500, fame: 30, updatedAt: '2030-01-01T00:00:00Z' },
  createdAt: '2030-01-01T00:00:00Z', lastSignInAt: '2030-01-01T00:00:00Z' };

describe('계정 함수', () => {
  it('토큰이 없으면 401, POST 외 메서드는 405, 요청 본문이 탈퇴가 아니면 400이다', async () => {
    const me = await seedFullAccount(env.client, { ...ACTIVE, email: 'guard@example.com', nickname: '경계' });
    expect(await callAccount('POST', null, { op: 'delete' })).toMatchObject({ status: 401 });
    expect(await callAccount('GET', userToken(me))).toMatchObject({ status: 405 });
    for (const bad of [undefined, null, {}, { op: 'remove' }, 'delete']) {
      expect(await callAccount('POST', userToken(me), bad)).toMatchObject({ status: 400, body: { error: 'bad-request' } });
    }
    expect(await rowCounts(env.client, me)).toEqual(seeded(true));
  });

  it('탈퇴하면 본인의 공개 표 행과 편지, 인증 계정이 모두 사라지고 다른 계정은 그대로다', async () => {
    const me = await seedFullAccount(env.client, { ...ACTIVE, email: 'leave@example.com', nickname: '탈퇴', letter: true });
    const other = await seedFullAccount(env.client, { ...ACTIVE, email: 'stay@example.com', nickname: '남음', letter: true });
    const res = await callAccount('POST', userToken(me), { op: 'delete' });
    expect(res).toMatchObject({ status: 200, body: { deleted: true } });
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(await rowCounts(env.client, me)).toEqual(GONE);
    expect(await rowCounts(env.client, other)).toEqual(seeded(true, true));
  });

  it('익명 계정도 탈퇴할 수 있다', async () => {
    const me = await seedFullAccount(env.client, { ...ACTIVE, email: undefined, anonymous: true, nickname: '손님' });
    expect(await callAccount('POST', userToken(me), { op: 'delete' })).toMatchObject({ status: 200, body: { deleted: true } });
    expect(await rowCounts(env.client, me)).toEqual(GONE);
  });

  it('관리자 계정은 탈퇴를 거부하고 아무것도 지우지 않는다', async () => {
    const admin = await seedFullAccount(env.client, { ...ACTIVE, email: 'admin@example.com', nickname: '관리', admin: true });
    expect(await callAccount('POST', userToken(admin), { op: 'delete' })).toMatchObject({ status: 403, body: { error: 'admin-account' } });
    expect(await rowCounts(env.client, admin)).toEqual(seeded(true));
  });

  it('탈퇴 뒤 남은 토큰으로 게임 액션을 보내도 거부되고 계정 행이 다시 생기지 않는다', async () => {
    const me = await seedFullAccount(env.client, { ...ACTIVE, email: 'stale@example.com', nickname: '남은탭' });
    expect(await callAccount('POST', userToken(me), { op: 'delete' })).toMatchObject({ status: 200 });
    const res = await callAction(userToken(me), { type: 'boot' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await rowCounts(env.client, me)).toEqual(GONE);
  });

  it('이미 지운 계정의 토큰으로 다시 요청하면 404다', async () => {
    const me = await seedFullAccount(env.client, { ...ACTIVE, email: 'twice@example.com', nickname: '두번' });
    expect(await callAccount('POST', userToken(me), { op: 'delete' })).toMatchObject({ status: 200 });
    expect(await callAccount('POST', userToken(me), { op: 'delete' })).toMatchObject({ status: 404, body: { error: 'account-missing' } });
  });
});
