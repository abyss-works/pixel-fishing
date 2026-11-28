// 관리자 함수. 대시보드가 보는 모든 조회를 서버가 대신 읽고, 관리자 쓰기(POST)를 받는다 (Node 런타임)
// 쓰기는 우편 보내기(q=mail), 제재·해제(q=restrict), 편지 처리 표시(q=letterHandled), 세션 강제 종료(q=revokeSessions), 공지 관리(q=notices)이다.
// 제재·해제와 세션 강제 종료는 조치한 관리자 id를 대상 사용자의 이벤트로 함께 남긴다.
// 브라우저는 관리자 뷰와 함수를 직접 읽지 않는다. 관리자 세션의 사용자가 관리자 명부(admins)에 있어야 읽을 수 있다.
// 관리자 세션은 대시보드 로그인이 발급한 쿠키만 인정하고 게임 세션 쿠키는 받지 않는다.
// 관리자 세션이 없거나 확인되지 않으면 401, 명부에 없으면 403이다. 접근 판정(access)만 명부에 없어도 denied로 답한다.
// 응답에는 이메일 같은 개인정보가 담기므로 어떤 응답도 캐시하지 않는다.
// 리소스 경로 조회(GET /api/admin/live·stats/daily·retention·sessions)도 같은 판정을 거친다. 질의 문자열은 필터에만 쓴다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminSessionUid } from './_auth/session.js';
import { database } from './_db/client.js';
import type { Database, Executor } from './_db/client.js';
import { notifyAll, notifyUser, onlineUsers } from './_server/livePresence.js';
import { recentHttpSummary, recentPool, recentRuntime, recentWsSnapshot, slowRequests } from './_server/opsRuntime.js';
import { canAccessResource, canReadQuery, canWriteAction, capabilitiesFor } from './_server/adminPolicy.js';
import { COUPONS } from '../src/game/content/coupons.js';
import { normalizeNoticeDraft } from '../src/game/rules/live.js';
import { integrityModifierOfStage, parseIntegrityConfig } from '../src/game/rules/integrity.js';
import { accountKind, revokeUserSessions } from './_data/account.js';
import * as read from './_data/admin.js';
import { balanceLive } from './_data/adminBalance.js';
import { onboardingFunnel } from './_data/adminFunnel.js';
import {
  COUPON_CODE_MAX, createAdminCoupon, deleteAdminCoupon, listAdminCoupons, parseCouponDraft, updateAdminCoupon,
} from './_data/codes.js';
import type { AdminCouponRow } from './_data/codes.js';
import {
  EVENT_ID_PATTERN, createAdminEvent, deleteAdminEvent, drawEventWinners, endAdminEventNow,
  listAdminEvents, listEventDraws, parseEventCreateDraft, parseEventDrawInput, parseEventUpdateDraft, updateAdminEvent,
} from './_data/events.js';
import { readClientMetrics } from './_data/clientMetrics.js';
import { readHttpMetrics } from './_data/httpMetrics.js';
import {
  integrityValidationMetrics, listIntegrityEvents, listIntegrityStages, resetIntegrityState,
} from './_data/integrity.js';
import { readOpsHealth } from './_data/opsHealth.js';
import { setLetterHandled } from './_data/mail.js';
import { deliverMail, DuplicateMailError, parseMailRequest, planMail, recentSentMails } from './_data/mailbox.js';
import {
  createNotice, deleteNotice, endNoticeNow, listAllAdminNotices, listLiveNotices, updateNotice,
} from './_data/notices.js';
import { setRestricted } from './_data/save.js';
import { recordAdminAction } from './_data/telemetry.js';
import { deleteWidgetTokensForUser } from './_data/widget.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';
import { disconnectWidgetUser } from './widget/guard.js';

type Req = IncomingMessage & { query?: Record<string, string | string[] | undefined>; body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

/** 대시보드가 보는 가장 긴 기간. 일별 활성 조회의 창(90일)과 같다 */
const MAX_DAYS = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 이름 조회(?q=)와 관리자 쓰기의 경로 */
const ROOT = '/api/admin';
/** 일별 집계 조회의 기본 기간과 최대 기간(일) */
const STATS_DEFAULT_DAYS = 30;
const STATS_MAX_DAYS = 180;
const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 현재 비밀 설정이 읽힐 때만 구간별 배수를 계산한다. 설정이 없으면 운영 표면에도 추정값을 내지 않는다 */
function integrityStageModifier(): (stage: number) => number | null {
  const config = parseIntegrityConfig(process.env.DRAW_WEIGHTING_CONFIG);
  return stage => config ? integrityModifierOfStage(stage, config) : null;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    await route(req, res);
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code });
  }
}

/** 관리자 쓰기. 요청 본문과 조치한 관리자 id·역할을 받는다 */
type Write = (database: Database, body: unknown, adminId: string, role: read.AdminRole) => Promise<unknown>;
const WRITES: Record<string, Write> = {
  mail: ({ db }, body, adminId, role) => mail(db, body, adminId, role),
  restrict,
  letterHandled,
  revokeSessions,
  notices: ({ db }, body, adminId, role) => notices(db, body, adminId, role),
  events: (store, body, adminId) => eventsWrite(store, body, adminId),
  coupons: couponsWrite,
  staffBadge,
  integrityRelease,
};

const KNOWN_READ_QUERIES = new Set([
  'overview', 'users', 'userSearch', 'spamFlags', 'recentEvents', 'letters', 'changelog',
  'chatReports', 'notices', 'events', 'eventDraws', 'coupons', 'mails',
  'economy', 'bountyFunnel', 'onboardingFunnel', 'httpMetrics', 'clientMetrics',
  'opsHealth', 'balanceLive', 'userEvents', 'userState',
  'integrityStages', 'integrityEvents', 'integrityMetrics',
]);

/** 리소스 경로 조회. 요청의 필터와 역할을 검사해 실행할 읽기를 돌려준다. 틀리면 400, 권한 밖이면 403이다 */
const RESOURCES: Record<string, (req: Req, role: read.AdminRole) => (db: Executor) => Promise<unknown>> = {
  '/api/admin/live': (_req, role) => async db => read.liveSnapshot(db, await onlineUsers(), role),
  '/api/admin/stats/daily': req => {
    const { from, to } = rangeOf(req);
    return db => read.dailyStats(db, from, to);
  },
  '/api/admin/retention': () => read.signupRetention,
  '/api/admin/sessions': (req, role) => {
    const user = param(req, 'user');
    if (user !== undefined && !UUID.test(user)) throw new ApiError(400, 'bad-user');
    const limit = limitOf(req);
    return db => read.sessions(db, user ?? null, limit, role);
  },
};

/** 관리자 세션의 사용자와 명부 정보. 관리자 세션이 없으면 401이다 */
async function caller(req: Req): Promise<{ uid: string; member: read.AdminMember | null; store: Database }> {
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  const uid = await adminSessionUid(req.headers);
  if (!uid) throw new ApiError(401, 'unauthorized');
  const store = database();
  const member = await dbRead(() => read.adminMember(store.db, uid));
  return { uid, member, store };
}

async function route(req: Req, res: Res): Promise<void> {
  const path = new URL(req.url ?? ROOT, 'http://x').pathname.replace(/\/+$/, '');
  if (path !== ROOT) {
    const resource = Object.hasOwn(RESOURCES, path) ? RESOURCES[path] : null;
    if (!resource) throw new ApiError(404, 'not-found');
    if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
    const { member, store } = await caller(req);
    if (!member || !canAccessResource(member.role, path)) throw new ApiError(403, 'forbidden');
    const query = resource(req, member.role);
    res.status(200).json(await dbRead(() => query(store.db)));
    return;
  }

  const q = param(req, 'q');
  const write = req.method === 'POST' && q !== undefined && Object.hasOwn(WRITES, q) ? WRITES[q] : null;
  if (req.method !== 'GET' && !write) throw new ApiError(405, 'method-not-allowed');
  const { uid, member, store } = await caller(req);
  const { db } = store;
  const name = param(req, 'q');
  if (name === 'access') {
    res.status(200).json(
      member
        ? {
            kind: 'granted',
            uid,
            role: member.role,
            showStaffBadge: member.showStaffBadge,
            capabilities: capabilitiesFor(member.role),
          }
        : { kind: 'denied', uid },
    );
    return;
  }
  if (!member) throw new ApiError(403, 'forbidden');

  if (write) {
    if (q === undefined || !canWriteAction(member.role, q)) {
      throw new ApiError(403, 'forbidden');
    }
    res.status(200).json(await write(store, req.body, uid, member.role));
    return;
  }
  if (name === undefined || !KNOWN_READ_QUERIES.has(name)) {
    throw new ApiError(400, 'bad-query');
  }
  if (!canReadQuery(member.role, name)) {
    throw new ApiError(403, 'forbidden');
  }
  const query = parse(name, req, member.role, store.pool);
  res.status(200).json(await dbRead(() => query(db)));
}

/** 조회 이름과 인자를 검사해 실행할 읽기를 돌려준다. 틀리면 400이다 */
function parse(name: string | undefined, req: Req, role: read.AdminRole, pool: Database['pool']): (db: Executor) => Promise<unknown> {
  switch (name) {
    case 'overview': {
      const days = optionalDaysOf(req) ?? STATS_DEFAULT_DAYS;
      if (days < 1 || days > STATS_MAX_DAYS) throw new ApiError(400, 'bad-days');
      return async db => read.overview(db, days, await onlineUsers(), role);
    }
    case 'users': return db => read.users(db, role);
    case 'userSearch': {
      const rawTerm = param(req, 'term');
      const term = typeof rawTerm === 'string' ? rawTerm.trim() : '';
      if (term.length === 0 || term.length > 100) throw new ApiError(400, 'bad-term');
      const limit = limitOf(req);
      if (limit !== null && (limit < 1 || limit > 50)) throw new ApiError(400, 'bad-limit');
      return db => read.userSearch(db, term, limit, role);
    }
    case 'spamFlags': return db => read.spamFlags(db, role);
    case 'recentEvents': return db => read.recentEvents(db, role);
    case 'letters': return read.letters;
    case 'changelog': return db => read.changelog(db, role);
    case 'chatReports': return db => read.chatReports(db, role);
    case 'notices': return listAllAdminNotices;
    case 'events': return listAdminEvents;
    case 'eventDraws': {
      const eventId = param(req, 'eventId');
      if (eventId === undefined || !EVENT_ID_PATTERN.test(eventId)) throw new ApiError(400, 'bad-event');
      return db => listEventDraws(db, eventId);
    }
    case 'coupons': return listAdminCoupons;
    case 'mails': return db => recentSentMails(db);
    case 'economy': { const days = daysOf(req); return db => read.economy(db, days); }
    case 'bountyFunnel': { const days = daysOf(req); return db => read.bountyFunnel(db, days); }
    case 'onboardingFunnel': return onboardingFunnel;
    case 'httpMetrics': {
      const days = optionalDaysOf(req) ?? STATS_DEFAULT_DAYS;
      if (days < 1 || days > MAX_DAYS) throw new ApiError(400, 'bad-days');
      return db => readHttpMetrics(db, days);
    }
    case 'clientMetrics': {
      const days = optionalDaysOf(req) ?? 7;
      if (days < 1 || days > MAX_DAYS) throw new ApiError(400, 'bad-days');
      return db => readClientMetrics(db, days);
    }
    case 'opsHealth': {
      const days = optionalDaysOf(req) ?? 7;
      if (days < 1 || days > MAX_DAYS) throw new ApiError(400, 'bad-days');
      return async db => {
        const [online, slow, recentHttp, recentWs, runtime, remotePool] = await Promise.all([
          onlineUsers(),
          slowRequests(),
          recentHttpSummary(),
          recentWsSnapshot(),
          recentRuntime(),
          recentPool(),
        ]);
        return readOpsHealth(db, pool, {
          days,
          onlineCount: online.length,
          slowRequests: slow,
          recentHttp,
          recentWs,
          runtime,
          pool: remotePool,
        });
      };
    }
    case 'balanceLive': { const days = optionalDaysOf(req); return db => balanceLive(db, days); }
    case 'userEvents': {
      const user = param(req, 'user');
      if (user === undefined || !UUID.test(user)) throw new ApiError(400, 'bad-user');
      const limit = limitOf(req);
      return db => read.userEvents(db, user, limit);
    }
    case 'userState': {
      const uid = param(req, 'uid');
      if (uid === undefined || !UUID.test(uid)) throw new ApiError(400, 'bad-user');
      return db => read.userState(db, uid);
    }
    case 'integrityStages': return db => listIntegrityStages(db, integrityStageModifier());
    case 'integrityEvents': {
      const user = param(req, 'user');
      if (user !== undefined && !UUID.test(user)) throw new ApiError(400, 'bad-user');
      const limit = limitOf(req) ?? 100;
      if (limit < 1 || limit > 500) throw new ApiError(400, 'bad-limit');
      return db => listIntegrityEvents(db, user ?? null, limit);
    }
    case 'integrityMetrics': {
      const days = optionalDaysOf(req) ?? STATS_DEFAULT_DAYS;
      if (days < 1 || days > MAX_DAYS) throw new ApiError(400, 'bad-days');
      return db => integrityValidationMetrics(db, days);
    }
    default: throw new ApiError(400, 'bad-query');
  }
}

/** 우편 보내기 — op가 preview면 미리보기만, send면 보낸다. 같은 데이터 모듈을 운영 스크립트도 쓴다 */
async function mail(db: Executor, raw: unknown, adminId: string, role: read.AdminRole): Promise<unknown> {
  const bodyObj = raw as { op?: unknown; request?: unknown; idempotencyKey?: unknown } | null;
  const op = bodyObj?.op;
  const request = parseMailRequest(bodyObj?.request);
  const topKey = bodyObj?.idempotencyKey;
  if (topKey !== undefined && (typeof topKey !== 'string' || topKey.trim().length === 0 || topKey.length > 128)) {
    throw new ApiError(400, 'bad-mail');
  }
  if ((op !== 'preview' && op !== 'send') || !request) throw new ApiError(400, 'bad-mail');
  const merged = typeof topKey === 'string' && !request.idempotencyKey
    ? { ...request, idempotencyKey: topKey.trim() }
    : request;
  if (op === 'preview') return dbRead(() => planMail(db, merged));
  try {
    const result = await deliverMail(db, merged, new Date().toISOString());
    if (result.problems.length === 0 && result.sent > 0 && !result.idempotent) {
      await read.insertAdminAuditLog(db, {
        actorId: adminId,
        actorRole: role,
        action: 'mail.send',
        targetId: merged.target.kind === 'users' && merged.target.recipients.length === 1
          ? merged.target.recipients[0].userId.trim().toLowerCase()
          : null,
        detail: { targetKind: merged.target.kind, sent: result.sent },
      });
      if (merged.target.kind === 'all') {
        for (const online of await onlineUsers()) {
          if (!online.guest) notifyUser(online.uid, { t: 'mail' });
        }
      } else {
        for (const recipient of merged.target.recipients) {
          notifyUser(recipient.userId.trim().toLowerCase(), { t: 'mail' });
        }
      }
    }
    return result;
  } catch (e) {
    if (e instanceof DuplicateMailError) throw new ApiError(409, 'duplicate-mail');
    if (e instanceof ApiError) throw e;
    throw new ApiError(500, 'db-write', {}, { cause: e });
  }
}

/** 제재·해제 — 저장 상태의 restricted를 바꾸고 조치 이벤트와 감사 로그를 같은 트랜잭션에 남긴다. 저장 상태가 없으면 404다 */
async function restrict({ withTransaction }: Database, raw: unknown, adminId: string, role: read.AdminRole): Promise<{ restricted: boolean }> {
  const { userId, restricted } = (raw ?? {}) as { userId?: unknown; restricted?: unknown };
  if (typeof userId !== 'string' || !UUID.test(userId) || typeof restricted !== 'boolean') throw new ApiError(400, 'bad-restrict');
  const changed = await dbWrite(() => withTransaction(async tx => {
    if (!await setRestricted(tx, userId, restricted)) return false;
    if (restricted) await deleteWidgetTokensForUser(tx, userId);
    await recordAdminAction(tx, userId, restricted ? 'adminRestrict' : 'adminUnrestrict', adminId);
    await read.insertAdminAuditLog(tx, {
      actorId: adminId,
      actorRole: role,
      action: restricted ? 'restrict' : 'unrestrict',
      targetId: userId,
      detail: { restricted },
    });
    return true;
  }));
  if (!changed) throw new ApiError(404, 'no-save');
  if (restricted) disconnectWidgetUser(userId);
  return { restricted };
}

/** 편지 처리 표시 — 처리하면 처리 시각을 남기고 취소하면 비운다. 편지가 없으면 404다 */
async function letterHandled({ db }: Database, raw: unknown): Promise<{ handled: boolean }> {
  const { letterId, handled } = (raw ?? {}) as { letterId?: unknown; handled?: unknown };
  if (!Number.isSafeInteger(letterId) || (letterId as number) < 1 || typeof handled !== 'boolean') throw new ApiError(400, 'bad-letter');
  const found = await dbWrite(() => setLetterHandled(db, letterId as number, handled, new Date().toISOString()));
  if (!found) throw new ApiError(404, 'no-letter');
  return { handled };
}

/** 세션 강제 종료 — 대상 계정의 모든 인증 세션 행을 지우고 관리자 조치 이벤트와 감사 로그를 남긴다. 계정이 없으면 404다 */
async function revokeSessions({ withTransaction }: Database, raw: unknown, adminId: string, role: read.AdminRole): Promise<{ revoked: number }> {
  const { userId } = (raw ?? {}) as { userId?: unknown };
  if (typeof userId !== 'string' || !UUID.test(userId)) throw new ApiError(400, 'bad-user');
  const revoked = await dbWrite(() => withTransaction(async tx => {
    if (await accountKind(tx, userId) === 'missing') return null;
    const count = await revokeUserSessions(tx, userId);
    await recordAdminAction(tx, userId, 'adminRevokeSessions', adminId, { revoked: count });
    await read.insertAdminAuditLog(tx, {
      actorId: adminId,
      actorRole: role,
      action: 'revokeSessions',
      targetId: userId,
      detail: { revoked: count },
    });
    return count;
  }));
  if (revoked === null) throw new ApiError(404, 'no-user');
  disconnectWidgetUser(userId);
  return { revoked };
}

/** 추첨 가중치 초기화 — 대상 계정의 압력과 입력 창을 즉시 빈 상태로 되돌리고 감사 로그를 남긴다. 계정이 없으면 404다 */
async function integrityRelease({ withTransaction }: Database, raw: unknown, adminId: string, role: read.AdminRole): Promise<{ released: true }> {
  const { userId } = (raw ?? {}) as { userId?: unknown };
  if (typeof userId !== 'string' || !UUID.test(userId)) throw new ApiError(400, 'bad-user');
  await dbWrite(() => withTransaction(async tx => {
    if (await accountKind(tx, userId) === 'missing') return false;
    await resetIntegrityState(tx, userId, new Date().toISOString());
    await read.insertAdminAuditLog(tx, {
      actorId: adminId,
      actorRole: role,
      action: 'integrityRelease',
      targetId: userId,
      detail: {},
    });
    return true;
  })).then(found => {
    if (!found) throw new ApiError(404, 'no-user');
  });
  return { released: true };
}

/** 호출자 본인의 채팅 운영진 배지 노출 설정을 바꾸고 감사 로그를 남긴다 */
async function staffBadge({ withTransaction }: Database, raw: unknown, actorId: string, actorRole: read.AdminRole): Promise<{ showStaffBadge: boolean }> {
  const { show } = (raw !== null && typeof raw === 'object' ? raw : {}) as { show?: unknown };
  if (typeof show !== 'boolean') throw new ApiError(400, 'bad-staff-badge');
  const updated = await dbWrite(() => withTransaction(async tx => {
    if (!await read.setAdminStaffBadge(tx, actorId, show)) return false;
    await read.insertAdminAuditLog(tx, {
      actorId,
      actorRole,
      action: 'staffBadge',
      targetId: actorId,
      detail: { showStaffBadge: show },
    });
    return true;
  }));
  if (!updated) throw new ApiError(403, 'forbidden');
  return { showStaffBadge: show };
}

/** 기간제 상시 공지 작성·수정·즉시 마감·삭제 후 실시간 전체 연결에 마감 전·최근 마감 공지 목록을 즉시 전파한다 */
async function notices(db: Executor, raw: unknown, adminId: string, role: read.AdminRole): Promise<unknown> {
  const body = (raw !== null && typeof raw === 'object' ? raw : {}) as {
    op?: unknown; id?: unknown; title?: unknown; body?: unknown; startsAt?: unknown; endsAt?: unknown;
  };
  const parseId = (): number => {
    if (!Number.isSafeInteger(body.id) || (body.id as number) < 1) throw new ApiError(400, 'bad-notice');
    return body.id as number;
  };
  const sync = async () => {
    const current = await dbRead(() => listLiveNotices(db));
    notifyAll({ t: 'notices', notices: current });
  };

  switch (body.op) {
    case 'create': {
      const parsed = normalizeNoticeDraft({
        title: body.title, body: body.body, startsAt: body.startsAt, endsAt: body.endsAt,
      });
      if (!parsed.ok) throw new ApiError(400, parsed.code);
      const notice = await dbWrite(() => createNotice(db, { ...parsed.draft, createdBy: adminId }));
      await dbWrite(() => read.insertAdminAuditLog(db, {
        actorId: adminId,
        actorRole: role,
        action: 'notices.create',
        detail: { noticeId: notice.id },
      }));
      await sync();
      return { notice };
    }
    case 'update': {
      const id = parseId();
      const parsed = normalizeNoticeDraft({
        title: body.title, body: body.body, startsAt: body.startsAt, endsAt: body.endsAt,
      });
      if (!parsed.ok) throw new ApiError(400, parsed.code);
      const notice = await dbWrite(() => updateNotice(db, id, parsed.draft));
      if (!notice) throw new ApiError(404, 'no-notice');
      await dbWrite(() => read.insertAdminAuditLog(db, {
        actorId: adminId,
        actorRole: role,
        action: 'notices.update',
        detail: { noticeId: notice.id },
      }));
      await sync();
      return { notice };
    }
    case 'end': {
      const id = parseId();
      const notice = await dbWrite(() => endNoticeNow(db, id));
      if (!notice) throw new ApiError(404, 'no-notice');
      await dbWrite(() => read.insertAdminAuditLog(db, {
        actorId: adminId,
        actorRole: role,
        action: 'notices.end',
        detail: { noticeId: notice.id },
      }));
      await sync();
      return { notice };
    }
    case 'delete': {
      const id = parseId();
      const removed = await dbWrite(() => deleteNotice(db, id));
      if (!removed) throw new ApiError(404, 'no-notice');
      await dbWrite(() => read.insertAdminAuditLog(db, {
        actorId: adminId,
        actorRole: role,
        action: 'notices.delete',
        detail: { noticeId: id },
      }));
      await sync();
      return { deleted: true, id };
    }
    default:
      throw new ApiError(400, 'bad-notice');
  }
}

/** 라이브 이벤트 생성·수정·조기 종료·삭제·당첨 추첨(당첨자 우편 발송 포함) */
async function eventsWrite({ db, withTransaction }: Database, raw: unknown, adminId: string): Promise<unknown> {
  const body = (raw !== null && typeof raw === 'object' ? raw : {}) as { op?: unknown; id?: unknown };
  const parseId = (): string => {
    if (typeof body.id !== 'string' || !EVENT_ID_PATTERN.test(body.id.trim())) throw new ApiError(400, 'bad-event');
    return body.id.trim();
  };

  switch (body.op) {
    case 'create': {
      const draft = parseEventCreateDraft(body);
      if (!draft) throw new ApiError(400, 'bad-event');
      const event = await dbWrite(() => createAdminEvent(db, draft));
      if (event === 'duplicate') throw new ApiError(409, 'duplicate-event');
      return { event };
    }
    case 'update': {
      const draft = parseEventUpdateDraft(body);
      if (!draft) throw new ApiError(400, 'bad-event');
      const event = await dbWrite(() => updateAdminEvent(db, draft));
      if (!event) throw new ApiError(404, 'no-event');
      return { event };
    }
    case 'end': {
      const id = parseId();
      const event = await dbWrite(() => endAdminEventNow(db, id));
      if (!event) throw new ApiError(404, 'no-event');
      return { event };
    }
    case 'delete': {
      const id = parseId();
      const deleted = await dbWrite(() => deleteAdminEvent(db, id));
      if (!deleted) throw new ApiError(404, 'no-event');
      return { deleted: true, id };
    }
    case 'draw': {
      const input = parseEventDrawInput(body);
      if (!input) throw new ApiError(400, 'bad-event');
      const outcome = await dbWrite(() => drawEventWinners(withTransaction, { ...input, drawnBy: adminId }, new Date().toISOString()));
      if (outcome === 'no-event') throw new ApiError(404, 'no-event');
      for (const draw of outcome.draws) {
        notifyUser(draw.userId, { t: 'mail' });
      }
      return outcome;
    }
    default:
      throw new ApiError(400, 'bad-event');
  }
}

/** 동적 쿠폰 생성·수정·삭제와 불변 감사 로그 기록을 단일 트랜잭션으로 묶어 실행한다 */
async function couponsWrite({ withTransaction }: Database, raw: unknown, adminId: string, role: read.AdminRole): Promise<unknown> {
  const body = (raw !== null && typeof raw === 'object' ? raw : {}) as { op?: unknown; code?: unknown };
  const couponDetail = (c: AdminCouponRow) => ({
    code: c.code,
    gold: c.gold,
    itemsCount: c.items.length,
    active: c.active,
    maxRedemptions: c.maxRedemptions,
    perAccountLimit: c.perAccountLimit,
  });

  switch (body.op) {
    case 'create': {
      const draft = parseCouponDraft(body, 'create');
      if (!draft || Object.hasOwn(COUPONS, draft.code)) throw new ApiError(400, 'bad-coupon');
      const coupon = await dbWrite(() => withTransaction(async tx => {
        const created = await createAdminCoupon(tx, draft);
        if (created === 'duplicate') return 'duplicate' as const;
        await read.insertAdminAuditLog(tx, {
          actorId: adminId,
          actorRole: role,
          action: 'couponCreate',
          targetId: null,
          reason: created.code,
          detail: couponDetail(created),
        });
        return created;
      }));
      if (coupon === 'duplicate') throw new ApiError(409, 'duplicate-coupon');
      return { coupon };
    }
    case 'update': {
      const draft = parseCouponDraft(body, 'update');
      if (!draft || Object.hasOwn(COUPONS, draft.code)) throw new ApiError(400, 'bad-coupon');
      const coupon = await dbWrite(() => withTransaction(async tx => {
        const updated = await updateAdminCoupon(tx, draft);
        if (!updated) return null;
        await read.insertAdminAuditLog(tx, {
          actorId: adminId,
          actorRole: role,
          action: 'couponUpdate',
          targetId: null,
          reason: updated.code,
          detail: couponDetail(updated),
        });
        return updated;
      }));
      if (!coupon) throw new ApiError(404, 'no-coupon');
      return { coupon };
    }
    case 'delete': {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (code.length === 0 || code.length > COUPON_CODE_MAX) throw new ApiError(400, 'bad-coupon');
      const deleted = await dbWrite(() => withTransaction(async tx => {
        const removed = await deleteAdminCoupon(tx, code);
        if (!removed) return false;
        await read.insertAdminAuditLog(tx, {
          actorId: adminId,
          actorRole: role,
          action: 'couponDelete',
          targetId: null,
          reason: code,
          detail: { code },
        });
        return true;
      }));
      if (!deleted) throw new ApiError(404, 'no-coupon');
      return { deleted: true, code };
    }
    default:
      throw new ApiError(400, 'bad-coupon');
  }
}

const param = (req: Req, key: string): string | undefined => {
  const v = req.query?.[key];
  return typeof v === 'string' ? v : undefined;
};

function daysOf(req: Req): number {
  const raw = param(req, 'days');
  const days = raw !== undefined && /^\d{1,3}$/.test(raw) ? Number(raw) : 0;
  if (days < 1 || days > MAX_DAYS) throw new ApiError(400, 'bad-days');
  return days;
}

/** 이벤트 지표의 기간. 없으면 null이고 기본값과 범위는 읽기가 정한다. 정수가 아니면 400이다 */
function optionalDaysOf(req: Req): number | null {
  const raw = param(req, 'days');
  if (raw === undefined) return null;
  if (!/^\d{1,3}$/.test(raw)) throw new ApiError(400, 'bad-days');
  return Number(raw);
}

/**
 * 일별 집계 조회의 KST 날짜 범위(양끝 포함). to가 없으면 KST 오늘, from이 없으면 to부터 30일 전이다.
 * 날짜 형식이 틀리면 400 bad-date, from이 to보다 늦거나 기간이 180일을 넘으면 400 bad-range다.
 */
function rangeOf(req: Req): { from: string; to: string } {
  const dayOf = (key: string): number | null => {
    const raw = param(req, key);
    if (raw === undefined) return null;
    const ms = DATE.test(raw) ? Date.parse(raw) : NaN;
    if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== raw) throw new ApiError(400, 'bad-date');
    return ms;
  };
  const kstToday = Date.parse(new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10));
  const to = dayOf('to') ?? kstToday;
  const from = dayOf('from') ?? to - (STATS_DEFAULT_DAYS - 1) * DAY_MS;
  const days = (to - from) / DAY_MS + 1;
  if (days < 1 || days > STATS_MAX_DAYS) throw new ApiError(400, 'bad-range');
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/** 이벤트 건수. 없으면 null이고 기본값과 범위는 읽기가 정한다 */
function limitOf(req: Req): number | null {
  const raw = param(req, 'limit');
  if (raw === undefined) return null;
  if (!/^\d{1,6}$/.test(raw)) throw new ApiError(400, 'bad-limit');
  return Number(raw);
}

async function dbWrite<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw new ApiError(500, 'db-write', {}, { cause: e });
  }
}

async function dbRead<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw new ApiError(500, 'db-read', {}, { cause: e });
  }
}
