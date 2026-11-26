// 데스크톱 위젯 PKCE 인증·토큰 교환·로그아웃 엔드포인트 (Node 런타임).
//   GET  /api/widget/auth/start     브라우저 Google 로그인 후 루프백으로 일회용 code 리디렉션
//   POST /api/widget/auth/exchange  PKCE S256 검증 뒤 위젯 전용 Bearer 토큰 발급
//   POST /api/widget/auth/logout    Bearer 토큰 폐기 및 활성 SSE 연결 종료
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { consentPolicy } from '../_auth/consentPolicy.js';
import { adminSessionUid, sessionOf } from '../_auth/session.js';
import { isStaff } from '../_data/admin.js';
import { consentRequiredFor } from '../_data/consent.js';
import {
  consumeWidgetAuthCode,
  createWidgetAuthCode,
  createWidgetToken,
  deleteWidgetToken,
  getWidgetUserEligibility,
  sha256Hex,
} from '../_data/widget.js';
import { database } from '../_db/client.js';
import { appendScriptHashToCsp } from '../_server/securityHeaders.js';
import { ApiError, toApiError } from '../errors.js';
import { reportServerIssue } from '../observability.js';
import {
  disconnectWidgetUser,
  parseBearerToken,
  rejectIfWidgetApiDisabled,
  validateWidgetClientVersion,
} from './guard.js';

export type WidgetAuthReq = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type WidgetAuthRes = ServerResponse & {
  status: (code: number) => WidgetAuthRes;
  json: (body: unknown) => void;
  type?: (mime: string) => WidgetAuthRes;
  send?: (body: unknown) => void;
};

export interface WidgetLogoutOptions {
  onUserDisconnect?: (uid: string) => void;
}

const AUTH_CODE_TTL_MS = 5 * 60_000;
const WIDGET_TOKEN_TTL_MS = 90 * 86_400_000;

const LOOPBACK_REDIRECT_RE = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/callback$/;
const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;
const CODE_VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/;
const STATE_RE = /^[A-Za-z0-9_-]{8,128}$/;

const GOOGLE_LOGO_SVG = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" style="display:block;flex:none;margin-right:10px;">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
</svg>`;

const buildLoginScript = (signInEndpoint: string): string => `
    (() => {
      const btn = document.getElementById('widget-login');
      const err = document.getElementById('widget-error');
      const current = new URL(window.location.href);
      const returnedError = current.searchParams.get('error');
      if (returnedError !== null) {
        current.searchParams.delete('error');
        current.searchParams.delete('error_description');
        window.history.replaceState(window.history.state, '', current.toString());
        err.textContent = returnedError === 'access_denied'
          ? '구글 로그인을 취소했어요. 계속하려면 다시 로그인해 주세요.'
          : '웹에서 먼저 구글 계정을 연결한 뒤 다시 시도해 주세요.';
      }
      const cleanUrl = current.toString();

      if (btn) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          err.textContent = '';
          try {
            const res = await fetch('${signInEndpoint}', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                provider: 'google',
                callbackURL: cleanUrl,
                errorCallbackURL: cleanUrl,
                disableRedirect: true,
              }),
            });
            if (res.status === 429) {
              err.textContent = '로그인 요청이 너무 많아요. 잠시 기다린 뒤 다시 시도해 주세요.';
              btn.disabled = false;
              return;
            }
            const data = await res.json().catch(() => null);
            if (!res.ok || !data || typeof data.url !== 'string') {
              err.textContent = '구글 로그인을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
              btn.disabled = false;
              return;
            }
            window.location.assign(data.url);
          } catch {
            err.textContent = '네트워크에 연결하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
            btn.disabled = false;
          }
        });
      }
    })();
  `;

const APP_LOGIN_SCRIPT = buildLoginScript('/api/auth/sign-in/social');
const PREVIEW_LOGIN_SCRIPT = buildLoginScript('/api/admin/auth/sign-in/social');
const scriptHash = (script: string): string => `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
export const WIDGET_AUTH_APP_SCRIPT_HASH = scriptHash(APP_LOGIN_SCRIPT);
export const WIDGET_AUTH_PREVIEW_SCRIPT_HASH = scriptHash(PREVIEW_LOGIN_SCRIPT);

/** 위젯 외부 브라우저 로그인 안내 HTML을 생성한다 */
export function widgetAuthLoginHtml(isPreview: boolean): { html: string; scriptHash: string } {
  const script = isPreview ? PREVIEW_LOGIN_SCRIPT : APP_LOGIN_SCRIPT;
  const hash = isPreview ? WIDGET_AUTH_PREVIEW_SCRIPT_HASH : WIDGET_AUTH_APP_SCRIPT_HASH;
  const desc = isPreview
    ? '스테이징 데스크톱 위젯을 연결하려면 관리자 구글 계정으로 로그인해 주세요.'
    : '데스크톱 위젯을 연결하려면 웹 게임에 연결된 구글 계정으로 로그인해 주세요.';
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <title>데스크톱 위젯 로그인</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px;
      background: #0a1526; color: #f2f7fb;
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif;
      font-size: 13px; line-height: 1.55;
      word-break: keep-all; overflow-wrap: break-word;
    }
    .pf-card {
      width: 100%; max-width: 384px; padding: 20px;
      display: flex; flex-direction: column; gap: 12px;
      background: #14243d; border: 1px solid #2b4568; border-radius: 0;
      clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
      box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.08), inset -1px -1px 0 rgba(0, 0, 0, 0.45);
    }
    .pf-badge {
      align-self: flex-start; padding: 3px 8px;
      background: #0f1c31; border: 1px solid #2b4568; border-radius: 0;
      color: #93a8c4; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
    }
    h1 {
      margin: 0; font-size: 17px; font-weight: 700; letter-spacing: 0.5px; color: #ffd54f;
    }
    .pf-desc {
      margin: 0; font-size: 12px; line-height: 1.625; color: #93a8c4;
    }
    .google-btn {
      display: flex; align-items: center; width: 100%; height: 40px; padding: 0 12px;
      border-radius: 4px; border: 1px solid #747775; background: #ffffff; color: #1F1F1F;
      cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 700; line-height: 20px;
    }
    .google-btn:hover:not(:disabled) { background: color-mix(in srgb, #303030 8%, #ffffff); }
    .google-btn:active:not(:disabled) { background: color-mix(in srgb, #303030 12%, #ffffff); }
    .google-btn:disabled {
      cursor: default; opacity: 0.38;
      border-color: rgba(31, 31, 31, 0.12); color: rgba(31, 31, 31, 0.38);
    }
    .google-btn:focus-visible { outline: 2px solid #4fc3f7; outline-offset: 1px; }
    .google-label { flex: 1; text-align: center; white-space: nowrap; }
    [role="alert"] { margin: 0; font-size: 12px; line-height: 1.5; color: #ff8a80; }
    [role="alert"]:empty { display: none; }
  </style>
</head>
<body>
  <main class="pf-card">
    <span class="pf-badge">데스크톱 위젯</span>
    <h1>Google 계정으로 로그인</h1>
    <p class="pf-desc">${desc}</p>
    <p id="widget-error" role="alert"></p>
    <button id="widget-login" class="google-btn" type="button">
      ${GOOGLE_LOGO_SVG}
      <span class="google-label">Google로 계속하기</span>
    </button>
  </main>
  <script>${script}</script>
</body>
</html>`;
  return { html, scriptHash: hash };
}

function queryParam(req: WidgetAuthReq, key: string): string | undefined {
  const fromQuery = req.query?.[key];
  if (typeof fromQuery === 'string') return fromQuery;
  if (Array.isArray(fromQuery)) return undefined;
  const url = new URL(req.url ?? '/', 'http://x');
  const values = url.searchParams.getAll(key);
  return values.length === 1 ? values[0] : undefined;
}

export function isValidLoopbackRedirectUri(raw: string | undefined): raw is string {
  if (typeof raw !== 'string') return false;
  const m = LOOPBACK_REDIRECT_RE.exec(raw);
  if (!m) return false;
  const port = Number(m[1]);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65535;
}

function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(challenge, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendRedirect(res: WidgetAuthRes, location: string): void {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function sendHtml(res: WidgetAuthRes, status: number, html: string, scriptHashToken: string): void {
  const currentCsp = typeof res.getHeader === 'function' ? res.getHeader('content-security-policy') : undefined;
  if (typeof currentCsp === 'string') {
    res.setHeader('Content-Security-Policy', appendScriptHashToCsp(currentCsp, scriptHashToken));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (typeof res.type === 'function' && typeof res.send === 'function') {
    res.status(status);
    res.type('html');
    res.send(html);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

async function handleAuthStart(req: WidgetAuthReq, res: WidgetAuthRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (rejectIfWidgetApiDisabled(res)) return;
  if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const redirectUri = queryParam(req, 'redirect_uri');
  const codeChallenge = queryParam(req, 'code_challenge');
  const codeChallengeMethod = queryParam(req, 'code_challenge_method');
  const state = queryParam(req, 'state');

  if (
    !isValidLoopbackRedirectUri(redirectUri) ||
    !codeChallenge || !CODE_CHALLENGE_RE.test(codeChallenge) ||
    !state || !STATE_RE.test(state) ||
    (codeChallengeMethod !== undefined && codeChallengeMethod !== 'S256')
  ) {
    res.status(400).json({ error: 'invalid-request' });
    return;
  }

  const { db } = database();
  const isPreview = process.env.DEPLOY_ENV === 'preview';
  const session = await sessionOf(req.headers);
  let candidateUid: string | null = session && session.email !== null ? session.id : null;
  if (isPreview && (!candidateUid || !(await isStaff(db, candidateUid)))) {
    const adminUid = await adminSessionUid(req.headers);
    if (adminUid) candidateUid = adminUid;
  }

  if (!candidateUid) {
    const { html, scriptHash: hash } = widgetAuthLoginHtml(isPreview);
    sendHtml(res, 200, html, hash);
    return;
  }

  const eligibility = await getWidgetUserEligibility(db, candidateUid);
  if (!eligibility || eligibility.isGuest || !eligibility.hasGoogle || (isPreview && !eligibility.isAdmin)) {
    sendRedirect(res, `${redirectUri}?error=unsupported-account&state=${encodeURIComponent(state)}`);
    return;
  }

  if (eligibility.restricted) {
    sendRedirect(res, `${redirectUri}?error=account-restricted&state=${encodeURIComponent(state)}`);
    return;
  }

  const now = new Date();
  if (await consentRequiredFor(db, { uid: eligibility.userId, guest: false }, consentPolicy(), now)) {
    sendRedirect(res, `${redirectUri}?error=consent-required&state=${encodeURIComponent(state)}`);
    return;
  }

  const rawCode = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + AUTH_CODE_TTL_MS).toISOString();
  await createWidgetAuthCode(db, {
    codeHash: sha256Hex(rawCode),
    userId: eligibility.userId,
    codeChallenge,
    redirectUri,
    expiresAt,
  });

  sendRedirect(res, `${redirectUri}?code=${encodeURIComponent(rawCode)}&state=${encodeURIComponent(state)}`);
}

async function handleAuthExchange(req: WidgetAuthReq, res: WidgetAuthRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (rejectIfWidgetApiDisabled(res)) return;
  if (req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const ver = validateWidgetClientVersion(req.headers);
  if (!ver.ok) {
    res.status(426).json({ error: 'version-mismatch', minVersion: ver.minVersion });
    return;
  }

  const body = (req.body !== null && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const rawVerifier = body.codeVerifier ?? body.code_verifier;
  const codeVerifier = typeof rawVerifier === 'string' ? rawVerifier.trim() : '';
  const rawRedirect = body.redirectUri ?? body.redirect_uri;
  const redirectUri = typeof rawRedirect === 'string' ? rawRedirect.trim() : '';

  if (
    !code || code.length > 512 ||
    !CODE_VERIFIER_RE.test(codeVerifier) ||
    !isValidLoopbackRedirectUri(redirectUri)
  ) {
    res.status(400).json({ error: 'invalid-request' });
    return;
  }

  const { db } = database();
  const now = new Date();
  const nowISO = now.toISOString();
  const codeRow = await consumeWidgetAuthCode(db, sha256Hex(code), nowISO);
  if (!codeRow || codeRow.redirectUri !== redirectUri || !verifyPkceS256(codeVerifier, codeRow.codeChallenge)) {
    res.status(401).json({ error: 'invalid-code' });
    return;
  }

  const eligibility = await getWidgetUserEligibility(db, codeRow.userId);
  if (
    !eligibility ||
    eligibility.isGuest ||
    !eligibility.hasGoogle ||
    (process.env.DEPLOY_ENV === 'preview' && !eligibility.isAdmin)
  ) {
    res.status(403).json({ error: 'unsupported-account' });
    return;
  }

  if (eligibility.restricted) {
    res.status(403).json({ error: 'account-restricted' });
    return;
  }

  if (await consentRequiredFor(db, { uid: eligibility.userId, guest: false }, consentPolicy(), now)) {
    res.status(403).json({ error: 'consent-required' });
    return;
  }

  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + WIDGET_TOKEN_TTL_MS).toISOString();
  await createWidgetToken(db, {
    tokenHash: sha256Hex(rawToken),
    userId: eligibility.userId,
    clientVersion: ver.version,
    expiresAt,
  });

  res.status(200).json({ token: rawToken, expiresAt });
}

async function handleAuthLogout(
  req: WidgetAuthReq,
  res: WidgetAuthRes,
  opts: WidgetLogoutOptions = {},
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (rejectIfWidgetApiDisabled(res)) return;
  if (req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const ver = validateWidgetClientVersion(req.headers);
  if (!ver.ok) {
    res.status(426).json({ error: 'version-mismatch', minVersion: ver.minVersion });
    return;
  }

  const token = parseBearerToken(req.headers);
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const uid = await deleteWidgetToken(database().db, sha256Hex(token));
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  disconnectWidgetUser(uid);
  opts.onUserDisconnect?.(uid);
  res.status(200).json({ ok: true });
}

async function runWithErrorBoundary(res: WidgetAuthRes, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code });
  }
}

/** GET /api/widget/auth/start 핸들러 */
export async function widgetAuthStartHandler(req: WidgetAuthReq, res: WidgetAuthRes): Promise<void> {
  await runWithErrorBoundary(res, () => handleAuthStart(req, res));
}

/** POST /api/widget/auth/exchange 핸들러 */
export async function widgetAuthExchangeHandler(req: WidgetAuthReq, res: WidgetAuthRes): Promise<void> {
  await runWithErrorBoundary(res, () => handleAuthExchange(req, res));
}

/** POST /api/widget/auth/logout 핸들러 생성기 */
export function createWidgetAuthLogoutHandler(opts: WidgetLogoutOptions = {}) {
  return async (req: WidgetAuthReq, res: WidgetAuthRes): Promise<void> => {
    await runWithErrorBoundary(res, () => handleAuthLogout(req, res, opts));
  };
}

/** POST /api/widget/auth/logout 기본 핸들러 */
export const widgetAuthLogoutHandler = createWidgetAuthLogoutHandler();

/** 경로에 따라 /api/widget/auth/(start|exchange|logout)을 분기 처리하는 통합 핸들러 */
export default async function handler(req: WidgetAuthReq, res: WidgetAuthRes): Promise<void> {
  const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '');
  if (path === '/api/widget/auth/start') {
    await widgetAuthStartHandler(req, res);
    return;
  }
  if (path === '/api/widget/auth/exchange') {
    await widgetAuthExchangeHandler(req, res);
    return;
  }
  if (path === '/api/widget/auth/logout') {
    await widgetAuthLogoutHandler(req, res);
    return;
  }
  res.status(404).json({ error: 'not-found' });
}
