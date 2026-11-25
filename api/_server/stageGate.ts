// 스테이징 진입 전용 관리자 OAuth 게이트 — 배포 환경이 preview일 때만 게임 API·페이지·실시간 연결 앞단에서 관리자 세션을 검사한다.
import type { RequestHandler } from 'express';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { adminSessionUid } from '../_auth/session.js';
import { isAdmin } from '../_data/admin.js';
import { database } from '../_db/client.js';
import { toApiError } from '../errors.js';
import { reportServerIssue } from '../observability.js';

export type StageAdminCheckResult =
  | { ok: true; uid: string }
  | { ok: false; status: 401 | 403 };

export interface StageGateOptions {
  checkAdmin?: (headers: IncomingHttpHeaders) => Promise<StageAdminCheckResult>;
}

const isApiPath = (path: string): boolean => path === '/api' || path.startsWith('/api/');

/** 스테이징 게이트를 우회할 수 있는 경로인지 판정한다(헬스 핑, 관리자 인증·API·페이지, 정적 에셋·아이콘) */
export function isStageGateExempt(method: string, path: string): boolean {
  if ((method === 'GET' || method === 'HEAD') && path === '/api/action') return true;
  if (path === '/api/admin' || path.startsWith('/api/admin/')) return true;
  if (path === '/admin' || path.startsWith('/admin/') || path === '/admin.html') return true;
  if (path.startsWith('/assets/')) return true;
  if (path.startsWith('/favicon')) return true;
  if (path === '/apple-touch-icon.png') return true;
  return false;
}

/** 관리자 OAuth 세션 쿠키와 관리자 명부를 함께 검사한다 */
export async function verifyStageAdmin(headers: IncomingHttpHeaders): Promise<StageAdminCheckResult> {
  const uid = await adminSessionUid(headers);
  if (!uid) return { ok: false, status: 401 };
  const admin = await isAdmin(database().db, uid);
  if (!admin) return { ok: false, status: 403 };
  return { ok: true, uid };
}

/** 실시간 채널 업그레이드 시점의 스테이징 진입 게이트. 통과 또는 비프리뷰 환경이면 null을 돌려준다 */
export async function checkStageLiveUpgrade(
  req: IncomingMessage,
  checkAdmin: (headers: IncomingHttpHeaders) => Promise<StageAdminCheckResult> = verifyStageAdmin,
): Promise<401 | 403 | null> {
  if (process.env.DEPLOY_ENV !== 'preview') return null;
  const result = await checkAdmin(req.headers);
  return result.ok ? null : result.status;
}

const GOOGLE_LOGO_SVG = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" style="display:block;flex:none;margin-right:10px;">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
</svg>`;

/** 스테이징 진입 게이트 HTML을 생성한다 */
export function gateHtml(status: 401 | 403): string {
  const isDenied = status === 403;
  const badge = isDenied ? '접근 제한' : '관리자 인증';
  const title = isDenied ? '스테이징 접근 제한' : '스테이징 관리자 인증';
  const desc = isDenied
    ? '로그인한 계정이 관리자 명부에 없어 이용할 수 없어요.<br />로그아웃한 뒤 권한이 있는 계정으로 다시 로그인해 주세요.'
    : '프리뷰 환경은 관리자 구글 계정으로 로그인해야 이용할 수 있어요.<br />관리자 권한이 있는 구글 계정으로 로그인해 주세요.';
  const logoutButton = isDenied
    ? '\n      <button id="stage-logout" class="pf-btn-sec" type="button">로그아웃</button>'
    : '';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <title>${title}</title>
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
    .pf-actions {
      display: flex; flex-direction: column; gap: 8px; margin-top: 2px;
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
    .pf-btn-sec {
      display: inline-flex; align-items: center; justify-content: center;
      width: 100%; min-height: 44px; padding: 8px 16px;
      background: #1b3152; border: 1px solid #2b4568; border-radius: 0;
      color: #f2f7fb; font-family: inherit; font-size: 15px; font-weight: 600;
      cursor: pointer;
      box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.08), inset -1px -1px 0 rgba(0, 0, 0, 0.45);
    }
    .pf-btn-sec:hover:not(:disabled) { border-color: #4fc3f7; }
    .pf-btn-sec:active:not(:disabled) {
      box-shadow: inset -1px -1px 0 rgba(255, 255, 255, 0.08), inset 1px 1px 0 rgba(0, 0, 0, 0.45);
      transform: translateY(1px);
    }
    .pf-btn-sec:disabled { opacity: 0.4; cursor: default; }
    .pf-btn-sec:focus-visible { outline: 2px solid #4fc3f7; outline-offset: 1px; }
    [role="alert"] { margin: 0; font-size: 12px; line-height: 1.5; color: #ff8a80; }
    [role="alert"]:empty { display: none; }
  </style>
</head>
<body>
  <main class="pf-card">
    <span class="pf-badge">${badge}</span>
    <h1>${title}</h1>
    <p class="pf-desc">${desc}</p>
    <p id="stage-error" role="alert"></p>
    <div class="pf-actions">
      <button id="stage-login" class="google-btn" type="button">
        ${GOOGLE_LOGO_SVG}
        <span class="google-label">Google로 계속하기</span>
      </button>${logoutButton}
    </div>
  </main>
  <script>
    (() => {
      const btn = document.getElementById('stage-login');
      const logoutBtn = document.getElementById('stage-logout');
      const err = document.getElementById('stage-error');
      const current = new URL(window.location.href);
      const returnedError = current.searchParams.get('error');
      if (returnedError !== null) {
        current.searchParams.delete('error');
        current.searchParams.delete('error_description');
        window.history.replaceState(window.history.state, '', current.toString());
        err.textContent = returnedError === 'access_denied'
          ? '구글 로그인을 취소했어요. 계속하려면 다시 로그인해 주세요.'
          : '구글 인증에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
      }
      const cleanUrl = current.toString();

      const setBusy = (busy) => {
        if (btn) btn.disabled = busy;
        if (logoutBtn) logoutBtn.disabled = busy;
      };

      if (btn) {
        btn.addEventListener('click', async () => {
          setBusy(true);
          err.textContent = '';
          try {
            const res = await fetch('/api/admin/auth/sign-in/social', {
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
              setBusy(false);
              return;
            }
            const data = await res.json().catch(() => null);
            if (!res.ok || !data || typeof data.url !== 'string') {
              err.textContent = '구글 로그인을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
              setBusy(false);
              return;
            }
            window.location.assign(data.url);
          } catch {
            err.textContent = '네트워크에 연결하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
            setBusy(false);
          }
        });
      }

      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          setBusy(true);
          err.textContent = '';
          try {
            const res = await fetch('/api/admin/auth/sign-out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            });
            if (!res.ok) {
              err.textContent = '로그아웃하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
              setBusy(false);
              return;
            }
            window.location.reload();
          } catch {
            err.textContent = '네트워크에 연결하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
            setBusy(false);
          }
        });
      }
    })();
  </script>
</body>
</html>`;
}

/** 스테이징 진입 전용 관리자 OAuth 미들웨어 */
export function stageGate(options: StageGateOptions = {}): RequestHandler {
  const checkAdmin = options.checkAdmin ?? verifyStageAdmin;
  return (req, res, next) => {
    if (process.env.DEPLOY_ENV !== 'preview') {
      next();
      return;
    }
    const path = `${req.baseUrl}${req.path}`;
    if (isStageGateExempt(req.method, path)) {
      next();
      return;
    }
    checkAdmin(req.headers).then(result => {
      if (result.ok) {
        next();
        return;
      }
      if (isApiPath(path)) {
        res.status(result.status).json({ error: result.status === 401 ? 'unauthorized' : 'forbidden' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(result.status).type('html').send(gateHtml(result.status));
    }, async (e: unknown) => {
      const err = toApiError(e);
      if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
      if (isApiPath(path)) {
        res.status(err.status).json({ error: err.code });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(err.status).type('text').send(err.code);
    });
  };
}
