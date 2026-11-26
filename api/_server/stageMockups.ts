// 스테이징 전용 시안 HTML 정적 서빙 라우터 — preview 환경과 MOCKUPS_DIR 설정이 있을 때만 활성화된다.
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import type { RequestHandler, Response } from 'express';

const MOCKUP_FILE_RE = /^[a-zA-Z0-9._-]+\.html$/;

/** 시안 HTML 응답에만 적용하는 완화된 라우트 전용 CSP(인라인 스크립트·스타일 허용, 자체 폰트만 허용) */
export const MOCKUPS_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'";

export interface StageMockupsOptions {
  /** 테스트 등에서 환경 변수 대신 디렉터리 경로를 직접 지정할 때 쓴다 */
  dir?: string;
}

interface MockupEntry {
  name: string;
  mtimeMs: number;
  size: number;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isErrno(err: unknown, ...codes: string[]): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && codes.includes(String((err as { code?: unknown }).code));
}

function applyMockupHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', MOCKUPS_CSP);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatMtime(mtimeMs: number): string {
  return new Date(mtimeMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function renderIndexHtml(entries: readonly MockupEntry[]): string {
  const listHtml = entries.length === 0
    ? '<p class="pf-empty">등록된 시안 HTML 파일이 없어요.</p>'
    : `<ul class="pf-list">\n${entries.map(entry => {
      const safeName = escapeHtml(entry.name);
      const href = `/_mockups/${encodeURIComponent(entry.name)}`;
      return `        <li>
          <a class="pf-item" href="${href}">
            <span class="pf-name">${safeName}</span>
            <span class="pf-meta">${escapeHtml(formatMtime(entry.mtimeMs))} / ${escapeHtml(formatSize(entry.size))}</span>
          </a>
        </li>`;
    }).join('\n')}\n      </ul>`;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>스테이징 시안 목록</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; padding: 24px 16px;
      background: #0a1526; color: #f2f7fb;
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif;
      font-size: 14px; line-height: 1.5;
    }
    .pf-wrap {
      max-width: 720px; margin: 0 auto; padding: 20px;
      background: #14243d; border: 1px solid #2b4568;
      box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.08), inset -1px -1px 0 rgba(0, 0, 0, 0.45);
    }
    .pf-badge {
      display: inline-block; padding: 3px 8px; margin-bottom: 10px;
      background: #0f1c31; border: 1px solid #2b4568;
      color: #93a8c4; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
    }
    h1 { margin: 0 0 6px; font-size: 18px; color: #ffd54f; }
    .pf-sub { margin: 0 0 16px; font-size: 12px; color: #93a8c4; }
    .pf-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .pf-item {
      display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px;
      padding: 10px 12px; text-decoration: none;
      background: #0f1c31; border: 1px solid #2b4568; color: #f2f7fb;
    }
    .pf-item:hover { border-color: #4fc3f7; background: #182b49; }
    .pf-name { font-weight: 600; color: #f2f7fb; word-break: break-all; }
    .pf-meta { font-size: 12px; color: #93a8c4; }
    .pf-empty {
      margin: 0; padding: 16px;
      background: #0f1c31; border: 1px dashed #2b4568; color: #93a8c4; text-align: center;
    }
  </style>
</head>
<body>
  <main class="pf-wrap">
    <span class="pf-badge">PREVIEW MOCKUPS</span>
    <h1>스테이징 시안 목록</h1>
    <p class="pf-sub">최신 수정 시각 순으로 표시돼요.</p>
    ${listHtml}
  </main>
</body>
</html>`;
}

async function listMockups(dir: string): Promise<MockupEntry[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return [];
    throw err;
  }

  const entries: MockupEntry[] = [];
  for (const name of names) {
    if (!MOCKUP_FILE_RE.test(name)) continue;
    try {
      const st = await lstat(path.join(dir, name));
      if (!st.isFile()) continue;
      entries.push({ name, mtimeMs: st.mtimeMs, size: st.size });
    } catch (err) {
      if (isErrno(err, 'ENOENT')) continue;
      throw err;
    }
  }

  entries.sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
    if (a.name === b.name) return 0;
    return b.name > a.name ? 1 : -1;
  });
  return entries;
}

/** 스테이징 환경에서 시안 디렉터리의 HTML 목록과 파일을 서빙하는 Express 미들웨어를 생성한다 */
export function stageMockups(options: StageMockupsOptions = {}): RequestHandler {
  const router = Router();

  router.use((_req, res, next) => {
    if (process.env.DEPLOY_ENV !== 'preview') {
      next('router');
      return;
    }
    const dir = options.dir ?? process.env.MOCKUPS_DIR;
    if (!dir) {
      next('router');
      return;
    }
    res.locals.mockupsDir = dir;
    next();
  });

  router.get(['/_mockups', '/_mockups/'], async (_req, res, next) => {
    try {
      const dir = String(res.locals.mockupsDir);
      const entries = await listMockups(dir);
      applyMockupHeaders(res);
      res.status(200).send(renderIndexHtml(entries));
    } catch (err) {
      next(err);
    }
  });

  router.get('/_mockups/:file', async (req, res, next) => {
    const file = req.params.file;
    if (typeof file !== 'string' || file !== path.basename(file) || !MOCKUP_FILE_RE.test(file)) {
      res.status(400).type('text').send('bad-request');
      return;
    }

    try {
      const dir = String(res.locals.mockupsDir);
      let resolvedDir: string;
      let resolvedFile: string;
      try {
        resolvedDir = await realpath(dir);
        resolvedFile = await realpath(path.join(resolvedDir, file));
      } catch (err) {
        if (isErrno(err, 'ENOENT', 'ENOTDIR')) {
          res.status(404).type('text').send('not-found');
          return;
        }
        throw err;
      }

      const dirPrefix = resolvedDir.endsWith(path.sep) ? resolvedDir : `${resolvedDir}${path.sep}`;
      if (!resolvedFile.startsWith(dirPrefix)) {
        res.status(404).type('text').send('not-found');
        return;
      }

      let content: Buffer;
      try {
        const st = await stat(resolvedFile);
        if (!st.isFile()) {
          res.status(404).type('text').send('not-found');
          return;
        }
        content = await readFile(resolvedFile);
      } catch (err) {
        if (isErrno(err, 'ENOENT', 'ENOTDIR', 'EISDIR')) {
          res.status(404).type('text').send('not-found');
          return;
        }
        throw err;
      }

      applyMockupHeaders(res);
      res.status(200).send(content);
    } catch (err) {
      next(err);
    }
  });

  router.get('/_mockups/*splat', (_req, res) => {
    res.status(400).type('text').send('bad-request');
  });

  return router;
}
