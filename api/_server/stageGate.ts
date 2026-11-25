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

function gateHtml(status: 401 | 403): string {
  const title = status === 403 ? '접근 권한 없음 — 스테이징' : '스테이징 관리자 인증';
  const desc = status === 403
    ? '현재 로그인한 계정은 스테이징 접근 권한(관리자 명부)이 없습니다. 권한이 있는 Google 계정으로 다시 로그인해 주세요.'
    : '스테이징 환경은 관리자 Google 계정으로 로그인한 뒤 이용할 수 있습니다.';
  const buttonLabel = status === 403 ? '다른 Google 관리자 계정으로 로그인' : 'Google 관리자 계정으로 로그인';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
      background: #0d1624; color: #e6eef8;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    main {
      width: 100%; max-width: 400px; padding: 28px 24px; border-radius: 12px;
      background: #142236; border: 1px solid #29405e;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
    }
    h1 { margin: 0 0 12px; font-size: 1.15rem; font-weight: 700; }
    p { margin: 0 0 20px; font-size: 0.92rem; line-height: 1.55; color: #b7c8de; }
    button {
      width: 100%; padding: 12px 16px; border: 0; border-radius: 8px; cursor: pointer;
      font-size: 0.95rem; font-weight: 600; background: #3b82f6; color: #ffffff;
    }
    button:hover:not(:disabled) { background: #2563eb; }
    button:disabled { opacity: 0.6; cursor: wait; }
    [role="alert"] { margin: 12px 0 0; min-height: 1.2em; font-size: 0.85rem; color: #fca5a5; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${desc}</p>
    <button id="stage-login" type="button">${buttonLabel}</button>
    <p id="stage-error" role="alert"></p>
  </main>
  <script>
    (() => {
      const btn = document.getElementById('stage-login');
      const err = document.getElementById('stage-error');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        err.textContent = '';
        try {
          const res = await fetch('/api/admin/auth/sign-in/social', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'google',
              callbackURL: window.location.href,
              disableRedirect: true,
            }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || typeof data.url !== 'string') {
            err.textContent = '로그인 시작에 실패했습니다. 잠시 후 다시 시도해 주세요.';
            btn.disabled = false;
            return;
          }
          window.location.href = data.url;
        } catch {
          err.textContent = '네트워크 오류로 로그인을 시작할 수 없습니다.';
          btn.disabled = false;
        }
      });
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
