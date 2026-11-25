// 인증 경로의 요청 수 제한 — 세션 행에 IP를 남기지 않아도 요청에서 읽은 IP로 제한이 걸리는지 실제 Postgres에서 확인한다.
// 요청 수 제한은 운영 모드에서만 켜지므로 인증 모듈을 불러오기 전에 운영 모드로 둔다.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startActionEnv } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { ANONYMOUS_SIGN_IN_RATE_LIMIT } from './auth.js';

// 인증 라이브러리는 불러올 때 운영 모드 여부를 정하므로 import보다 먼저 환경을 바꾼다
const restoreEnv = vi.hoisted(() => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  return () => {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  };
});

const ORIGIN = 'http://localhost:3000';

let env: ActionEnv;
let handle: (req: Request) => Promise<Response>;
let adminHandle: (req: Request) => Promise<Response>;

beforeAll(async () => {
  env = await startActionEnv();
  const mod = await import('./session.js');
  handle = req => mod.appAuth().handler(req);
  adminHandle = req => mod.adminAuth().handler(req);
});
afterAll(async () => {
  await env?.stop();
  restoreEnv();
});

const signInRes = (ip: string): Promise<Response> => handle(new Request(`${ORIGIN}/api/auth/sign-in/anonymous`, {
  method: 'POST',
  headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify({}),
}));

const signIn = async (ip: string): Promise<number> => (await signInRes(ip)).status;

const adminSocialSignInRes = (ip: string): Promise<Response> => adminHandle(new Request(`${ORIGIN}/api/admin/auth/sign-in/social`, {
  method: 'POST',
  headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify({ provider: 'google', callbackURL: '/admin/' }),
}));

const adminSocialSignIn = async (ip: string): Promise<number> => (await adminSocialSignInRes(ip)).status;

describe('인증 요청 수 제한', () => {
  it('세션에 IP를 저장하지 않아도 익명 가입을 IP당 1시간 10회로 제한하고 Retry-After를 응답한다', async () => {
    const batch: number[] = [];
    for (let i = 0; i < ANONYMOUS_SIGN_IN_RATE_LIMIT.max; i++) batch.push(await signIn('198.51.100.1'));
    expect(batch).not.toContain(429);

    const blocked = await signInRes('198.51.100.1');
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(3500);
    expect(retryAfter).toBeLessThanOrEqual(ANONYMOUS_SIGN_IN_RATE_LIMIT.window);
    expect(blocked.headers.get('x-retry-after')).toBe(String(retryAfter));

    expect(await signIn('198.51.100.2')).not.toBe(429);
  });

  it('다중 프록시 x-forwarded-for("클라이언트, 사설 프록시")에서도 클라이언트 IP별로 버킷을 분리하고 앞쪽 위조를 막는다', async () => {
    const clientA = '203.0.113.5, 10.0.0.1';
    const clientB = '203.0.113.6, 10.0.0.1';
    const batch: number[] = [];
    for (let i = 0; i < ANONYMOUS_SIGN_IN_RATE_LIMIT.max; i++) batch.push(await signIn(clientA));
    expect(batch).not.toContain(429);
    expect(await signIn(clientA)).toBe(429);
    expect(await signIn('198.51.100.99, 203.0.113.5, 10.0.0.1')).toBe(429);
    expect(await signIn(clientB)).not.toBe(429);
  });

  it('관리자 /sign-in/social은 완화된 한도(10초 20회)와 Retry-After·프록시별 IP 분리를 적용한다', async () => {
    const adminA = '203.0.113.10, 10.0.0.1';
    const adminB = '203.0.113.11, 10.0.0.1';
    const batch = [];
    for (let i = 0; i < 20; i++) batch.push(await adminSocialSignIn(adminA));
    expect(batch).not.toContain(429);
    const blocked = await adminSocialSignInRes(adminA);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await adminSocialSignIn(adminB)).not.toBe(429);
  });
});
