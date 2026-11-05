// 운영 서버 진입점 — 빌드한 SPA와 API 핸들러를 같은 오리진에서 서빙한다.
// 핸들러는 Node 스타일 (req, res) 계약을 그대로 쓰고, 이 파일은 경로 등록과 본문 파싱만 맡는다.
import express from 'express';
import type { Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { toNodeHandler } from 'better-auth/node';
import account from '../account.js';
import action from '../action.js';
import admin from '../admin.js';
import awayReport from '../awayReport.js';
import { blocksHandler, chatReportHandler } from '../chat.js';
import mail from '../mail.js';
import friends from '../friends.js';
import { guildRoutes } from '../guilds.js';
import me from '../me.js';
import players from '../players.js';
import position from '../position.js';
import { guildInviteRoutes, readIndexHtml } from '../guildInvites.js';
import { defaultMeta, withMeta } from './ogMeta.js';
import rank from '../rank.js';
import archive from '../cron/archive.js';
import purgeAnon from '../cron/purge-anon.js';
import { adminAuth, appAuth, sessionOf } from '../_auth/session.js';
import { afterResponse, settleAfterResponse } from './afterResponse.js';
import { attachLive } from './live.js';
import { provideNotify, provideOnline, providePresence } from './livePresence.js';
import { database } from '../_db/client.js';
import { liveIdentity } from '../_data/profile.js';
import { blockedIds } from '../_data/blocks.js';
import { recentChat, saveChat } from '../_data/chat.js';
import { guildIdOf } from '../_data/guilds.js';
import { recordSession } from '../_data/activity.js';
import { saveLastPosition } from '../_data/position.js';
import { reportServerIssue } from '../observability.js';
import { applyKeepAlive } from './keepAlive.js';

type NodeHandler = (req: never, res: never) => Promise<void>;

const staticDir = fileURLToPath(new URL('../dist/', import.meta.url));
const origin = new URL(process.env.BETTER_AUTH_URL as string).origin;
// 초대 링크와 그 미리보기 API는 로그인 없이 열린다
const invites = guildInviteRoutes(origin, readIndexHtml(staticDir));

// 차단 목록이 바뀌면 실시간 채널의 채팅 거르기를 갱신한다(허브는 아래에서 서버를 띄운 뒤 붙는다)
const blocks = blocksHandler((uid, ids) => live.setBlocked(uid, ids));
// 소속 길드가 바뀌면 실시간 채널의 길드 채팅 방을 바꾼다
const guilds = guildRoutes((uid, guild) => live.setGuild(uid, guild));

const routes: Record<string, NodeHandler> = {
  '/api/account': account,
  '/api/action': action,
  '/api/admin': admin,
  '/api/admin/live': admin,
  '/api/admin/stats/daily': admin,
  '/api/admin/retention': admin,
  '/api/admin/sessions': admin,
  '/api/away-report': awayReport,
  // 차단 목록이 바뀌면 실시간 채널이 그 사용자에게 보내는 채팅을 바로 다시 거른다
  '/api/blocks': blocks,
  '/api/blocks/:uid': blocks,
  '/api/chat/messages/:id/reports': chatReportHandler,
  '/api/mail': mail,
  '/api/friends': friends,
  '/api/friends/:uid': friends,
  ...guilds,
  '/api/guild-invites/:code': invites.api,
  '/api/me': me,
  '/api/me/position': position,
  '/api/players': players,
  '/api/players/:uid': players,
  '/api/rank': rank,
  '/api/cron/archive': archive,
  '/api/cron/purge-anon': purgeAnon,
};

const app = express();
app.disable('x-powered-by');
// 인증 경로는 본문을 직접 읽으므로 JSON 파서보다 먼저 등록한다. 필수 환경 변수가 없으면 기동하지 않는다.
app.all('/api/auth/*splat', toNodeHandler(appAuth()));
// 관리자 인증은 로그인과 로그아웃만 연다. 나머지 경로는 아래의 404로 간다.
app.post(['/api/admin/auth/sign-in/email', '/api/admin/auth/sign-out'], toNodeHandler(adminAuth()));
// import 액션은 게임 상태 전체를 싣는다.
app.use('/api', express.json({ limit: '5mb' }));
for (const [path, handler] of Object.entries(routes)) {
  app.all(path, (req: Request, res: Response) => handler(req as never, res as never));
}
app.use('/api', (_req, res) => { res.status(404).json({ error: 'not-found' }); });

// 해시가 붙은 빌드 산출물만 오래 캐시한다. index.html은 매번 검증해 새 배포를 바로 받는다.
app.use('/assets', express.static(`${staticDir}assets`, { immutable: true, maxAge: '1y' }));
// 첫 화면과 초대 링크는 링크 미리보기 태그를 절대 주소로 채워 낸다. 나머지 정적 파일은 그대로 낸다
app.get('/g/:code', (req: Request, res: Response) => { void invites.page(req as never, res as never); });
app.get(['/', '/index.html'], (_req: Request, res: Response, next) => {
  readIndexHtml(staticDir)().then(html => {
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(withMeta(html, defaultMeta(origin)));
  }, next);
});
app.use(express.static(staticDir));

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => { console.info(`Server listening on port ${port}`); });
applyKeepAlive(server);
// 인증 인스턴스가 기동 시점에 서비스 주소를 이미 검사했다.
const live = attachLive(server, {
  origin,
  authenticate: async (req) => {
    const session = await sessionOf(req.headers);
    if (!session) return null;
    const { nick, boat } = await liveIdentity(database().db, session.id);
    // 프로필은 첫 액션에서 생긴다. 그 전에 연결한 게스트는 기본 이름으로 보인다
    return { uid: session.id, nick: nick ?? '낚시꾼', boat, guest: session.email === null };
  },
  chat: {
    save: (user, text, guild) => saveChat(database().db, user.uid, user.nick, text, guild),
    recent: (uid, limit, guild) => recentChat(database().db, uid, limit, guild),
    blocked: (uid) => blockedIds(database().db, uid),
    guildOf: (uid) => guildIdOf(database().db, uid),
  },
  // 종료 신호 때도 남은 기록이 끝날 때까지 기다리도록 응답 뒤 작업으로 추적한다
  recordSession: (uid, startedAt, endedAt) => {
    afterResponse(recordSession(database().db, uid, startedAt, endedAt).catch(e =>
      reportServerIssue('접속 세션 기록 실패', e, { uid, startedAt, endedAt })));
  },
  // 다시 접속하면 이 자리에서 시작한다. 세션 기록과 같이 응답 뒤 작업으로 추적한다
  savePosition: (uid, pos) => {
    afterResponse(saveLastPosition(database().db, uid, pos).catch(e =>
      reportServerIssue('마지막 위치 기록 실패', e, { uid, region: pos.region })));
  },
});

providePresence(uid => live.presenceOf(uid));
provideOnline(() => live.online());
provideNotify((uid, msg) => live.sendTo(uid, msg));

process.on('SIGTERM', () => {
  live.close();
  server.close(() => {
    void settleAfterResponse().then(() => process.exit(0));
  });
});
