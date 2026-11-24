// 인증 경로의 요청 수 제한 — 세션 행에 IP를 남기지 않아도 요청에서 읽은 IP로 제한이 걸리는지 실제 Postgres에서 확인한다.
// 요청 수 제한은 운영 모드에서만 켜지므로 인증 모듈을 불러오기 전에 운영 모드로 둔다.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startActionEnv } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';

// 인증 라이브러리는 불러올 때 운영 모드 여부를 정하므로 import보다 먼저 환경을 바꾼다
const restoreEnv = vi.hoisted(() => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  return () => { process.env.NODE_ENV = before; };
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

const signIn = async (ip: string): Promise<number> => (await handle(new Request(`${ORIGIN}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify({ email: 'nobody@example.test', password: 'secret1' }),
}))).status;

const adminSocialSignIn = async (ip: string): Promise<number> => (await adminHandle(new Request(`${ORIGIN}/api/admin/auth/sign-in/social`, {
  method: 'POST',
  headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify({ provider: 'google', callbackURL: '/admin/' }),
}))).status;

describe('인증 요청 수 제한', () => {
  it('세션에 IP를 저장하지 않아도 요청의 IP별로 제한한다', async () => {
    const first = [await signIn('198.51.100.1'), await signIn('198.51.100.1'), await signIn('198.51.100.1')];
    expect(first).not.toContain(429);
    expect(await signIn('198.51.100.1')).toBe(429);
    expect(await signIn('198.51.100.2')).not.toBe(429);
  });

  it('다중 프록시 x-forwarded-for("클라이언트, 사설 프록시")에서도 클라이언트 IP별로 버킷을 분리한다', async () => {
    const clientA = '203.0.113.5, 10.0.0.1';
    const clientB = '203.0.113.6, 10.0.0.1';
    const first = [await signIn(clientA), await signIn(clientA), await signIn(clientA)];
    expect(first).not.toContain(429);
    expect(await signIn(clientA)).toBe(429);
    expect(await signIn(clientB)).not.toBe(429);
  });

  it('관리자 /sign-in/social은 완화된 한도(10초 20회)와 프록시별 IP 분리를 적용한다', async () => {
    const adminA = '203.0.113.10, 10.0.0.1';
    const adminB = '203.0.113.11, 10.0.0.1';
    const batch = [];
    for (let i = 0; i < 20; i++) batch.push(await adminSocialSignIn(adminA));
    expect(batch).not.toContain(429);
    expect(await adminSocialSignIn(adminA)).toBe(429);
    expect(await adminSocialSignIn(adminB)).not.toBe(429);
  });
});
