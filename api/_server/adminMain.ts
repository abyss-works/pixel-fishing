// 독립 관리자 서버 진입점 — 관리자 SPA 정적 번들과 관리자 인증·API 경로를 함께 서빙한다.
// Valkey 버스를 통해 게임·실시간 파드의 프레즌스·지표를 조회하고 위젯 강제 종료 이벤트를 전파한다.
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import admin from '../admin.js';
import { adminAuth } from '../_auth/session.js';
import { flushHttpMetrics } from '../_data/httpMetrics.js';
import { database } from '../_db/client.js';
import { reportServerIssue } from '../observability.js';
import { provideWidgetDisconnect } from '../widget/guard.js';
import { settleAfterResponse } from './afterResponse.js';
import { createDrainGuard } from './drain.js';
import { createHttpMetrics } from './httpMetrics.js';
import { applyKeepAlive } from './keepAlive.js';
import {
  provideBroadcastCatchFx,
  provideIsUserOnline,
  provideNotify,
  provideNotifyAll,
  provideNotifyGuild,
  provideOnline,
  providePresence,
  provideSetFame,
  provideSetNick,
} from './livePresence.js';
import { notFound } from './notFound.js';
import {
  aggregatePodMetrics,
  provideRecentHttpSummary,
  provideRecentPool,
  provideRecentRuntime,
  provideRecentWsSnapshot,
  provideSlowRequests,
} from './opsRuntime.js';
import { createLiveBus } from './redisBus.js';
import { securityHeaders } from './securityHeaders.js';

type NodeHandler = (req: never, res: never) => Promise<void>;

const staticDir = fileURLToPath(new URL('../dist-admin/', import.meta.url));
const origin = new URL(process.env.BETTER_AUTH_URL as string).origin;
const bus = createLiveBus();
const drain = createDrainGuard();

providePresence(uid => bus.presenceOf(uid));
provideIsUserOnline(uid => bus.isUserOnline(uid));
provideOnline(async () => {
  const [entries, presences] = await Promise.all([bus.listOnline(), bus.listPresence()]);
  const presenceByUid = new Map(presences.map(p => [p.uid, p]));
  return entries.map(entry => {
    const p = presenceByUid.get(entry.uid);
    return {
      uid: entry.uid,
      nick: p?.nick ?? '낚시꾼',
      region: p?.region ?? null,
      zone: p?.zone ?? null,
      connectedAt: new Date(entry.updatedAtMs).toISOString(),
      guest: entry.guest,
    };
  });
});
provideNotify((uid, msg) => { void bus.notifyUser(uid, msg); });
provideNotifyGuild((guildId, msg) => { void bus.notifyGuild(guildId, msg); });
provideNotifyAll(msg => { void bus.notifyAll(msg); });
provideSetNick((uid, nick) => { void bus.setNick(uid, nick); });
provideSetFame((uid, fame) => { void bus.setFame(uid, fame); });
provideBroadcastCatchFx((uid, payload) => { void bus.broadcastCatchFx(uid, payload); });
provideSlowRequests(async () => aggregatePodMetrics(await bus.listPodMetrics()).slowRequests);
provideRecentHttpSummary(async () => aggregatePodMetrics(await bus.listPodMetrics()).http);
provideRecentWsSnapshot(async () => aggregatePodMetrics(await bus.listPodMetrics()).ws);
provideRecentRuntime(async () => aggregatePodMetrics(await bus.listPodMetrics()).runtime);
provideRecentPool(async () => aggregatePodMetrics(await bus.listPodMetrics()).pool);
provideWidgetDisconnect(uid => { void bus.disconnectWidget(uid); });

const httpMetrics = createHttpMetrics({
  persist: rows => flushHttpMetrics(database().db, rows),
  onError: e => { void reportServerIssue('관리자 HTTP 지표 기록 실패', e); },
});

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders({ origin, sentryDsn: [process.env.SENTRY_DSN, process.env.VITE_SENTRY_DSN] }));
app.get('/healthz', (_req: Request, res: Response) => {
  if (drain.isDraining()) {
    res.status(503).json({ ok: false, error: 'server-draining' });
    return;
  }
  res.status(200).json({ ok: true });
});
app.use(httpMetrics.middleware);
app.use(drain.middleware);

// 관리자 인증은 구글 로그인(시작과 콜백)과 로그아웃만 연다.
app.post(['/api/admin/auth/sign-in/social', '/api/admin/auth/sign-out'], toNodeHandler(adminAuth()));
app.get('/api/admin/auth/callback/google', toNodeHandler(adminAuth()));

app.use('/api/admin', express.json({ limit: '5mb' }));
const adminHandler = admin as NodeHandler;
for (const path of [
  '/api/admin',
  '/api/admin/live',
  '/api/admin/stats/daily',
  '/api/admin/retention',
  '/api/admin/sessions',
]) {
  app.all(path, (req: Request, res: Response) => adminHandler(req as never, res as never));
}
app.use('/api', notFound);

app.get('/admin', (_req: Request, res: Response) => {
  res.redirect(301, '/admin/');
});
app.use('/admin/assets', express.static(`${staticDir}admin/assets`, { immutable: true, maxAge: '1y' }));
app.use('/admin/assets', notFound);
app.use('/admin', express.static(`${staticDir}admin`, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.get(['/admin/', '/admin/*splat'], (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(`${staticDir}admin/index.html`);
});
app.use(notFound);

const port = Number(process.env.PORT ?? 8080);
const server = app.listen(port, () => {
  console.info(`Admin server listening on port ${port}`);
});
applyKeepAlive(server);

process.on('unhandledRejection', err => { void reportServerIssue('unhandledRejection', err); });
process.on('uncaughtExceptionMonitor', err => { void reportServerIssue('uncaughtException', err); });

let shuttingDown = false;
const shutdown = (): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  drain.start();
  server.close(() => {
    void settleAfterResponse()
      .then(() => Promise.all([
        httpMetrics.stop(),
        bus.close().catch(() => {}),
        database().pool.end().catch(() => {}),
      ]))
      .finally(() => process.exit(0));
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
