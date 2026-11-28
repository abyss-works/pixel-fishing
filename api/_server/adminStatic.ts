import { join } from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { notFound } from './notFound.js';

export function createAdminStaticRouter(staticDir: string): express.Router {
  const router = express.Router();
  const adminDir = join(staticDir, 'admin');

  router.get('/admin', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/admin') {
      res.redirect(301, '/admin/');
      return;
    }
    next();
  });
  router.use('/admin/assets', express.static(join(adminDir, 'assets'), { immutable: true, maxAge: '1y' }));
  router.use('/admin/assets', notFound);
  router.use('/admin', express.static(adminDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  router.get(['/admin/', '/admin/*splat'], (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(adminDir, 'index.html'));
  });

  return router;
}
