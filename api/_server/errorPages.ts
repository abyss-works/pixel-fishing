// 자립형 오류 안내 HTML 생성기 — 404와 503 안내 화면을 게임 테마 토큰과 인라인 자산만으로 만든다.
import { createHash } from 'node:crypto';

const RETRY_SCRIPT = `
    (() => {
      const countdownEl = document.getElementById('countdown');
      const statusEl = document.getElementById('retry-status');
      const retryBtn = document.getElementById('retry-btn');
      let remaining = 5;
      let checking = false;
      let timerId = null;

      const updateCountdown = () => {
        if (countdownEl) countdownEl.textContent = String(remaining);
      };

      const schedule = () => {
        if (timerId !== null) clearTimeout(timerId);
        timerId = setTimeout(tick, 1000);
      };

      const check = async () => {
        if (checking) return;
        checking = true;
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        if (retryBtn) retryBtn.disabled = true;
        if (statusEl) {
          statusEl.textContent = '연결 상태를 확인하고 있어요.';
          statusEl.dataset.state = 'checking';
        }
        try {
          const res = await fetch('/api/action', { method: 'GET', cache: 'no-store' });
          if (res.status === 204 || res.ok) {
            window.location.reload();
            return;
          }
        } catch {
          /* 네트워크 오류는 아래 실패 안내로 처리한다 */
        }
        checking = false;
        if (retryBtn) retryBtn.disabled = false;
        if (statusEl) {
          statusEl.textContent = '아직 연결되지 않아 조금 뒤에 다시 확인해 주세요.';
          statusEl.dataset.state = 'error';
        }
        remaining = 5;
        updateCountdown();
        schedule();
      };

      const tick = () => {
        if (checking) return;
        remaining -= 1;
        if (remaining <= 0) {
          remaining = 0;
          updateCountdown();
          void check();
          return;
        }
        updateCountdown();
        schedule();
      };

      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          void check();
        });
      }

      updateCountdown();
      schedule();
    })();
  `;

/** 503 안내 HTML의 인라인 스크립트에만 제한 허용하는 CSP SHA-256 해시 토큰 */
export const ERROR_503_SCRIPT_CSP_HASH = `'sha256-${createHash('sha256').update(RETRY_SCRIPT, 'utf8').digest('base64')}'`;

const BASE_CSS = `
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
    .pf-head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .pf-badge {
      display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px;
      background: #0f1c31; border: 1px solid #2b4568; border-radius: 0;
      color: #93a8c4; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
    }
    h1 {
      margin: 0; font-size: 17px; font-weight: 700; letter-spacing: 0.5px; color: #ffd54f;
    }
    .pf-desc {
      margin: 0; font-size: 12px; line-height: 1.625; color: #93a8c4;
    }
    .pf-notice {
      margin: 0; padding: 8px 10px;
      background: #0f1c31; border: 1px solid #2b4568;
      font-size: 12px; line-height: 1.5; color: #f2f7fb;
    }
    .pf-notice strong { color: #ffd54f; }
    .pf-status {
      margin: 0; min-height: 18px; font-size: 12px; line-height: 1.5; color: #4fc3f7;
    }
    .pf-status:empty { display: none; }
    .pf-status[data-state="error"] { color: #ff8a80; }
    .pf-actions {
      display: flex; flex-direction: column; gap: 8px; margin-top: 2px;
    }
    .pf-btn-pri, .pf-btn-sec {
      display: inline-flex; align-items: center; justify-content: center;
      width: 100%; min-height: 44px; padding: 8px 16px;
      border: 1px solid #2b4568; border-radius: 0;
      font-family: inherit; font-size: 14px; font-weight: 700; text-decoration: none;
      cursor: pointer;
      clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
      box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.08), inset -1px -1px 0 rgba(0, 0, 0, 0.45);
    }
    .pf-btn-pri {
      background: #1d3252; border-color: #4fc3f7; color: #f2f7fb;
    }
    .pf-btn-pri:hover:not(:disabled) { border-color: #ffd54f; color: #ffd54f; }
    .pf-btn-sec {
      background: #0f1c31; color: #93a8c4; font-weight: 600;
    }
    .pf-btn-sec:hover:not(:disabled) { border-color: #4fc3f7; color: #f2f7fb; }
    .pf-btn-pri:active:not(:disabled), .pf-btn-sec:active:not(:disabled) {
      box-shadow: inset -1px -1px 0 rgba(255, 255, 255, 0.08), inset 1px 1px 0 rgba(0, 0, 0, 0.45);
      transform: translateY(1px);
    }
    .pf-btn-pri:disabled, .pf-btn-sec:disabled { opacity: 0.45; cursor: default; }
    .pf-btn-pri:focus-visible, .pf-btn-sec:focus-visible { outline: 2px solid #4fc3f7; outline-offset: 1px; }
    .pf-foot {
      display: flex; justify-content: flex-end; margin-top: 2px;
      font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #93a8c4; opacity: 0.7;
    }
`;

const PIXEL_ICON_404 = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" shape-rendering="crispEdges">
  <rect x="4" y="1" width="4" height="2" fill="#ffd54f" />
  <rect x="2" y="3" width="2" height="2" fill="#ffd54f" />
  <rect x="8" y="3" width="2" height="2" fill="#ffd54f" />
  <rect x="6" y="5" width="2" height="2" fill="#ffd54f" />
  <rect x="5" y="7" width="2" height="1" fill="#4fc3f7" />
  <rect x="5" y="9" width="2" height="2" fill="#4fc3f7" />
</svg>`;

const PIXEL_ICON_503 = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" shape-rendering="crispEdges">
  <rect x="5" y="1" width="2" height="2" fill="#ffd54f" />
  <rect x="3" y="3" width="6" height="2" fill="#ffd54f" />
  <rect x="4" y="5" width="4" height="3" fill="#ff8a80" />
  <rect x="1" y="9" width="3" height="2" fill="#4fc3f7" />
  <rect x="5" y="9" width="2" height="2" fill="#4fc3f7" />
  <rect x="8" y="9" width="3" height="2" fill="#4fc3f7" />
</svg>`;

interface ErrorPageSpec {
  title: string;
  badge: string;
  iconSvg: string;
  descriptionHtml: string;
  extraHtml: string;
  actionsHtml: string;
  codeText: string;
  scriptText?: string;
}

function renderErrorPage(spec: ErrorPageSpec): string {
  const scriptTag = spec.scriptText ? `\n  <script>${spec.scriptText}</script>` : '';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${spec.title}</title>
  <style>${BASE_CSS}  </style>
</head>
<body>
  <main class="pf-card">
    <div class="pf-head">
      <span class="pf-badge">${spec.iconSvg}<span>${spec.badge}</span></span>
    </div>
    <h1>${spec.title}</h1>
    <p class="pf-desc">${spec.descriptionHtml}</p>${spec.extraHtml}
    <div class="pf-actions">
      ${spec.actionsHtml}
    </div>
    <div class="pf-foot" aria-hidden="true">${spec.codeText}</div>
  </main>${scriptTag}
</body>
</html>`;
}

/** 404 찾을 수 없는 페이지 자립형 HTML을 생성한다 */
export function notFoundHtml(): string {
  return renderErrorPage({
    title: '찾을 수 없는 페이지',
    badge: '없는 주소',
    iconSvg: PIXEL_ICON_404,
    descriptionHtml: '주소가 바뀌었거나 지금은 없는 페이지예요.<br />주소를 다시 확인하거나 처음 화면으로 돌아가 보세요.',
    extraHtml: '',
    actionsHtml: '<a class="pf-btn-pri" href="/">처음 화면으로 돌아가기</a>',
    codeText: '404',
  });
}

/** 503 일시 점검 및 연결 대기 자립형 HTML을 생성한다 */
export function serviceUnavailableHtml(): string {
  return renderErrorPage({
    title: '잠시 게임 점검 중',
    badge: '연결 대기',
    iconSvg: PIXEL_ICON_503,
    descriptionHtml: '정비 중이거나 일시적으로 연결이 멈춰 있어요.<br />준비가 끝나는 대로 저장된 진행에서 바로 이어져요.',
    extraHtml: '\n    <p class="pf-notice"><span id="countdown">5</span>초 뒤에 자동으로 다시 확인해요.</p>\n    <p id="retry-status" class="pf-status" role="status"></p>',
    actionsHtml: '<button id="retry-btn" class="pf-btn-pri" type="button">다시 연결하기</button>\n      <a class="pf-btn-sec" href="/">처음 화면으로</a>',
    codeText: '503',
    scriptText: RETRY_SCRIPT,
  });
}
