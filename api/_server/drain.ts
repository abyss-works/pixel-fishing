// 종료 드레인 가드 — SIGTERM 수신 즉시 읽기 프로브를 503으로 전환해 인그레스가 새 요청을 다른 파드로 넘기게 한다.
import type { RequestHandler } from 'express';

export interface DrainGuard {
  middleware: RequestHandler;
  start: () => void;
  isDraining: () => boolean;
}

/** 종료 드레인 상태와 프로브 차단 미들웨어를 만든다 */
export function createDrainGuard(): DrainGuard {
  let draining = false;

  const middleware: RequestHandler = (req, res, next) => {
    if (!draining) {
      next();
      return;
    }
    const path = `${req.baseUrl}${req.path}`;
    if ((req.method === 'GET' || req.method === 'HEAD') && path === '/api/action') {
      res.status(503).json({ error: 'server-draining' });
      return;
    }
    next();
  };

  return {
    middleware,
    start: () => { draining = true; },
    isDraining: () => draining,
  };
}
