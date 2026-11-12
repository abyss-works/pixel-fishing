// 구글 연결 — 게스트와 이메일 계정의 연결, 충돌 판별, 로그인 전환, 비밀번호 수단 삭제를 실제 Postgres에서 확인한다.
// 구글 토큰 교환은 서버 대역이 인가 코드별 신원으로 대신한다. 콜백 경로는 운영과 같다.
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPasswordAccount, startActionEnv } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { googleCode, sentMails } from '../_dbTest/serverShim.js';
import type { GoogleIdentity } from '../_dbTest/serverShim.js';

const ORIGIN = 'http://localhost:3000';

let env: ActionEnv;
let handle: (req: Request) => Promise<Response>;
let sessionOf: typeof import('./session.js').sessionOf;
let seq = 0;

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

interface Res { status: number; body: Record<string, unknown>; cookie: string; location: string | null }

async function call(method: string, path: string, body?: unknown, cookie = ''): Promise<Res> {
  const res = await handle(new Request(`${ORIGIN}/api/auth${path}`, {
    method, redirect: 'manual',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const cookies = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => !c.endsWith('='));
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown>, cookie: cookies.join('; '), location: res.headers.get('location') };
}
/** 쿠키 문자열을 합친다. 같은 이름은 뒤의 값이 이긴다 */
const merge = (...jars: string[]): string => {
  const out = new Map<string, string>();
  for (const jar of jars) for (const pair of jar.split('; ')) if (pair) out.set(pair.slice(0, pair.indexOf('=')), pair);
  return [...out.values()].join('; ');
};

async function guest(): Promise<{ uid: string; cookie: string }> {
  const r = await call('POST', '/sign-in/anonymous', {});
  return { uid: (r.body.user as { id: string }).id, cookie: r.cookie };
}

/** 구글 인증 화면을 거쳐 콜백에 돌아오는 흐름. start는 연결(link-social) 또는 로그인(sign-in/social)의 시작 경로다 */
async function viaGoogle(start: '/link-social' | '/sign-in/social', cookie: string, who: GoogleIdentity, extra: Record<string, unknown> = {}) {
  const code = googleCode(`code-${seq++}`, who);
  const begin = await call('POST', start, { provider: 'google', callbackURL: `${ORIGIN}/?ok=1`, errorCallbackURL: `${ORIGIN}/?bad=1`, disableRedirect: true, ...extra }, cookie);
  const authUrl = new URL(String(begin.body.url));
  const back = await call('GET', `/callback/google?code=${code}&state=${authUrl.searchParams.get('state')}`, undefined, merge(cookie, begin.cookie));
  const location = new URL(back.location ?? ORIGIN);
  return { authUrl, status: back.status, ok: location.searchParams.has('ok'), error: location.searchParams.get('error'), cookie: merge(cookie, back.cookie), back };
}
const link = (cookie: string, who: GoogleIdentity) => viaGoogle('/link-social', cookie, who);
const signIn = (cookie: string, who: GoogleIdentity, extra?: Record<string, unknown>) => viaGoogle('/sign-in/social', cookie, who, extra);

const userRow = async (uid: string) => (await env.client.query<{ email: string; email_verified: boolean; is_anonymous: boolean }>(
  'select email, email_verified, is_anonymous from auth.users where id = $1', [uid])).rows[0];
const accountRows = async (uid: string) => (await env.client.query<{ provider_id: string; account_id: string }>(
  'select provider_id, account_id from auth.accounts where user_id = $1 order by provider_id', [uid])).rows;
const aliveSession = async (cookie: string) => !!(await call('GET', '/get-session?disableCookieCache=true', undefined, cookie)).body?.user;
const nextSub = () => `sub-${seq++}`;

describe('이메일 가입과 승격 경로', () => {
  it('이메일 신규 가입은 거부한다', async () => {
    const res = await call('POST', '/sign-up/email', { email: 'signup@example.test', password: 'secret1', name: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED');
    expect((await env.client.query(`select 1 from auth.users where email = 'signup@example.test'`)).rows).toHaveLength(0);
  });

  it('게스트를 이메일 계정으로 승격하는 경로는 없다', async () => {
    const { uid, cookie } = await guest();
    const res = await call('POST', '/anonymous/upgrade', { email: 'up@example.test', password: 'secret1' }, cookie);
    expect(res.status).toBe(404);
    expect((await userRow(uid)).is_anonymous).toBe(true);
  });

  it('기존 이메일 계정은 이메일과 비밀번호로 로그인된다', async () => {
    const uid = await seedPasswordAccount(env.client, 'old@example.test', 'old-pass');
    const res = await call('POST', '/sign-in/email', { email: 'old@example.test', password: 'old-pass' });
    expect(res.status).toBe(200);
    expect((res.body.user as { id: string }).id).toBe(uid);
  });
});

describe('구글 인증 요청', () => {
  it('범위는 openid와 email만이고 계정 선택 화면을 매번 띄우며 콜백 주소는 인증 경로 아래다', async () => {
    const { cookie } = await guest();
    const r = await link(cookie, { sub: nextSub(), email: 'scope@gmail.test' });
    expect(r.authUrl.origin + r.authUrl.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(r.authUrl.searchParams.get('scope')).toBe('openid email');
    expect(r.authUrl.searchParams.get('prompt')).toBe('select_account');
    expect(r.authUrl.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback/google`);
  });
});

describe('게스트의 구글 연결', () => {
  it('같은 사용자 id에 구글을 붙이고 이메일을 구글 주소(소문자)로 바꿔 게스트 표시를 내린다', async () => {
    const { uid, cookie } = await guest();
    const r = await link(cookie, { sub: nextSub(), email: 'Guest.Link@Gmail.test' });
    expect(r.ok).toBe(true);
    expect(await userRow(uid)).toEqual({ email: 'guest.link@gmail.test', email_verified: true, is_anonymous: false });
    expect(await accountRows(uid)).toEqual([{ provider_id: 'google', account_id: expect.any(String) }]);
    expect(await sessionOf({ cookie: r.cookie })).toEqual({ id: uid, email: 'guest.link@gmail.test' });
  });

  it('쿠키 캐시를 거친 세션 조회도 게스트 표시가 내려간 사용자를 돌려준다', async () => {
    const { cookie } = await guest();
    const r = await link(cookie, { sub: nextSub(), email: 'cache@gmail.test' });
    const session = await call('GET', '/get-session', undefined, r.cookie);
    expect((session.body.user as { isAnonymous: boolean; email: string })).toMatchObject({ isAnonymous: false, email: 'cache@gmail.test' });
  });

  it('구글이 준 접근·갱신·ID 토큰을 저장하지 않는다', async () => {
    const { uid, cookie } = await guest();
    await link(cookie, { sub: nextSub(), email: 'tokens@gmail.test' });
    const { rows } = await env.client.query(
      'select access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at from auth.accounts where user_id = $1', [uid]);
    expect(rows).toEqual([{ access_token: null, refresh_token: null, id_token: null, access_token_expires_at: null, refresh_token_expires_at: null }]);
  });

  it('같은 구글을 같은 계정이 다시 연결해도 성공하고 계정 행이 늘지 않으며 토큰도 저장하지 않는다', async () => {
    const who = { sub: nextSub(), email: 'again@gmail.test' };
    const { uid, cookie } = await guest();
    const first = await link(cookie, who);
    const again = await link(first.cookie, who);
    expect(again.ok).toBe(true);
    expect(await accountRows(uid)).toHaveLength(1);
    const { rows } = await env.client.query('select access_token, id_token from auth.accounts where user_id = $1', [uid]);
    expect(rows).toEqual([{ access_token: null, id_token: null }]);
  });

  it('ID 토큰을 직접 보내는 연결 경로는 받지 않는다', async () => {
    const { uid, cookie } = await guest();
    const res = await call('POST', '/link-social', { provider: 'google', idToken: { token: 'a.b.c' } }, cookie);
    expect(res.status).toBe(400);
    expect(await accountRows(uid)).toEqual([]);
  });

  it('연결하지 않은 구글로 바로 로그인하면 signup_disabled이고 사용자를 만들지 않는다', async () => {
    const { cookie } = await guest();
    const r = await signIn(cookie, { sub: nextSub(), email: 'nobody@gmail.test' });
    expect(r.error).toBe('signup_disabled');
    expect((await env.client.query(`select 1 from auth.users where email = 'nobody@gmail.test'`)).rows).toHaveLength(0);
  });
});

describe('이미 다른 계정에 연결된 구글', () => {
  it('게스트가 고르면 account_already_linked_to_different_user이고 게스트 행은 그대로다', async () => {
    const who = { sub: nextSub(), email: 'owner@gmail.test' };
    const owner = await guest();
    await link(owner.cookie, who);
    const g = await guest();
    const r = await link(g.cookie, who);
    expect(r.error).toBe('account_already_linked_to_different_user');
    expect(await accountRows(g.uid)).toEqual([]);
    expect((await userRow(g.uid)).is_anonymous).toBe(true);
  });

  it('확인 뒤 구글 로그인은 그 계정의 세션을 만들고 게스트 행을 지우지 않는다', async () => {
    const who = { sub: nextSub(), email: 'owner2@gmail.test' };
    const owner = await guest();
    await link(owner.cookie, who);
    const g = await guest();
    const r = await signIn(g.cookie, who);
    expect(r.ok).toBe(true);
    expect(await sessionOf({ cookie: r.cookie })).toEqual({ id: owner.uid, email: 'owner2@gmail.test' });
    expect((await userRow(g.uid)).is_anonymous).toBe(true);
  });

  it('이메일 계정이 고르면 같은 코드로 거부하고 두 계정을 그대로 둔다', async () => {
    const who = { sub: nextSub(), email: 'taken-google@gmail.test' };
    const owner = await guest();
    await link(owner.cookie, who);
    const uid = await seedPasswordAccount(env.client, 'member1@example.test', 'secret1');
    const login = await call('POST', '/sign-in/email', { email: 'member1@example.test', password: 'secret1' });
    const r = await link(login.cookie, who);
    expect(r.error).toBe('account_already_linked_to_different_user');
    expect(await accountRows(uid)).toEqual([{ provider_id: 'credential', account_id: uid }]);
    expect((await userRow(uid)).email).toBe('member1@example.test');
  });

  it('이메일 계정이 고른 구글의 주소를 다른 계정이 이메일로 쓰면 같은 코드로 거부한다', async () => {
    await seedPasswordAccount(env.client, 'someone@gmail.test', 'secret1');
    const uid = await seedPasswordAccount(env.client, 'member2@example.test', 'secret1');
    const login = await call('POST', '/sign-in/email', { email: 'member2@example.test', password: 'secret1' });
    const r = await link(login.cookie, { sub: nextSub(), email: 'Someone@Gmail.test' });
    expect(r.error).toBe('account_already_linked_to_different_user');
    expect(await accountRows(uid)).toEqual([{ provider_id: 'credential', account_id: uid }]);
  });
});

describe('구글 연결 전 이메일 계정과 같은 주소', () => {
  it('게스트의 연결은 email_account_exists이고 아무것도 바뀌지 않는다', async () => {
    await seedPasswordAccount(env.client, 'same@gmail.test', 'secret1');
    const { uid, cookie } = await guest();
    const r = await link(cookie, { sub: nextSub(), email: 'Same@Gmail.test' });
    expect(r.error).toBe('email_account_exists');
    expect(await accountRows(uid)).toEqual([]);
    expect((await userRow(uid)).is_anonymous).toBe(true);
  });

  it('같은 경우의 구글 로그인은 account_not_linked다', async () => {
    await seedPasswordAccount(env.client, 'same2@gmail.test', 'secret1');
    const { cookie } = await guest();
    const r = await signIn(cookie, { sub: nextSub(), email: 'same2@gmail.test' });
    expect(r.error).toBe('account_not_linked');
  });
});

describe('이메일 계정의 구글 연결', () => {
  it('자기 이메일과 같은 주소의 구글을 연결할 수 있다', async () => {
    const uid = await seedPasswordAccount(env.client, 'self@gmail.test', 'secret1');
    const login = await call('POST', '/sign-in/email', { email: 'self@gmail.test', password: 'secret1' });
    const r = await link(login.cookie, { sub: nextSub(), email: 'self@gmail.test' });
    expect(r.ok).toBe(true);
    expect(await accountRows(uid)).toEqual([{ provider_id: 'google', account_id: expect.any(String) }]);
  });

  it('연결하면 이메일을 구글 주소로 바꾸고 비밀번호 수단을 지우며, 다른 세션만 끊는다', async () => {
    const uid = await seedPasswordAccount(env.client, 'old-address@example.test', 'secret1');
    const here = await call('POST', '/sign-in/email', { email: 'old-address@example.test', password: 'secret1' });
    const other = await call('POST', '/sign-in/email', { email: 'old-address@example.test', password: 'secret1' });
    const r = await link(here.cookie, { sub: nextSub(), email: 'New.Address@Gmail.test' });
    expect(r.ok).toBe(true);
    expect(await userRow(uid)).toEqual({ email: 'new.address@gmail.test', email_verified: true, is_anonymous: false });
    expect((await accountRows(uid)).map(a => a.provider_id)).toEqual(['google']);
    expect(await aliveSession(here.cookie)).toBe(true);
    expect(await aliveSession(other.cookie)).toBe(false);
    expect((await call('POST', '/sign-in/email', { email: 'old-address@example.test', password: 'secret1' })).status).toBe(401);
    expect((await call('POST', '/sign-in/email', { email: 'new.address@gmail.test', password: 'secret1' })).status).toBe(401);
  });

  it('이미 구글을 연결한 계정이 다른 구글을 고르면 google_already_connected다', async () => {
    const { uid, cookie } = await guest();
    const first = await link(cookie, { sub: nextSub(), email: 'first@gmail.test' });
    const r = await link(first.cookie, { sub: nextSub(), email: 'second@gmail.test' });
    expect(r.error).toBe('google_already_connected');
    expect(await accountRows(uid)).toHaveLength(1);
    expect((await userRow(uid)).email).toBe('first@gmail.test');
  });

  it('연결 뒤에는 재설정 메일을 보내지 않고, 연결 전에 받은 토큰으로도 비밀번호 수단이 생기지 않는다', async () => {
    const uid = await seedPasswordAccount(env.client, 'reset-me@example.test', 'secret1');
    expect((await call('POST', '/request-password-reset', { email: 'reset-me@example.test', redirectTo: `${ORIGIN}/` })).status).toBe(200);
    expect(sentMails).toHaveLength(1);
    const token = /reset-password\/([^?\s]+)/.exec(sentMails[0].text)?.[1];
    const login = await call('POST', '/sign-in/email', { email: 'reset-me@example.test', password: 'secret1' });
    const r = await link(login.cookie, { sub: nextSub(), email: 'reset-done@gmail.test' });
    expect(r.ok).toBe(true);

    sentMails.length = 0;
    expect((await call('POST', '/request-password-reset', { email: 'reset-done@gmail.test', redirectTo: `${ORIGIN}/` })).status).toBe(200);
    expect(sentMails).toHaveLength(0);
    expect((await call('POST', '/reset-password', { newPassword: 'brand-new', token })).status).toBe(400);
    expect((await accountRows(uid)).map(a => a.provider_id)).toEqual(['google']);
  });

  it('연결 전에는 재설정 메일이 그대로 나간다', async () => {
    await seedPasswordAccount(env.client, 'still-pw@example.test', 'secret1');
    await call('POST', '/request-password-reset', { email: 'still-pw@example.test', redirectTo: `${ORIGIN}/` });
    expect(sentMails.map(m => m.to)).toEqual([['still-pw@example.test']]);
    expect(bcrypt.compareSync('secret1', (await env.client.query(`select password from auth.accounts where provider_id = 'credential' and account_id = (select id::text from auth.users where email = 'still-pw@example.test')`)).rows[0].password)).toBe(true);
  });
});

describe('가입 요청과 인증 요청 덮어쓰기', () => {
  it('본문에 requestSignUp을 실어도 연결한 적 없는 구글로는 사용자를 만들지 않는다', async () => {
    const { cookie } = await guest();
    const r = await signIn(cookie, { sub: nextSub(), email: 'forced@gmail.test' }, { requestSignUp: true });
    expect(r.error).toBe('signup_disabled');
    expect((await env.client.query(`select 1 from auth.users where email = 'forced@gmail.test'`)).rows).toHaveLength(0);
  });

  it('범위를 넓히거나 인증 요청 매개변수를 덮어쓰는 본문은 거부한다', async () => {
    const { uid, cookie } = await guest();
    for (const path of ['/link-social', '/sign-in/social']) {
      for (const extra of [{ scopes: ['profile'] }, { additionalParams: { prompt: 'none' } }]) {
        const res = await call('POST', path, { provider: 'google', callbackURL: `${ORIGIN}/`, disableRedirect: true, ...extra }, cookie);
        expect(res.status, `${path} ${JSON.stringify(extra)}`).toBe(400);
        expect(res.body.url).toBeUndefined();
      }
    }
    expect(await accountRows(uid)).toEqual([]);
  });
});

describe('연결 충돌의 세부', () => {
  it('게스트가 고른 주소를 이미 구글을 연결한 계정이 쓰면 account_already_linked_to_different_user다', async () => {
    const owner = await guest();
    await link(owner.cookie, { sub: nextSub(), email: 'shared@gmail.test' });
    const g = await guest();
    const r = await link(g.cookie, { sub: nextSub(), email: 'Shared@Gmail.test' });
    expect(r.error).toBe('account_already_linked_to_different_user');
    expect((await userRow(g.uid)).is_anonymous).toBe(true);
  });

  it('구글이 확인하지 않은 주소는 unable_to_link_account로 거부하고 아무것도 바꾸지 않는다', async () => {
    const { uid, cookie } = await guest();
    const r = await link(cookie, { sub: nextSub(), email: 'unverified@gmail.test', verified: false });
    expect(r.error).toBe('unable_to_link_account');
    expect(await accountRows(uid)).toEqual([]);
    expect((await userRow(uid)).is_anonymous).toBe(true);
  });
});

describe('연결 마무리의 재실행', () => {
  it('구글 계정 행만 있고 마무리가 안 된 게스트는 같은 구글을 다시 연결하면 마무리된다', async () => {
    const who = { sub: nextSub(), email: 'half-guest@gmail.test' };
    const { uid, cookie } = await guest();
    await env.client.query(`insert into auth.accounts (user_id, account_id, provider_id) values ($1, $2, 'google')`, [uid, who.sub]);
    expect((await userRow(uid)).is_anonymous).toBe(true);
    const r = await link(cookie, who);
    expect(r.ok).toBe(true);
    expect(await userRow(uid)).toEqual({ email: 'half-guest@gmail.test', email_verified: true, is_anonymous: false });
    expect(await accountRows(uid)).toHaveLength(1);
  });

  it('구글 계정 행과 비밀번호 수단이 함께 남은 이메일 계정도 다시 연결하면 비밀번호 수단과 다른 세션이 정리된다', async () => {
    const who = { sub: nextSub(), email: 'half-member@gmail.test' };
    const uid = await seedPasswordAccount(env.client, 'half-member@example.test', 'secret1');
    await env.client.query(`insert into auth.accounts (user_id, account_id, provider_id) values ($1, $2, 'google')`, [uid, who.sub]);
    const here = await call('POST', '/sign-in/email', { email: 'half-member@example.test', password: 'secret1' });
    const other = await call('POST', '/sign-in/email', { email: 'half-member@example.test', password: 'secret1' });
    const r = await link(here.cookie, who);
    expect(r.ok).toBe(true);
    expect((await accountRows(uid)).map(a => a.provider_id)).toEqual(['google']);
    expect((await userRow(uid)).email).toBe('half-member@gmail.test');
    expect(await aliveSession(here.cookie)).toBe(true);
    expect(await aliveSession(other.cookie)).toBe(false);
  });

  it('마무리가 끝난 계정에 같은 구글을 다시 연결해도 결과가 같다', async () => {
    const who = { sub: nextSub(), email: 'twice@gmail.test' };
    const { uid, cookie } = await guest();
    const first = await link(cookie, who);
    const again = await link(first.cookie, who);
    expect(again.ok).toBe(true);
    expect(await userRow(uid)).toEqual({ email: 'twice@gmail.test', email_verified: true, is_anonymous: false });
    expect(await aliveSession(again.cookie)).toBe(true);
  });
});

describe('재설정 엔드포인트 가드', () => {
  it('비밀번호 수단이 없는 계정의 재설정 토큰은 비밀번호 수단을 만들지 않고 거부한다', async () => {
    const { uid, cookie } = await guest();
    await link(cookie, { sub: nextSub(), email: 'no-pw@gmail.test' });
    await env.client.query(`insert into auth.verifications (identifier, value, expires_at) values ('reset-password:raced-token', $1, now() + interval '1 hour')`, [uid]);
    const res = await call('POST', '/reset-password', { newPassword: 'brand-new', token: 'raced-token' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
    expect((await accountRows(uid)).map(a => a.provider_id)).toEqual(['google']);
  });
});
