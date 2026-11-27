// 게스트→기존 구글 계정 전환 1회용 전환 티켓 — 발급, 세션 바인딩, 1회 소비, 만료, 취소, CSRF 경계를 실제 Postgres에서 확인한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedCredentialAccount, sessionHeaders, startActionEnv } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { googleCode } from '../_dbTest/serverShim.js';
import type { GoogleIdentity } from '../_dbTest/serverShim.js';

const ORIGIN = 'http://localhost:3000';
const SWITCH_COOKIE_NAME = 'better-auth.google_switch_ticket';

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

interface Res {
  status: number;
  body: Record<string, unknown>;
  cookie: string;
  setCookies: string[];
  location: string | null;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  cookie = '',
  extraHeaders: Record<string, string> = {},
): Promise<Res> {
  const res = await handle(new Request(`${ORIGIN}/api/auth${path}`, {
    method,
    redirect: 'manual',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const setCookies = res.headers.getSetCookie();
  const activeCookies = setCookies.map(c => c.split(';')[0]).filter(c => !c.endsWith('='));
  return {
    status: res.status,
    body: await res.json().catch(() => ({})) as Record<string, unknown>,
    cookie: activeCookies.join('; '),
    setCookies,
    location: res.headers.get('location'),
  };
}

/** 쿠키 문자열을 합친다. 같은 이름은 뒤의 값이 이긴다 */
const merge = (...jars: string[]): string => {
  const out = new Map<string, string>();
  for (const jar of jars) {
    for (const pair of jar.split('; ')) {
      if (pair) out.set(pair.slice(0, pair.indexOf('=')), pair);
    }
  }
  return [...out.values()].join('; ');
};

async function guest(): Promise<{ uid: string; cookie: string }> {
  const r = await call('POST', '/sign-in/anonymous', {});
  expect(r.status).toBe(200);
  return { uid: (r.body.user as { id: string }).id, cookie: r.cookie };
}

async function viaGoogle(start: '/link-social' | '/sign-in/social', cookie: string, who: GoogleIdentity) {
  const code = googleCode(`switch-code-${seq++}`, who);
  const begin = await call('POST', start, {
    provider: 'google',
    callbackURL: `${ORIGIN}/?google=${start === '/link-social' ? 'link-guest' : 'sign-in'}`,
    errorCallbackURL: `${ORIGIN}/?google=${start === '/link-social' ? 'link-guest' : 'sign-in'}`,
    disableRedirect: true,
  }, cookie);
  const authUrl = new URL(String(begin.body.url));
  const back = await call(
    'GET',
    `/callback/google?code=${code}&state=${authUrl.searchParams.get('state')}`,
    undefined,
    merge(cookie, begin.cookie),
  );
  const location = new URL(back.location ?? ORIGIN);
  return {
    status: back.status,
    error: location.searchParams.get('error'),
    cookie: merge(cookie, back.cookie),
    setCookies: back.setCookies,
    back,
  };
}

const nextSub = () => `switch-sub-${seq++}`;
const findSwitchSetCookie = (setCookies: string[]) => setCookies.find(c => c.startsWith(`${SWITCH_COOKIE_NAME}=`));
const switchVerifications = async () =>
  (await env.client.query<{ id: string; identifier: string; value: string; expires_at: Date }>(
    `select id, identifier, value, expires_at from auth.verifications where identifier like 'google-switch:%' order by created_at desc`,
  )).rows;

async function cleanupSwitchRows() {
  await env.client.query(`delete from auth.verifications where identifier like 'google-switch:%'`);
}

describe('1회용 전환 티켓 발급', () => {
  it('게스트가 이미 다른 계정에 연결된 구글을 고르면 HttpOnly·SameSite=Lax 티켓 쿠키와 5분 유효 verifications 행을 저장한다', async () => {
    await cleanupSwitchRows();
    const who = { sub: nextSub(), email: 'switch-owner@gmail.test' };
    const owner = await guest();
    const ownerLinked = await viaGoogle('/link-social', owner.cookie, who);
    expect(ownerLinked.error).toBeNull();

    const g = await guest();
    const before = Date.now();
    const res = await viaGoogle('/link-social', g.cookie, who);

    expect(res.error).toBe('account_already_linked_to_different_user');
    const cookieHeader = findSwitchSetCookie(res.setCookies);
    expect(cookieHeader).toBeTruthy();
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toMatch(/SameSite=Lax/i);
    expect(cookieHeader).not.toMatch(/Max-Age=0/i);

    const rows = await switchVerifications();
    expect(rows).toHaveLength(1);
    const ttlMs = rows[0].expires_at.getTime() - before;
    expect(ttlMs).toBeGreaterThanOrEqual(4 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(5 * 60 * 1000 + 5000);
    const payload = JSON.parse(rows[0].value) as { guestUserId: string; targetUserId: string };
    expect(payload.guestUserId).toBe(g.uid);
    expect(payload.targetUserId).toBe(owner.uid);

    // 게스트 행과 소유자 토큰 폐기 원칙 유지
    const gUser = (await env.client.query<{ is_anonymous: boolean }>('select is_anonymous from auth.users where id = $1', [g.uid])).rows[0];
    expect(gUser.is_anonymous).toBe(true);
    const ownerTokens = (await env.client.query('select access_token, refresh_token, id_token from auth.accounts where user_id = $1', [owner.uid])).rows[0];
    expect(ownerTokens).toEqual({ access_token: null, refresh_token: null, id_token: null });
  });

  it('이메일 계정이 충돌하면 전환 티켓을 발급하지 않는다', async () => {
    await cleanupSwitchRows();
    const who = { sub: nextSub(), email: 'switch-member-owner@gmail.test' };
    const owner = await guest();
    await viaGoogle('/link-social', owner.cookie, who);

    const memberUid = await seedCredentialAccount(env.client, 'switch-member@example.test');
    const memberToken = `switch-member-session-${memberUid}`;
    await env.client.query(`insert into auth.sessions (user_id, token, expires_at) values ($1, $2, '2100-01-01T00:00:00Z')`, [memberUid, memberToken]);
    const res = await viaGoogle('/link-social', sessionHeaders(memberToken).cookie, who);

    expect(res.error).toBe('account_already_linked_to_different_user');
    expect(findSwitchSetCookie(res.setCookies)).toBeUndefined();
    expect(await switchVerifications()).toHaveLength(0);
  });

  it('이메일 미확인 구글 계정(unable_to_link_account) 등 다른 오류에는 전환 티켓을 발급하지 않는다', async () => {
    await cleanupSwitchRows();
    const who = { sub: nextSub(), email: 'switch-unverified@gmail.test', verified: false };
    const g = await guest();
    const res = await viaGoogle('/link-social', g.cookie, who);

    expect(res.error).toBe('unable_to_link_account');
    expect(findSwitchSetCookie(res.setCookies)).toBeUndefined();
    expect(await switchVerifications()).toHaveLength(0);
  });
});

describe('POST /api/auth/confirm-google-switch', () => {
  async function setupConflict() {
    await cleanupSwitchRows();
    const who = { sub: nextSub(), email: `confirm-${seq++}@gmail.test` };
    const owner = await guest();
    await viaGoogle('/link-social', owner.cookie, who);
    await env.client.query('delete from public.consent_records where user_id = $1', [owner.uid]);
    const g = await guest();
    const conflict = await viaGoogle('/link-social', g.cookie, who);
    expect(conflict.error).toBe('account_already_linked_to_different_user');
    return { owner, g, who, cookie: conflict.cookie };
  }

  it('유효한 티켓과 일치하는 게스트 세션이면 2차 OAuth 없이 즉시 기존 계정 세션을 발급하고 티켓을 1회 소비한다', async () => {
    const { owner, g, who, cookie } = await setupConflict();
    const confirm = await call('POST', '/confirm-google-switch', {}, cookie);

    expect(confirm.status).toBe(200);
    expect(confirm.body).toEqual({ ok: true });
    expect(findSwitchSetCookie(confirm.setCookies)).toMatch(/Max-Age=0/i);

    const switchedCookie = merge(cookie, confirm.cookie);
    expect(await sessionOf({ cookie: switchedCookie })).toEqual({ id: owner.uid, email: who.email });

    // 티켓 즉시 소비 + 게스트 계정 행 보존 + 동의/우편 미기록 + 세션 IP/UA 비움
    expect(await switchVerifications()).toHaveLength(0);
    const gRow = (await env.client.query<{ is_anonymous: boolean }>('select is_anonymous from auth.users where id = $1', [g.uid])).rows[0];
    expect(gRow.is_anonymous).toBe(true);
    const consents = (await env.client.query('select 1 from public.consent_records where user_id = $1', [owner.uid])).rows;
    expect(consents).toHaveLength(0);
    const sessions = (await env.client.query<{ ip_address: string | null; user_agent: string | null }>(
      'select ip_address, user_agent from auth.sessions where user_id = $1 order by created_at desc limit 1',
      [owner.uid],
    )).rows;
    expect(sessions[0]).toEqual({ ip_address: null, user_agent: null });

    // 재사용 불가
    const replay = await call('POST', '/confirm-google-switch', {}, cookie);
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('switch_ticket_expired');
  });

  it('동시 재전송(race) 요청 중 하나만 성공하고 나머지는 거부한다', async () => {
    const { owner, who, cookie } = await setupConflict();
    const [r1, r2] = await Promise.all([
      call('POST', '/confirm-google-switch', {}, cookie),
      call('POST', '/confirm-google-switch', {}, cookie),
    ]);
    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 400]);
    const winner = r1.status === 200 ? r1 : r2;
    expect(await sessionOf({ cookie: merge(cookie, winner.cookie) })).toEqual({ id: owner.uid, email: who.email });
    expect(await switchVerifications()).toHaveLength(0);
  });

  it('만료된 티켓이면 쿠키와 행을 정리하고 switch_ticket_expired를 돌려준다', async () => {
    const { g, cookie } = await setupConflict();
    await env.client.query(`update auth.verifications set expires_at = now() - interval '1 second' where identifier like 'google-switch:%'`);

    const res = await call('POST', '/confirm-google-switch', {}, cookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('switch_ticket_expired');
    expect(findSwitchSetCookie(res.setCookies)).toMatch(/Max-Age=0/i);
    expect(await switchVerifications()).toHaveLength(0);
    expect(await sessionOf({ cookie })).toEqual({ id: g.uid, email: null });
  });

  it('티켓 쿠키가 없거나 위변조되면 switch_ticket_missing을 돌려준다', async () => {
    const g = await guest();
    const missing = await call('POST', '/confirm-google-switch', {}, g.cookie);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('switch_ticket_missing');

    const tampered = await call(
      'POST',
      '/confirm-google-switch',
      {},
      merge(g.cookie, `${SWITCH_COOKIE_NAME}=forged.invalidsignature`),
    );
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe('switch_ticket_missing');
    expect(findSwitchSetCookie(tampered.setCookies)).toMatch(/Max-Age=0/i);
  });

  it('세션이 없거나 다른 게스트 세션이면 switch_session_required 또는 switch_session_mismatch로 거부한다', async () => {
    const { cookie } = await setupConflict();
    const ticketOnlyCookie = cookie.split('; ').filter(p => p.startsWith(`${SWITCH_COOKIE_NAME}=`)).join('; ');

    const noSession = await call('POST', '/confirm-google-switch', {}, ticketOnlyCookie);
    expect(noSession.status).toBe(401);
    expect(noSession.body.code).toBe('switch_session_required');

    const otherGuest = await guest();
    const mismatch = await call('POST', '/confirm-google-switch', {}, merge(otherGuest.cookie, ticketOnlyCookie));
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.code).toBe('switch_session_mismatch');
    expect(await sessionOf({ cookie: otherGuest.cookie })).toEqual({ id: otherGuest.uid, email: null });
  });

  it('다른 출처(Origin) 요청은 CSRF 검사에서 403으로 차단하고 티켓을 소비하지 않는다', async () => {
    const { cookie } = await setupConflict();
    const res = await handle(new Request(`${ORIGIN}/api/auth/confirm-google-switch`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie },
      body: '{}',
    }));
    expect(res.status).toBe(403);
    expect(await switchVerifications()).toHaveLength(1);
  });
});

describe('POST /api/auth/cancel-google-switch', () => {
  it('취소 시 DB 티켓과 쿠키를 즉시 폐기하고 게스트 세션을 유지한다', async () => {
    await cleanupSwitchRows();
    const who = { sub: nextSub(), email: 'cancel-owner@gmail.test' };
    const owner = await guest();
    await viaGoogle('/link-social', owner.cookie, who);
    const g = await guest();
    const conflict = await viaGoogle('/link-social', g.cookie, who);
    expect(await switchVerifications()).toHaveLength(1);

    const cancel = await call('POST', '/cancel-google-switch', {}, conflict.cookie);
    expect(cancel.status).toBe(200);
    expect(cancel.body).toEqual({ ok: true });
    expect(findSwitchSetCookie(cancel.setCookies)).toMatch(/Max-Age=0/i);
    expect(await switchVerifications()).toHaveLength(0);
    expect(await sessionOf({ cookie: conflict.cookie })).toEqual({ id: g.uid, email: null });
  });

  it('다른 출처(Origin) 취소 요청은 403으로 차단하고 티켓을 지우지 않는다', async () => {
    await cleanupSwitchRows();
    const who = { sub: nextSub(), email: 'cancel-csrf@gmail.test' };
    const owner = await guest();
    await viaGoogle('/link-social', owner.cookie, who);
    const g = await guest();
    const conflict = await viaGoogle('/link-social', g.cookie, who);

    const res = await handle(new Request(`${ORIGIN}/api/auth/cancel-google-switch`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie: conflict.cookie },
      body: '{}',
    }));
    expect(res.status).toBe(403);
    expect(await switchVerifications()).toHaveLength(1);
  });

  it('후속 구글 연결이 성공하면 남아 있던 이전 전환 티켓과 쿠키를 정리한다', async () => {
    await cleanupSwitchRows();
    const who1 = { sub: nextSub(), email: 'taken-before@gmail.test' };
    const who2 = { sub: nextSub(), email: 'fresh-after@gmail.test' };
    const owner = await guest();
    await viaGoogle('/link-social', owner.cookie, who1);
    const g = await guest();
    const conflict = await viaGoogle('/link-social', g.cookie, who1);
    expect(await switchVerifications()).toHaveLength(1);

    const linked = await viaGoogle('/link-social', conflict.cookie, who2);
    expect(linked.error).toBeNull();
    expect(findSwitchSetCookie(linked.setCookies)).toMatch(/Max-Age=0/i);
    expect(await switchVerifications()).toHaveLength(0);
  });
});

describe('대상 계정 상태 검증', () => {
  it('전환 확인 전 대상 계정의 구글 연결이 해제되면 switch_target_unavailable로 거부하고 쿠키를 만료시킨다', async () => {
    await cleanupSwitchRows();
    const who = { sub: nextSub(), email: 'unlinked-target@gmail.test' };
    const owner = await guest();
    await viaGoogle('/link-social', owner.cookie, who);
    const g = await guest();
    const conflict = await viaGoogle('/link-social', g.cookie, who);

    await env.client.query(`delete from auth.accounts where user_id = $1 and provider_id = 'google'`, [owner.uid]);

    const res = await call('POST', '/confirm-google-switch', {}, conflict.cookie);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('switch_target_unavailable');
    expect(findSwitchSetCookie(res.setCookies)).toMatch(/Max-Age=0/i);
    expect(await sessionOf({ cookie: merge(conflict.cookie, res.cookie) })).toEqual({ id: g.uid, email: null });
  });
});
