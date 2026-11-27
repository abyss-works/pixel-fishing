// 등록되지 않은 경로의 마지막 응답. Express 기본 "Cannot GET" 본문 대신 /api는 API 오류 형식, 그 밖은 정돈된 HTML을 낸다.
import type { Request, Response } from 'express';
import { notFoundHtml } from './errorPages.js';

export function notFound(req: Request, res: Response): void {
  // '/api'에 붙여 등록하면 Express가 req.path에서 마운트 경로를 떼므로 baseUrl을 합쳐 판정한다
  const path = `${req.baseUrl}${req.path}`;
  if (path === '/api' || path.startsWith('/api/')) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).type('html').send(notFoundHtml());
}
