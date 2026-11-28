// 전용 실시간(WebSocket) 서버 진입점 — /api/live 업그레이드와 /healthz 프로브만 처리한다.
// 다중 파드 환경에서 RedisLiveBus와 공유 레이트리미터를 통해 파드 간 상태와 이벤트를 중계한다.
import { randomUUID } from 'node:crypto';
import express from 'express';
import { CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS, GLOBAL_CHAT_COOLDOWN_MS } from '../../src/game/rules/live.js';
import { sessionOf } from '../_auth/session.js';
import { recordSession } from '../_data/activity.js';
import { blockedIds } from '../_data/blocks.js';
import { recentChat, recentGuildChat, recentLocalChat, saveChat } from '../_data/chat.js';
import { guildIdOf } from '../_data/guilds.js';
import { listLiveNotices } from '../_data/notices.js';
import { saveLastPosition } from '../_data/position.js';
import { liveIdentity } from '../_data/profile.js';
import { flushWsMetrics } from '../_data/wsMetrics.js';
import { database } from '../_db/client.js';
import { reportServerIssue } from '../observability.js';
import { afterResponse, settleAfterResponse } from './afterResponse.js';
import { staleClient } from './clientBuild.js';
import { liveConsentAdmit } from './consentGate.js';
import { createDrainGuard } from './drain.js';
import { applyKeepAlive } from './keepAlive.js';
import { attachLive } from './live.js';
import { createOpsAlertDispatcher, evaluateOpsAlerts } from './opsAlerts.js';
import { createSharedCooldown, createSharedSlidingRateLimiter } from './rateLimit.js';
import { createLiveBus } from './redisBus.js';
import { checkStageLiveUpgrade } from './stageGate.js';
import { createWsMetrics } from './wsMetrics.js';

const origin = new URL(process.env.BETTER_AUTH_URL as string).origin;
const podId = process.env.POD_NAME?.trim() || randomUUID();

const bus = createLiveBus();
const drain = createDrainGuard();
const wsMetrics = createWsMetrics({
  persist: rows => flushWsMetrics(database().db, rows),
  onError: e => { void reportServerIssue('WS 지표 기록 실패', e); },
});

const opsAlertDispatcher = createOpsAlertDispatcher({
  reportIssue: reportServerIssue,
  webhookUrl: process.env.OPS_ALERT_WEBHOOK_URL,
  acquireLock: (key, ttlSec) => bus.acquireAlertLock(key, ttlSec),
});

const chatLimiter = createSharedSlidingRateLimiter({
  prefix: 'ws-chat',
  windowMs: CHAT_RATE_WINDOW_MS,
  max: CHAT_RATE_MAX,
});
const globalCooldownLimiter = createSharedCooldown({
  prefix: 'ws-global-cd',
  cooldownMs: GLOBAL_CHAT_COOLDOWN_MS,
});

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_req, res) => {
  if (drain.isDraining()) {
    res.status(503).json({ ok: false, error: 'server-draining' });
    return;
  }
  res.status(200).json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.info(`Realtime server listening on port ${port} (pod=${podId})`);
});
applyKeepAlive(server);

const live = attachLive(server, {
  origin,
  stale: staleClient,
  gate: checkStageLiveUpgrade,
  admit: liveConsentAdmit,
  bus,
  podId,
  chatLimiter,
  globalCooldownLimiter,
  authenticate: async (req) => {
    const session = await sessionOf(req.headers);
    if (!session) return null;
    const { nick, boat, fame, staff } = await liveIdentity(database().db, session.id);
    return { uid: session.id, nick: nick ?? '낚시꾼', boat, fame, guest: session.email === null, staff: Boolean(staff) };
  },
  chat: {
    save: (user, text, guild, room, region) => saveChat(database().db, {
      uid: user.uid, nick: user.nick, text, room, region, guildId: guild,
    }),
    recent: (uid, limit, guild) => (
      guild === null
        ? recentChat(database().db, uid, limit)
        : recentGuildChat(database().db, guild, uid, limit)
    ),
    recentLocal: (uid, region, limit) => recentLocalChat(database().db, region, uid, limit),
    blocked: (uid) => blockedIds(database().db, uid),
    guildOf: (uid) => guildIdOf(database().db, uid),
  },
  activeNotices: () => listLiveNotices(database().db),
  recordSession: (uid, startedAt, endedAt) => {
    afterResponse(recordSession(database().db, uid, startedAt, endedAt).catch(e =>
      reportServerIssue('접속 세션 기록 실패', e, { uid, startedAt, endedAt })));
  },
  savePosition: (uid, pos) => {
    afterResponse(saveLastPosition(database().db, uid, pos).catch(e =>
      reportServerIssue('마지막 위치 기록 실패', e, { uid, region: pos.region })));
  },
  metrics: {
    onUpgradeOk: () => wsMetrics.onUpgradeOk(),
    onReject: status => wsMetrics.onReject(status),
    onClose: kind => wsMetrics.onClose(kind),
  },
  onError: (label, err) => { void reportServerIssue(label, err); },
});

const podMetricsTimer = setInterval(() => {
  const snapshot = wsMetrics.recentSnapshot();
  const onlineList = live.online();
  void bus.publishPodMetrics(podId, {
    podId,
    updatedAt: new Date().toISOString(),
    connections: onlineList.length,
    onlineUsers: onlineList.filter(entry => !entry.guest).length,
    ws: snapshot,
  });
}, 15_000);
podMetricsTimer.unref();

const opsAlertTimer = setInterval(() => {
  try {
    const ws = wsMetrics.recentSnapshot();
    const { pool } = database();
    const alerts = evaluateOpsAlerts({
      http: { total: 0, status5xx: 0, p95Ms: null, samples: 0 },
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: pool.options.max ?? 10,
      },
      ws,
    });
    if (alerts.length > 0) void opsAlertDispatcher.dispatch(alerts);
  } catch {
    /* 주기 경보 평가 실패는 서버 루프를 중단하지 않는다 */
  }
}, 30_000);
opsAlertTimer.unref();

process.on('unhandledRejection', err => { void reportServerIssue('unhandledRejection', err); });
process.on('uncaughtExceptionMonitor', err => { void reportServerIssue('uncaughtException', err); });

process.on('SIGTERM', () => {
  drain.start();
  clearInterval(podMetricsTimer);
  clearInterval(opsAlertTimer);
  live.close();
  const busClose = bus.removePodMetrics(podId).catch(() => {})
    .then(() => bus.close().catch(() => {}));
  server.close(() => {
    void settleAfterResponse()
      .then(() => Promise.all([wsMetrics.stop(), busClose]))
      .finally(() => process.exit(0));
  });
});
