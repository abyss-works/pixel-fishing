// 데스크톱 위젯 PKCE 인증·토큰 교환·Bearer 가드·수명주기 폐기 실제 Postgres 통합 테스트.
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WIDGET_MIN_CLIENT_VERSION } from '../../src/game/rules/widget.js';
import { recordConsent } from '../_data/consent.js';
import { updateLastSpot } from '../_data/save.js';
import { sha256Hex } from '../_data/widget.js';
import { database } from '../_db/client.js';
import {
  adminSessionHeaders,
  seedUser,
  sessionHeaders,
  startActionEnv,
  testUid,
  userToken,
} from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { buildContentSecurityPolicy } from '../_server/securityHeaders.js';
import authHandler, {
  createWidgetAuthLogoutHandler,
  widgetAuthExchangeHandler,
  widgetAuthStartHandler,
} from './auth.js';
import type { WidgetRes } from './guard.js';
import { authenticateWidgetRequest, provideWidgetDisconnect } from './guard.js';

let env: ActionEnv;
let nextUid = 9500;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
afterEach(() => {
  delete process.env.WIDGET_API_ENABLED;
  process.env.DEPLOY_ENV = 'local';
  process.env.CONSENT_EFFECTIVE_DATE = '2099-12-31';
  provideWidgetDisconnect(() => {});
});

interface MockOut {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  contentType: string;
}

async function runHandler(
  fn: (req: never, res: never) => Promise<void>,
  opts: {
    method: string;
    url?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown;
    withCsp?: boolean;
  },
): Promise<MockOut> {
  const out: MockOut = { status: 200, body: undefined, headers: {}, contentType: '' };
  if (opts.withCsp) {
    out.headers['content-security-policy'] = buildContentSecurityPolicy({ origin: 'http://localhost:3000' });
  }
  const res = {
    get statusCode() { return out.status; },
    set statusCode(code: number) { out.status = code; },
    getHeader(k: string) { return out.headers[k.toLowerCase()]; },
    setHeader(k: string, v: string | number | readonly string[]) {
      out.headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
    },
    status(code: number) { out.status = code; return res; },
    type(t: string) { out.contentType = t; return res; },
    json(b: unknown) { out.body = b; },
    send(b: unknown) { out.body = b; },
    end(b?: unknown) { if (b !== undefined) out.body = b; },
  };
  const parsedUrl = new URL(opts.url ?? '/', 'http://x');
  const query = opts.query ?? Object.fromEntries(parsedUrl.searchParams.entries());
  await fn({ method: opts.method, url: opts.url ?? '/', query, headers: opts.headers ?? {}, body: opts.body } as never, res as never);
  return out;
}

async function runGuardCheck(headers: Record<string, string>): Promise<MockOut> {
  return runHandler((async (req: never, res: WidgetRes) => {
    const ctx = await authenticateWidgetRequest(req, res, database().db);
    if (ctx) res.status(200).json({ uid: ctx.uid, spotId: ctx.spotId });
  }) as (req: never, res: never) => Promise<void>, { method: 'GET', headers });
}

function makePkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const state = randomBytes(16).toString('base64url');
  return { verifier, challenge, state };
}

async function seedGoogleUser(opts: { admin?: boolean; restricted?: boolean; lastSpot?: string } = {}): Promise<string> {
  const uid = testUid(nextUid++);
  await seedUser(env.client, {
    uid,
    email: `widget-${uid.slice(-6)}@gmail.test`,
    nickname: `위젯-${uid.slice(-4)}`,
    admin: opts.admin,
    restricted: opts.restricted,
    state: { gold: 100, location: { kind: 'region', id: 'village' } },
  });
  await env.client.query(
    `insert into auth.accounts (user_id, account_id, provider_id) values ($1::uuid, $2, 'google')`,
    [uid, `google-sub-${uid}`],
  );
  if (opts.lastSpot) {
    await updateLastSpot(database().db, uid, opts.lastSpot);
  }
  return uid;
}

const widgetHeaders = (token?: string, version = WIDGET_MIN_CLIENT_VERSION): Record<string, string> => ({
  'x-widget-client': 'desktop',
  'x-widget-version': version,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

describe('위젯 PKCE 인증·교환·Bearer 가드·로그아웃', () => {
  it('production에서 WIDGET_API_ENABLED=true가 아니면 모든 위젯 인증 엔드포인트가 404다', async () => {
    process.env.DEPLOY_ENV = 'production';
    const pkce = makePkce();
    const redirectUri = 'http://127.0.0.1:4101/callback';
    const startUrl = `/api/widget/auth/start?code_challenge=${pkce.challenge}&code_challenge_method=S256&state=${pkce.state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    expect((await runHandler(widgetAuthStartHandler, { method: 'GET', url: startUrl })).status).toBe(404);
    expect((await runHandler(widgetAuthExchangeHandler, {
      method: 'POST',
      url: '/api/widget/auth/exchange',
      headers: widgetHeaders(),
      body: { code: 'x', codeVerifier: pkce.verifier, redirectUri },
    })).status).toBe(404);
    expect((await runHandler(createWidgetAuthLogoutHandler(), {
      method: 'POST',
      url: '/api/widget/auth/logout',
      headers: widgetHeaders('tok'),
    })).status).toBe(404);
  });

  it('start: 잘못된 redirect_uri·challenge·state·method는 400 invalid-request로 차단한다', async () => {
    const pkce = makePkce();
    const validRedirect = encodeURIComponent('http://127.0.0.1:4102/callback');
    for (const url of [
      `/api/widget/auth/start?code_challenge=${pkce.challenge}&state=${pkce.state}&redirect_uri=${encodeURIComponent('http://localhost:4102/callback')}`,
      `/api/widget/auth/start?code_challenge=${pkce.challenge}&state=${pkce.state}&redirect_uri=${encodeURIComponent('http://127.0.0.1:4102/evil')}`,
      `/api/widget/auth/start?code_challenge=${pkce.challenge}&state=${pkce.state}&redirect_uri=${encodeURIComponent('http://127.0.0.1:70000/callback')}`,
      `/api/widget/auth/start?code_challenge=short&state=${pkce.state}&redirect_uri=${validRedirect}`,
      `/api/widget/auth/start?code_challenge=${pkce.challenge}&state=short&redirect_uri=${validRedirect}`,
      `/api/widget/auth/start?code_challenge=${pkce.challenge}&code_challenge_method=plain&state=${pkce.state}&redirect_uri=${validRedirect}`,
    ]) {
      const res = await runHandler(widgetAuthStartHandler, { method: 'GET', url });
      expect(res, url).toMatchObject({ status: 400, body: { error: 'invalid-request' } });
    }
  });

  it('start: 미로그인·게스트 세션이면 CSP 해시가 포함된 Google 로그인 HTML을 내려 준다', async () => {
    const pkce = makePkce();
    const redirectUri = 'http://127.0.0.1:4103/callback';
    const startUrl = `/api/widget/auth/start?code_challenge=${pkce.challenge}&code_challenge_method=S256&state=${pkce.state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const anonRes = await runHandler(widgetAuthStartHandler, { method: 'GET', url: startUrl, withCsp: true });
    expect(anonRes.status).toBe(200);
    expect(anonRes.contentType).toBe('html');
    expect(anonRes.headers['cache-control']).toBe('no-store');
    expect(String(anonRes.body)).toContain('/api/auth/sign-in/social');
    expect(anonRes.headers['content-security-policy']).toMatch(/script-src 'self' 'sha256-[^']+'/);

    const guestUid = await seedUser(env.client, { uid: testUid(nextUid++), email: null, nickname: null });
    const guestRes = await runHandler(widgetAuthStartHandler, {
      method: 'GET',
      url: startUrl,
      headers: sessionHeaders(userToken(guestUid)),
      withCsp: true,
    });
    expect(guestRes.status).toBe(200);
    expect(String(guestRes.body)).toContain('Google로 계속하기');
  });

  it('start -> exchange -> Bearer 인증 -> logout 전체 PKCE 왕복과 재사용 차단을 검증한다', async () => {
    const uid = await seedGoogleUser({ lastSpot: 'deep' });
    const pkce = makePkce();
    const redirectUri = 'http://127.0.0.1:4104/callback';
    const startRes = await runHandler(authHandler, {
      method: 'GET',
      url: `/api/widget/auth/start?code_challenge=${pkce.challenge}&code_challenge_method=S256&state=${pkce.state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      headers: sessionHeaders(userToken(uid)),
    });
    expect(startRes.status).toBe(302);
    expect(startRes.headers['referrer-policy']).toBe('no-referrer');
    expect(startRes.headers['cache-control']).toBe('no-store');

    const location = new URL(startRes.headers.location);
    expect(location.origin + location.pathname).toBe(redirectUri);
    expect(location.searchParams.get('state')).toBe(pkce.state);
    const rawCode = location.searchParams.get('code')!;
    expect(rawCode.length).toBeGreaterThan(20);

    // DB에는 해시만 저장된다
    const codeRows = (await env.client.query<{ code_hash: string }>(
      'select code_hash from public.widget_auth_codes where user_id = $1',
      [uid],
    )).rows;
    expect(codeRows).toEqual([{ code_hash: sha256Hex(rawCode) }]);

    // 잘못된 codeVerifier나 redirectUri로 교환 시 코드는 소비되고 401이 반환된다
    const badPkce = makePkce();
    const badVerifierRes = await runHandler(authHandler, {
      method: 'POST',
      url: '/api/widget/auth/exchange',
      headers: widgetHeaders(),
      body: { code: rawCode, codeVerifier: badPkce.verifier, redirectUri },
    });
    expect(badVerifierRes).toMatchObject({ status: 401, body: { error: 'invalid-code' } });

    // 이미 소비된 코드는 올바른 verifier로도 재사용할 수 없다
    const replayAfterFail = await runHandler(authHandler, {
      method: 'POST',
      url: '/api/widget/auth/exchange',
      headers: widgetHeaders(),
      body: { code: rawCode, codeVerifier: pkce.verifier, redirectUri },
    });
    expect(replayAfterFail).toMatchObject({ status: 401, body: { error: 'invalid-code' } });

    // 새 코드를 발급해 정상 교환 (snake_case 필드도 허용)
    const start2 = await runHandler(widgetAuthStartHandler, {
      method: 'GET',
      url: `/api/widget/auth/start?code_challenge=${pkce.challenge}&code_challenge_method=S256&state=${pkce.state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      headers: sessionHeaders(userToken(uid)),
    });
    const code2 = new URL(start2.headers.location).searchParams.get('code')!;

    const exRes = await runHandler(widgetAuthExchangeHandler, {
      method: 'POST',
      url: '/api/widget/auth/exchange',
      headers: widgetHeaders(),
      body: { code: code2, code_verifier: pkce.verifier, redirect_uri: redirectUri },
    });
    expect(exRes.status).toBe(200);
    const { token, expiresAt } = exRes.body as { token: string; expiresAt: string };
    expect(typeof token).toBe('string');
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());

    // 같은 코드 재사용 차단
    const replayRes = await runHandler(widgetAuthExchangeHandler, {
      method: 'POST',
      url: '/api/widget/auth/exchange',
      headers: widgetHeaders(),
      body: { code: code2, codeVerifier: pkce.verifier, redirectUri },
    });
    expect(replayRes).toMatchObject({ status: 401, body: { error: 'invalid-code' } });

    // Bearer 인증 성공 및 last_spot·last_seen_at 갱신 확인
    await env.client.query(
      `update public.widget_tokens set last_seen_at = now() - interval '10 minutes' where token_hash = $1`,
      [sha256Hex(token)],
    );
    const authOut = await runGuardCheck(widgetHeaders(token));
    expect(authOut).toMatchObject({ status: 200, body: { uid, spotId: 'deep' } });

    // 로그아웃 시 토큰 삭제 및 연결 종료 콜백 호출
    const disconnected: string[] = [];
    const onDisconnectHook = vi.fn();
    provideWidgetDisconnect(u => disconnected.push(u));
    const logoutHandler = createWidgetAuthLogoutHandler({ onUserDisconnect: onDisconnectHook });

    const logoutRes = await runHandler(logoutHandler, {
      method: 'POST',
      url: '/api/widget/auth/logout',
      headers: widgetHeaders(token),
    });
    expect(logoutRes).toMatchObject({ status: 200, body: { ok: true } });
    expect(disconnected).toEqual([uid]);
    expect(onDisconnectHook).toHaveBeenCalledWith(uid);

    // 폐기된 토큰으로는 재인증·재로그아웃 불가
    const afterLogout = await runGuardCheck(widgetHeaders(token));
    expect(afterLogout).toMatchObject({ status: 401, body: { error: 'unauthorized' } });

    const secondLogout = await runHandler(logoutHandler, {
      method: 'POST',
      url: '/api/widget/auth/logout',
      headers: widgetHeaders(token),
    });
    expect(secondLogout).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
  });

  it('preview 환경에서는 admins 명부에 있는 구글 계정만 허용하고 비관리자는 차단한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    const adminUid = await seedGoogleUser({ admin: true });
    const memberUid = await seedGoogleUser({ admin: false });
    const pkce = makePkce();
    const redirectUri = 'http://127.0.0.1:4105/callback';
    const url = `/api/widget/auth/start?code_challenge=${pkce.challenge}&state=${pkce.state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    // 비관리자는 unsupported-account로 리디렉션된다
    const nonAdminStart = await runHandler(widgetAuthStartHandler, {
      method: 'GET',
      url,
      headers: sessionHeaders(userToken(memberUid)),
    });
    expect(nonAdminStart.status).toBe(302);
    expect(nonAdminStart.headers.location).toBe(`${redirectUri}?error=unsupported-account&state=${pkce.state}`);

    // 미인증 상태에서는 스테이징 관리자 로그인 HTML(/api/admin/auth/sign-in/social)을 내려 준다
    const unauthStart = await runHandler(widgetAuthStartHandler, { method: 'GET', url, withCsp: true });
    expect(unauthStart.status).toBe(200);
    expect(String(unauthStart.body)).toContain('/api/admin/auth/sign-in/social');

    // 관리자는 관리자 세션 쿠키만으로도 코드를 발급받는다
    const adminStart = await runHandler(widgetAuthStartHandler, {
      method: 'GET',
      url,
      headers: adminSessionHeaders(userToken(adminUid)),
    });
    expect(adminStart.status).toBe(302);
    const code = new URL(adminStart.headers.location).searchParams.get('code')!;

    const exRes = await runHandler(widgetAuthExchangeHandler, {
      method: 'POST',
      headers: widgetHeaders(),
      body: { code, codeVerifier: pkce.verifier, redirectUri },
    });
    expect(exRes.status).toBe(200);
    const token = (exRes.body as { token: string }).token;

    // 관리자 명부에서 제거되면 Bearer 요청도 403 unsupported-account로 막힌다
    await env.client.query('delete from public.admins where user_id = $1', [adminUid]);
    const revokedAdminRes = await runGuardCheck(widgetHeaders(token));
    expect(revokedAdminRes).toMatchObject({ status: 403, body: { error: 'unsupported-account' } });
  });

  it('제재 계정·미동의 계정·구글 미연결 계정은 403 코드로 구분하고 426 버전을 검증한다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = '2026-01-01';
    const uid = await seedGoogleUser();
    await recordConsent(database().db, uid, '2026-01-01', 'google-link');

    const pkce = makePkce();
    const redirectUri = 'http://127.0.0.1:4106/callback';
    const start = await runHandler(widgetAuthStartHandler, {
      method: 'GET',
      url: `/api/widget/auth/start?code_challenge=${pkce.challenge}&state=${pkce.state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      headers: sessionHeaders(userToken(uid)),
    });
    const code = new URL(start.headers.location).searchParams.get('code')!;
    const ex = await runHandler(widgetAuthExchangeHandler, {
      method: 'POST',
      headers: widgetHeaders(),
      body: { code, codeVerifier: pkce.verifier, redirectUri },
    });
    const token = (ex.body as { token: string }).token;

    // 426 version-mismatch
    const verFail = await runGuardCheck(widgetHeaders(token, '0.0.1'));
    expect(verFail).toMatchObject({
      status: 426,
      body: { error: 'version-mismatch', minVersion: WIDGET_MIN_CLIENT_VERSION },
    });

    // 403 consent-required (새 판 시행으로 미동의 상태 전환)
    process.env.CONSENT_EFFECTIVE_DATE = '2026-06-01';
    const consentFail = await runGuardCheck(widgetHeaders(token));
    expect(consentFail).toMatchObject({ status: 403, body: { error: 'consent-required' } });
    await recordConsent(database().db, uid, '2026-06-01', 'confirm-screen');

    // 403 account-restricted
    await env.client.query('update public.saves_current set restricted = true where user_id = $1', [uid]);
    const restrictedFail = await runGuardCheck(widgetHeaders(token));
    expect(restrictedFail).toMatchObject({ status: 403, body: { error: 'account-restricted' } });
    await env.client.query('update public.saves_current set restricted = false where user_id = $1', [uid]);

    // 403 unsupported-account (구글 연결 해제 시)
    await env.client.query(`delete from auth.accounts where user_id = $1`, [uid]);
    const noGoogleFail = await runGuardCheck(widgetHeaders(token));
    expect(noGoogleFail).toMatchObject({ status: 403, body: { error: 'unsupported-account' } });
  });

  it('계정 탈퇴·관리자 제재·관리자 세션 폐기 시 위젯 토큰을 삭제하고 SSE 종료 훅을 호출한다', async () => {
    const { default: accountHandler } = await import('../account.js');
    const { default: adminHandler } = await import('../admin.js');

    const adminUid = await seedGoogleUser({ admin: true });
    const targetA = await seedGoogleUser();
    const targetB = await seedGoogleUser();

    for (const [i, uid] of [targetA, targetB].entries()) {
      await env.client.query(
        `insert into public.widget_tokens (token_hash, user_id, client_version, expires_at)
         values ($1, $2, '0.1.0', '2099-01-01T00:00:00Z')`,
        [`tok-life-${i}`, uid],
      );
    }

    const disconnected: string[] = [];
    provideWidgetDisconnect(uid => disconnected.push(uid));

    // 1) 관리자 제재(restrict=true) -> widget_tokens 삭제 + disconnect
    const restrictRes = await runHandler(adminHandler, {
      method: 'POST',
      url: '/api/admin?q=restrict',
      headers: adminSessionHeaders(userToken(adminUid)),
      body: { userId: targetA, restricted: true },
    });
    expect(restrictRes).toMatchObject({ status: 200, body: { restricted: true } });
    expect((await env.client.query('select 1 from public.widget_tokens where user_id = $1', [targetA])).rows).toHaveLength(0);
    expect(disconnected).toEqual([targetA]);

    // 2) 관리자 세션 폐기(revokeSessions) -> widget_tokens 삭제 + disconnect
    await env.client.query(
      `insert into public.widget_tokens (token_hash, user_id, client_version, expires_at)
       values ('tok-revoke-a', $1, '0.1.0', '2099-01-01T00:00:00Z')`,
      [targetA],
    );
    const revokeRes = await runHandler(adminHandler, {
      method: 'POST',
      url: '/api/admin?q=revokeSessions',
      headers: adminSessionHeaders(userToken(adminUid)),
      body: { userId: targetA },
    });
    expect(revokeRes.status).toBe(200);
    expect((await env.client.query('select 1 from public.widget_tokens where user_id = $1', [targetA])).rows).toHaveLength(0);
    expect(disconnected).toEqual([targetA, targetA]);

    // 3) 본인 탈퇴 -> widget_tokens 삭제 + disconnect
    const deleteRes = await runHandler(accountHandler, {
      method: 'POST',
      url: '/api/account',
      headers: sessionHeaders(userToken(targetB)),
      body: { op: 'delete' },
    });
    expect(deleteRes).toMatchObject({ status: 200, body: { deleted: true } });
    expect((await env.client.query('select 1 from public.widget_tokens where user_id = $1', [targetB])).rows).toHaveLength(0);
    expect(disconnected).toEqual([targetA, targetA, targetB]);
  });
});
