// 운영 서버 진입점 — 빌드한 SPA와 API 핸들러를 같은 오리진에서 서빙한다.
// 핸들러는 Node 스타일 (req, res) 계약을 그대로 쓰고, 이 파일은 경로 등록과 본문 파싱만 맡는다.
import express from 'express';
import type { Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { toNodeHandler } from 'better-auth/node';
import account from '../account.js';
import action from '../action.js';
import admin from '../admin.js';
import mail from '../mail.js';
import me from '../me.js';
import rank from '../rank.js';
import archive from '../cron/archive.js';
import purgeAnon from '../cron/purge-anon.js';
import { appAuth } from '../_auth/session.js';
import { settleAfterResponse } from './afterResponse.js';
import { applyKeepAlive } from './keepAlive.js';

type NodeHandler = (req: never, res: never) => Promise<void>;

const routes: Record<string, NodeHandler> = {
  '/api/account': account,
  '/api/action': action,
  '/api/admin': admin,
  '/api/mail': mail,
  '/api/me': me,
  '/api/rank': rank,
  '/api/cron/archive': archive,
  '/api/cron/purge-anon': purgeAnon,
};

const app = express();
app.disable('x-powered-by');
// 인증 경로는 본문을 직접 읽으므로 JSON 파서보다 먼저 등록한다. 필수 환경 변수가 없으면 기동하지 않는다.
app.all('/api/auth/*splat', toNodeHandler(appAuth()));
// import 액션은 게임 상태 전체를 싣는다.
app.use('/api', express.json({ limit: '5mb' }));
for (const [path, handler] of Object.entries(routes)) {
  app.all(path, (req: Request, res: Response) => handler(req as never, res as never));
}
app.use('/api', (_req, res) => { res.status(404).json({ error: 'not-found' }); });

const staticDir = fileURLToPath(new URL('../dist/', import.meta.url));
// 해시가 붙은 빌드 산출물만 오래 캐시한다. index.html은 매번 검증해 새 배포를 바로 받는다.
app.use('/assets', express.static(`${staticDir}assets`, { immutable: true, maxAge: '1y' }));
app.use(express.static(staticDir));

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => { console.info(`Server listening on port ${port}`); });
applyKeepAlive(server);

process.on('SIGTERM', () => {
  server.close(() => {
    void settleAfterResponse().then(() => process.exit(0));
  });
});
