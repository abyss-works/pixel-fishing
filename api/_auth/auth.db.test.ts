// 인증 모듈 — 익명 가입, 같은 id로의 승격, 옮겨 온 bcrypt 해시 로그인, 비밀번호 재설정을 실제 Postgres에서 확인한다.
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startActionEnv } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { sentMails } from '../_dbTest/serverShim.js';

const ORIGIN = 'http://localhost:3000';

let env: ActionEnv;
let handle: (req: Request) => Promise<Response>;
let sessionOf: typeof import('./session.js').sessionOf;

beforeAll(async () => {
  env = await startActionEnv();
  const mod = await import('./session.js');
  sessionOf = mod.sessionOf;
  handle = req => mod.appAuth().handler(req);
});
afterAll(async () => {
  await env?.stop();
});
beforeEach(() => {
  sentMails.length = 0;
});

/** 인증 경로에 JSON 본문을 보낸다. cookie가 있으면 세션 쿠키로 붙인다 */
async function post(path: string, body: unknown, cookie?: string): Promise<{ status: number; body: Record<string, unknown>; cookie: string }> {
  const res = await handle(new Request(`${ORIGIN}/api/auth${path}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
  const setCookies = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => !c.endsWith('='));
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown>, cookie: setCookies.join('; ') };
}

async function anonymousSession(): Promise<{ uid: string; cookie: string }> {
  const res = await post('/sign-in/anonymous', {});
  expect(res.status).toBe(200);
  return { uid: (res.body.user as { id: string }).id, cookie: res.cookie };
}

async function userRow(uid: string) {
  const { rows } = await env.client.query<{ email: string; is_anonymous: boolean }>(
    'select email, is_anonymous from auth.users where id = $1', [uid]);
  return rows[0];
}

describe('익명 가입', () => {
  it('자리표시 이메일을 가진 익명 계정과 세션을 만든다', async () => {
    const { uid, cookie } = await anonymousSession();
    expect(await userRow(uid)).toEqual({ email: expect.stringMatching(/@anonymous\.invalid$/), is_anonymous: true });
    expect(await sessionOf({ cookie })).toEqual({ id: uid, email: null });
  });
});

describe('게스트 승격', () => {
  it('같은 사용자 id에 이메일과 비밀번호를 붙이고, 그 비밀번호로 로그인된다', async () => {
    const { uid, cookie } = await anonymousSession();
    const res = await post('/anonymous/upgrade', { email: 'Upgrade@Example.test', password: 'secret1' }, cookie);
    expect(res.status).toBe(200);
    expect(await userRow(uid)).toEqual({ email: 'upgrade@example.test', is_anonymous: false });
    expect(await sessionOf({ cookie: res.cookie || cookie })).toEqual({ id: uid, email: 'upgrade@example.test' });

    const login = await post('/sign-in/email', { email: 'upgrade@example.test', password: 'secret1' });
    expect(login.status).toBe(200);
    expect((login.body.user as { id: string }).id).toBe(uid);
  });

  it('이미 있는 이메일이면 USER_ALREADY_EXISTS이고 게스트로 남는다', async () => {
    const first = await anonymousSession();
    expect((await post('/anonymous/upgrade', { email: 'taken@example.test', password: 'secret1' }, first.cookie)).status).toBe(200);
    const { uid, cookie } = await anonymousSession();
    const res = await post('/anonymous/upgrade', { email: 'taken@example.test', password: 'secret2' }, cookie);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('USER_ALREADY_EXISTS');
    expect((await userRow(uid)).is_anonymous).toBe(true);
  });

  it('비밀번호가 6자보다 짧으면 PASSWORD_TOO_SHORT다', async () => {
    const { cookie } = await anonymousSession();
    const res = await post('/anonymous/upgrade', { email: 'short@example.test', password: '12345' }, cookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_TOO_SHORT');
  });

  it('이미 영구 계정이면 거부한다', async () => {
    const { cookie } = await anonymousSession();
    const up = await post('/anonymous/upgrade', { email: 'twice-up@example.test', password: 'secret1' }, cookie);
    const res = await post('/anonymous/upgrade', { email: 'other@example.test', password: 'secret1' }, up.cookie || cookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_IS_NOT_ANONYMOUS');
  });
});

describe('옮겨 온 계정', () => {
  it('이전 인증 서버의 bcrypt 해시로 로그인된다', async () => {
    const uid = '00000000-0000-4000-8000-0000000000b1';
    await env.client.query(`insert into auth.users (id, email, is_anonymous) values ($1, 'moved@example.test', false)`, [uid]);
    await env.client.query(`insert into auth.accounts (user_id, account_id, provider_id, password) values ($1, $2, 'credential', $3)`,
      [uid, uid, bcrypt.hashSync('moved-pass', 10).replace(/^\$2b\$/, '$2a$')]);
    expect((await post('/sign-in/email', { email: 'moved@example.test', password: 'wrong-pass' })).status).toBe(401);
    const res = await post('/sign-in/email', { email: 'moved@example.test', password: 'moved-pass' });
    expect(res.status).toBe(200);
    expect((res.body.user as { id: string }).id).toBe(uid);
  });
});

describe('비밀번호 재설정', () => {
  it('메일 링크의 토큰으로 비밀번호를 바꾸고 기존 세션을 끊는다', async () => {
    const { uid, cookie } = await anonymousSession();
    await post('/anonymous/upgrade', { email: 'reset@example.test', password: 'old-pass' }, cookie);
    expect((await post('/request-password-reset', { email: 'reset@example.test', redirectTo: `${ORIGIN}/` })).status).toBe(200);
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toEqual(['reset@example.test']);
    const token = /reset-password\/([^?\s]+)/.exec(sentMails[0].text)?.[1];
    expect(token).toBeTruthy();

    expect((await post('/reset-password', { newPassword: 'new-pass', token })).status).toBe(200);
    expect((await post('/sign-in/email', { email: 'reset@example.test', password: 'old-pass' })).status).toBe(401);
    const login = await post('/sign-in/email', { email: 'reset@example.test', password: 'new-pass' });
    expect((login.body.user as { id: string }).id).toBe(uid);
    expect(await sessionOf({ cookie })).toBeNull();
  });

  it('없는 이메일도 같은 응답이고 메일을 보내지 않는다', async () => {
    expect((await post('/request-password-reset', { email: 'nobody@example.test', redirectTo: `${ORIGIN}/` })).status).toBe(200);
    expect(sentMails).toHaveLength(0);
  });
});
