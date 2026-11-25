// 인증 모듈 — 익명 가입, 이메일·비밀번호 경로 비활성화, 게임과 분리된 관리자 구글 세션을 실제 Postgres에서 확인한다.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedCredentialAccount, startActionEnv } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { googleCode } from '../_dbTest/serverShim.js';

const ORIGIN = 'http://localhost:3000';

let env: ActionEnv;
let handle: (req: Request) => Promise<Response>;
let sessionOf: typeof import('./session.js').sessionOf;
let adminSessionUid: typeof import('./session.js').adminSessionUid;
let handleAdmin: (req: Request) => Promise<Response>;

beforeAll(async () => {
  env = await startActionEnv();
  const mod = await import('./session.js');
  sessionOf = mod.sessionOf;
  adminSessionUid = mod.adminSessionUid;
  handle = req => mod.appAuth().handler(req);
  handleAdmin = req => mod.adminAuth().handler(req);
});
afterAll(async () => {
  await env?.stop();
});

/** 인증 경로에 JSON 본문을 보낸다. cookie가 있으면 세션 쿠키로 붙인다 */
async function post(path: string, body: unknown, cookie?: string, admin = false, extraHeaders: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown>; cookie: string }> {
  const res = await (admin ? handleAdmin : handle)(new Request(`${ORIGIN}${admin ? '/api/admin/auth' : '/api/auth'}${path}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extraHeaders },
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

describe('이메일·비밀번호 인증 및 재설정 경로 비활성화', () => {
  it('이메일 가입·로그인·비밀번호 재설정 요청과 재설정을 모두 거부한다', async () => {
    const uid = await seedCredentialAccount(env.client, 'legacy@example.test');
    await env.client.query(
      `insert into auth.verifications (identifier, value, expires_at) values ('reset-password:old-token', $1, now() + interval '1 hour')`,
      [uid],
    );

    const signUp = await post('/sign-up/email', { email: 'new@example.test', password: 'secret1', name: '' });
    expect(signUp.status).toBe(404);
    expect(signUp.cookie).toBe('');
    expect((await env.client.query(`select 1 from auth.users where email = 'new@example.test'`)).rows).toHaveLength(0);

    const signIn = await post('/sign-in/email', { email: 'legacy@example.test', password: 'secret1' });
    expect(signIn.status).toBe(404);
    expect(signIn.cookie).toBe('');

    const requestReset = await post('/request-password-reset', { email: 'legacy@example.test', redirectTo: `${ORIGIN}/` });
    expect(requestReset.status).toBe(404);
    expect((await env.client.query(`select 1 from auth.verifications where value = $1`, [uid])).rows).toHaveLength(1);

    const reset = await post('/reset-password', { newPassword: 'new-password', token: 'old-token' });
    expect(reset.status).toBe(404);
    expect((await env.client.query(`select password from auth.accounts where user_id = $1 and provider_id = 'credential'`, [uid])).rows[0].password).toBe('legacy-hash');
  });
});

describe('관리자 세션', () => {
  const GOOGLE_ORIGIN = `${ORIGIN}/api/admin/auth`;
  let seq = 0;

  /** 구글을 연결한 계정을 인증 표에 만든다. 구글 계정의 식별자가 sub다 */
  async function googleMember(email: string): Promise<{ uid: string; sub: string }> {
    const uid = randomUUID();
    const sub = `admin-sub-${seq++}`;
    await env.client.query('insert into auth.users (id, email, is_anonymous, email_verified) values ($1, $2, false, true)', [uid, email]);
    await env.client.query(`insert into auth.accounts (user_id, account_id, provider_id) values ($1, $2, 'google')`, [uid, sub]);
    return { uid, sub };
  }

  /** 관리자 구글 로그인. 콜백까지 돌아오는 흐름을 한 번에 돌리고 최종 리디렉션과 쿠키를 돌려준다 */
  async function adminGoogle(who: { sub: string; email: string }, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; error: string | null; cookie: string; authUrl: URL }> {
    const code = googleCode(`admin-code-${seq++}`, who);
    const begin = await post('/sign-in/social', { provider: 'google', callbackURL: `${ORIGIN}/admin/`, errorCallbackURL: `${ORIGIN}/admin/?bad=1`, disableRedirect: true, ...extra }, undefined, true);
    const authUrl = new URL(String(begin.body.url));
    const res = await handleAdmin(new Request(`${GOOGLE_ORIGIN}/callback/google?code=${code}&state=${authUrl.searchParams.get('state')}`, {
      redirect: 'manual', headers: { cookie: begin.cookie },
    }));
    const location = new URL(res.headers.get('location') ?? ORIGIN);
    const cookies = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => !c.endsWith('='));
    return { ok: location.pathname === '/admin/' && !location.searchParams.has('error'), error: location.searchParams.get('error'), cookie: cookies.join('; '), authUrl };
  }
  const adminPost = (path: string, body: unknown, cookie?: string) => post(path, body, cookie, true);

  it('구글을 연결한 계정으로 로그인하면 관리자 쿠키 이름의 세션을 받고, 두 세션은 서로의 쿠키를 인정하지 않는다', async () => {
    const { uid, sub } = await googleMember('admin-login@gmail.test');
    const gameLogin = await anonymousSession();
    const login = await adminGoogle({ sub, email: 'admin-login@gmail.test' });
    expect(login.ok).toBe(true);
    expect(login.authUrl.searchParams.get('scope')).toBe('openid email');
    expect(login.authUrl.searchParams.get('prompt')).toBe('select_account');
    expect(login.authUrl.searchParams.get('redirect_uri')).toBe(`${GOOGLE_ORIGIN}/callback/google`);
    expect(login.cookie).toMatch(/pixel-fishing-admin\.session_token=/);
    expect(await adminSessionUid({ cookie: login.cookie })).toBe(uid);
    expect(await sessionOf({ cookie: login.cookie })).toBeNull();
    expect(await adminSessionUid({ cookie: gameLogin.cookie })).toBeNull();
    expect(await adminSessionUid({})).toBeNull();
  });

  it('연결한 적 없는 구글 계정은 로그인하지 못하고 사용자를 만들지 않는다', async () => {
    const login = await adminGoogle({ sub: 'admin-unknown', email: 'admin-unknown@gmail.test' });
    expect(login.ok).toBe(false);
    expect(login.error).toBe('signup_disabled');
    expect(await adminSessionUid({ cookie: login.cookie })).toBeNull();
    expect((await env.client.query(`select 1 from auth.users where email = 'admin-unknown@gmail.test'`)).rows).toHaveLength(0);
  });

  it('본문에 requestSignUp을 실어도 사용자를 만들지 않는다', async () => {
    const login = await adminGoogle({ sub: 'admin-forced', email: 'admin-forced@gmail.test' }, { requestSignUp: true });
    expect(login.ok).toBe(false);
    expect(login.error).toBe('signup_disabled');
    expect((await env.client.query(`select 1 from auth.users where email = 'admin-forced@gmail.test'`)).rows).toHaveLength(0);
  });

  it('범위를 넓히거나 인증 요청 매개변수를 덮어쓰는 본문은 거부한다', async () => {
    for (const extra of [{ scopes: ['profile'] }, { additionalParams: { prompt: 'none' } }]) {
      const res = await adminPost('/sign-in/social', { provider: 'google', callbackURL: `${ORIGIN}/admin/`, disableRedirect: true, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it('관리자 세션으로는 구글 계정을 연결하지 못한다', async () => {
    const { uid, sub } = await googleMember('admin-nolink@gmail.test');
    const login = await adminGoogle({ sub, email: 'admin-nolink@gmail.test' });
    const code = googleCode(`admin-link-${seq++}`, { sub: 'admin-other-google', email: 'admin-other@gmail.test' });
    const begin = await adminPost('/link-social', { provider: 'google', callbackURL: `${ORIGIN}/admin/`, errorCallbackURL: `${ORIGIN}/admin/?bad=1`, disableRedirect: true }, login.cookie);
    const state = begin.body.url ? new URL(String(begin.body.url)).searchParams.get('state') : null;
    if (state) {
      await handleAdmin(new Request(`${GOOGLE_ORIGIN}/callback/google?code=${code}&state=${state}`, { redirect: 'manual', headers: { cookie: [login.cookie, begin.cookie].join('; ') } }));
    }
    expect((await env.client.query(`select account_id from auth.accounts where user_id = $1`, [uid])).rows).toEqual([{ account_id: sub }]);
  });

  it('이메일 주소만 같은 계정으로는 로그인하지 않는다', async () => {
    await seedCredentialAccount(env.client, 'admin-pw@gmail.test');
    const login = await adminGoogle({ sub: 'admin-same-address', email: 'admin-pw@gmail.test' });
    expect(login.ok).toBe(false);
    expect(await adminSessionUid({ cookie: login.cookie })).toBeNull();
  });

  it('이메일·비밀번호 로그인과 가입·재설정 경로는 없다', async () => {
    await seedCredentialAccount(env.client, 'admin-email@example.test');
    const login = await adminPost('/sign-in/email', { email: 'admin-email@example.test', password: 'admin-pass' });
    expect(login.status).toBeGreaterThanOrEqual(400);
    expect(login.cookie).toBe('');
    const signUp = await adminPost('/sign-up/email', { email: 'admin-signup@example.test', password: 'admin-pass', name: '' });
    expect(signUp.status).toBeGreaterThanOrEqual(400);
    expect((await env.client.query('select 1 from auth.users where email = $1', ['admin-signup@example.test'])).rows).toHaveLength(0);
    expect((await adminPost('/request-password-reset', { email: 'admin-email@example.test', redirectTo: `${ORIGIN}/` })).status).toBeGreaterThanOrEqual(400);
    expect((await adminPost('/reset-password', { newPassword: 'new-password', token: 'nope' })).status).toBeGreaterThanOrEqual(400);
  });

  it('구글이 준 토큰을 저장하지 않는다', async () => {
    const { uid, sub } = await googleMember('admin-tokens@gmail.test');
    await adminGoogle({ sub, email: 'admin-tokens@gmail.test' });
    const { rows } = await env.client.query('select access_token, refresh_token, id_token from auth.accounts where user_id = $1', [uid]);
    expect(rows).toEqual([{ access_token: null, refresh_token: null, id_token: null }]);
  });

  it('관리자 로그아웃은 관리자 세션만, 게임 로그아웃은 게임 세션만 끝낸다', async () => {
    const { uid, sub } = await googleMember('admin-logout@gmail.test');
    const game = await anonymousSession();
    const first = await adminGoogle({ sub, email: 'admin-logout@gmail.test' });
    expect((await adminPost('/sign-out', {}, first.cookie)).status).toBe(200);
    expect(await adminSessionUid({ cookie: first.cookie })).toBeNull();
    expect(await sessionOf({ cookie: game.cookie })).toEqual({ id: game.uid, email: null });

    const second = await adminGoogle({ sub, email: 'admin-logout@gmail.test' });
    expect((await post('/sign-out', {}, game.cookie)).status).toBe(200);
    expect(await sessionOf({ cookie: game.cookie })).toBeNull();
    expect(await adminSessionUid({ cookie: second.cookie })).toBe(uid);
  });
});

describe('세션의 접속 정보', () => {
  // 요청이 IP와 브라우저 정보를 실어 와도 세션 행에는 남기지 않는다
  const client = { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (test)' };
  const sessionRows = async (uid: string) => (await env.client.query<{ ip_address: string | null; user_agent: string | null }>(
    'select ip_address, user_agent from auth.sessions where user_id = $1', [uid])).rows;

  it('게스트의 익명 로그인 세션에 IP와 브라우저 정보를 저장하지 않는다', async () => {
    const res = await post('/sign-in/anonymous', {}, undefined, false, client);
    const rows = await sessionRows((res.body.user as { id: string }).id);
    expect(rows).toEqual([{ ip_address: null, user_agent: null }]);
  });

  it('구글 계정 로그인 세션에도 저장하지 않는다', async () => {
    const uid = randomUUID();
    await env.client.query(`insert into auth.users (id, email, is_anonymous, email_verified) values ($1, 'no-ip-google@gmail.test', false, true)`, [uid]);
    await env.client.query(`insert into auth.accounts (user_id, account_id, provider_id) values ($1, 'no-ip-google-sub', 'google')`, [uid]);
    const code = googleCode('no-ip-google-code', { sub: 'no-ip-google-sub', email: 'no-ip-google@gmail.test' });
    const begin = await post('/sign-in/social', { provider: 'google', callbackURL: `${ORIGIN}/`, disableRedirect: true }, undefined, false, client);
    const state = new URL(String(begin.body.url)).searchParams.get('state');
    await handle(new Request(`${ORIGIN}/api/auth/callback/google?code=${code}&state=${state}`, {
      redirect: 'manual', headers: { cookie: begin.cookie, ...client },
    }));
    const rows = await sessionRows(uid);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every(r => r.ip_address === null && r.user_agent === null)).toBe(true);
  });

  it('관리자 로그인 세션에도 저장하지 않는다', async () => {
    const uid = randomUUID();
    await env.client.query(`insert into auth.users (id, email, is_anonymous, email_verified) values ($1, 'no-ip-admin@gmail.test', false, true)`, [uid]);
    await env.client.query(`insert into auth.accounts (user_id, account_id, provider_id) values ($1, 'no-ip-admin-sub', 'google')`, [uid]);
    const code = googleCode('no-ip-admin-code', { sub: 'no-ip-admin-sub', email: 'no-ip-admin@gmail.test' });
    const begin = await post('/sign-in/social', { provider: 'google', callbackURL: `${ORIGIN}/admin/`, disableRedirect: true }, undefined, true, client);
    const state = new URL(String(begin.body.url)).searchParams.get('state');
    await handleAdmin(new Request(`${ORIGIN}/api/admin/auth/callback/google?code=${code}&state=${state}`, {
      redirect: 'manual', headers: { cookie: begin.cookie, ...client },
    }));
    expect((await sessionRows(uid)).length).toBeGreaterThanOrEqual(1);
    expect((await sessionRows(uid)).every(r => r.ip_address === null && r.user_agent === null)).toBe(true);
  });
});
