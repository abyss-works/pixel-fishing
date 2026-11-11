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

beforeAll(async () => {
  env = await startActionEnv();
  const mod = await import('./session.js');
  handle = req => mod.appAuth().handler(req);
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

describe('인증 요청 수 제한', () => {
  it('세션에 IP를 저장하지 않아도 요청의 IP별로 제한한다', async () => {
    const first = [await signIn('198.51.100.1'), await signIn('198.51.100.1'), await signIn('198.51.100.1')];
    expect(first).not.toContain(429);
    expect(await signIn('198.51.100.1')).toBe(429);
    expect(await signIn('198.51.100.2')).not.toBe(429);
  });
});
