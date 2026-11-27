// 프리렌더·프리페치 요청 차단 — 브라우저 투기적 로딩이 세션을 발급하거나 액션을 실행하지 못하게 막는다.
import type { RequestHandler } from 'express';
import type { IncomingHttpHeaders } from 'node:http';

const PRERENDER_TOKENS = new Set(['prerender', 'prefetch']);

/** 프리렌더·프리페치 차단을 적용할 API 경로 접두사 목록 */
export const PRERENDER_BLOCKED_PATHS = ['/api/auth', '/api/action'] as const;

function hasPrerenderToken(raw: string | string[] | undefined): boolean {
  if (raw === undefined) return false;
  const values = Array.isArray(raw) ? raw : [raw];
  for (const entry of values) {
    for (const token of entry.split(/[;,\s]+/)) {
      if (PRERENDER_TOKENS.has(token.trim().toLowerCase())) return true;
    }
  }
  return false;
}

function isPrerenderBlockedPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return PRERENDER_BLOCKED_PATHS.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

/** 요청 헤더가 브라우저 프리렌더 또는 프리페치인지 판정한다 */
export function isPrerenderRequest(headers: IncomingHttpHeaders): boolean {
  return hasPrerenderToken(headers['sec-purpose']) || hasPrerenderToken(headers['purpose']);
}

/** 인증·액션 POST 경로로 들어온 프리렌더·프리페치 요청을 403으로 차단하는 미들웨어 */
export function blockPrerender(): RequestHandler {
  return (req, res, next) => {
    const path = `${req.baseUrl ?? ''}${req.path ?? ''}`;
    if (path && !isPrerenderBlockedPath(path)) {
      next();
      return;
    }
    if (req.method === 'POST' && isPrerenderRequest(req.headers)) {
      res.status(403).json({ error: 'prerender-blocked' });
      return;
    }
    next();
  };
}
