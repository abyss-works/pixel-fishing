// 관리자 함수. 대시보드가 보는 모든 조회를 서버가 대신 읽고, 관리자 쓰기(POST)를 받는다 (Node 런타임)
// 쓰기는 우편 보내기(q=mail), 제재·해제(q=restrict), 비밀번호 재설정 링크 발급(q=resetLink), 편지 처리 표시(q=letterHandled)이다.
// 제재·해제와 재설정 링크 발급은 조치한 관리자 id를 대상 사용자의 이벤트로 함께 남긴다.
// 브라우저는 관리자 뷰와 함수를 직접 읽지 않는다. 관리자 세션의 사용자가 관리자 명부(admins)에 있어야 읽을 수 있다.
// 관리자 세션은 대시보드 로그인이 발급한 쿠키만 인정하고 게임 세션 쿠키는 받지 않는다.
// 관리자 세션이 없거나 확인되지 않으면 401, 명부에 없으면 403이다. 접근 판정(access)만 명부에 없어도 denied로 답한다.
// 응답에는 이메일 같은 개인정보가 담기므로 어떤 응답도 캐시하지 않는다.
// 리소스 경로 조회(GET /api/admin/live·stats/daily·retention·sessions)도 같은 판정을 거친다. 질의 문자열은 필터에만 쓴다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { newPasswordResetToken, passwordResetLanding, RESET_PASSWORD_EXPIRES_IN } from './_auth/auth.js';
import { adminSessionUid } from './_auth/session.js';
import { database } from './_db/client.js';
import type { Database, Executor } from './_db/client.js';
import { onlineUsers } from './_server/livePresence.js';
import { accountKind, insertPasswordResetToken } from './_data/account.js';
import * as read from './_data/admin.js';
import { balanceLive } from './_data/adminBalance.js';
import { setLetterHandled } from './_data/mail.js';
import { deliverMail, parseMailRequest, planMail, recentSentMails } from './_data/mailbox.js';
import { setRestricted } from './_data/save.js';
import { recordAdminAction } from './_data/telemetry.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

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

/** 관리자 쓰기. 요청 본문과 조치한 관리자 id를 받는다 */
type Write = (database: Database, body: unknown, adminId: string) => Promise<unknown>;
const WRITES: Record<string, Write> = {
  mail: ({ db }, body) => mail(db, body),
  restrict,
  resetLink,
  letterHandled,
};

/** 리소스 경로 조회. 요청의 필터를 검사해 실행할 읽기를 돌려준다. 틀리면 400이다 */
const RESOURCES: Record<string, (req: Req) => (db: Executor) => Promise<unknown>> = {
  '/api/admin/live': () => async db => {
    const online = onlineUsers();
    const known = await read.identities(db, online.map(entry => entry.uid));
    return {
      count: online.length,
      online: online.map(entry => ({ ...entry, nickname: null, email: null, ...known.get(entry.uid) })),
    };
  },
  '/api/admin/stats/daily': req => {
    const { from, to } = rangeOf(req);
    return db => read.dailyStats(db, from, to);
  },
  '/api/admin/retention': () => read.signupRetention,
  '/api/admin/sessions': req => {
    const user = param(req, 'user');
    if (user !== undefined && !UUID.test(user)) throw new ApiError(400, 'bad-user');
    const limit = limitOf(req);
    return db => read.sessions(db, user ?? null, limit);
  },
};

/** 관리자 세션의 사용자와 관리자 여부. 관리자 세션이 없으면 401이다 */
async function caller(req: Req): Promise<{ uid: string; admin: boolean; store: Database }> {
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  const uid = await adminSessionUid(req.headers);
  if (!uid) throw new ApiError(401, 'unauthorized');
  const store = database();
  const admin = await dbRead(() => read.isAdmin(store.db, uid));
  return { uid, admin, store };
}

async function route(req: Req, res: Res): Promise<void> {
  const path = new URL(req.url ?? ROOT, 'http://x').pathname.replace(/\/+$/, '');
  if (path !== ROOT) {
    const resource = Object.hasOwn(RESOURCES, path) ? RESOURCES[path] : null;
    if (!resource) throw new ApiError(404, 'not-found');
    if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
    const { admin, store } = await caller(req);
    if (!admin) throw new ApiError(403, 'forbidden');
    const query = resource(req);
    res.status(200).json(await dbRead(() => query(store.db)));
    return;
  }

  const q = param(req, 'q');
  const write = req.method === 'POST' && q !== undefined && Object.hasOwn(WRITES, q) ? WRITES[q] : null;
  if (req.method !== 'GET' && !write) throw new ApiError(405, 'method-not-allowed');
  const { uid, admin, store } = await caller(req);
  const { db } = store;
  const name = param(req, 'q');
  if (name === 'access') {
    res.status(200).json({ kind: admin ? 'granted' : 'denied', uid });
    return;
  }
  if (!admin) throw new ApiError(403, 'forbidden');

  if (write) {
    res.status(200).json(await write(store, req.body, uid));
    return;
  }
  const query = parse(name, req);
  res.status(200).json(await dbRead(() => query(db)));
}

/** 조회 이름과 인자를 검사해 실행할 읽기를 돌려준다. 틀리면 400이다 */
function parse(name: string | undefined, req: Req): (db: Executor) => Promise<unknown> {
  switch (name) {
    case 'users': return read.users;
    case 'retention': return read.retention;
    case 'spamFlags': return read.spamFlags;
    case 'recentEvents': return read.recentEvents;
    case 'letters': return read.letters;
    case 'changelog': return read.changelog;
    case 'chatReports': return read.chatReports;
    case 'mails': return db => recentSentMails(db);
    case 'dailyActive': { const days = daysOf(req); return db => read.dailyActive(db, days); }
    case 'economy': { const days = daysOf(req); return db => read.economy(db, days); }
    case 'bountyFunnel': { const days = daysOf(req); return db => read.bountyFunnel(db, days); }
    case 'catchQuality': { const days = daysOf(req); return db => read.catchQuality(db, days); }
    case 'balanceLive': { const days = optionalDaysOf(req); return db => balanceLive(db, days); }
    case 'userEvents': {
      const user = param(req, 'user');
      if (user === undefined || !UUID.test(user)) throw new ApiError(400, 'bad-user');
      const limit = limitOf(req);
      return db => read.userEvents(db, user, limit);
    }
    default: throw new ApiError(400, 'bad-query');
  }
}

/** 우편 보내기 — op가 preview면 미리보기만, send면 보낸다. 같은 데이터 모듈을 운영 스크립트도 쓴다 */
async function mail(db: Executor, raw: unknown): Promise<unknown> {
  const op = (raw as { op?: unknown } | null)?.op;
  const request = parseMailRequest((raw as { request?: unknown } | null)?.request);
  if ((op !== 'preview' && op !== 'send') || !request) throw new ApiError(400, 'bad-mail');
  if (op === 'preview') return dbRead(() => planMail(db, request));
  try {
    return await deliverMail(db, request, new Date().toISOString());
  } catch (e) {
    throw new ApiError(500, 'db-write', {}, { cause: e });
  }
}

/** 제재·해제 — 저장 상태의 restricted를 바꾸고 조치 이벤트를 같은 트랜잭션에 남긴다. 저장 상태가 없으면 404다 */
async function restrict({ withTransaction }: Database, raw: unknown, adminId: string): Promise<{ restricted: boolean }> {
  const { userId, restricted } = (raw ?? {}) as { userId?: unknown; restricted?: unknown };
  if (typeof userId !== 'string' || !UUID.test(userId) || typeof restricted !== 'boolean') throw new ApiError(400, 'bad-restrict');
  const changed = await dbWrite(() => withTransaction(async tx => {
    if (!await setRestricted(tx, userId, restricted)) return false;
    await recordAdminAction(tx, userId, restricted ? 'adminRestrict' : 'adminUnrestrict', adminId);
    return true;
  }));
  if (!changed) throw new ApiError(404, 'no-save');
  return { restricted };
}

/**
 * 비밀번호 재설정 링크 발급 — 가입 계정에 재설정 토큰을 만들고 게임의 재설정 착지 주소를 돌려준다. 메일은 보내지 않는다.
 * 게스트 계정은 비밀번호가 없어 409(anonymous-user), 구글 연결로 비밀번호 수단이 없어진 계정도 409(no-password)다. 인증 계정이 없으면 404다.
 */
async function resetLink({ withTransaction }: Database, raw: unknown, adminId: string): Promise<{ url: string; expiresAt: string }> {
  const { userId } = (raw ?? {}) as { userId?: unknown };
  if (typeof userId !== 'string' || !UUID.test(userId)) throw new ApiError(400, 'bad-user');
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new ApiError(500, 'server-config');
  const token = newPasswordResetToken();
  const expiresAt = new Date(Date.now() + RESET_PASSWORD_EXPIRES_IN * 1000).toISOString();
  const kind = await dbWrite(() => withTransaction(async tx => {
    const found = await accountKind(tx, userId);
    if (found !== 'member') return found;
    // 비밀번호 수단이 없는 계정에는 토큰을 만들지 않는다
    if (!await read.hasPasswordAccount(tx, userId)) return 'no-password' as const;
    await insertPasswordResetToken(tx, userId, token, expiresAt);
    await recordAdminAction(tx, userId, 'adminResetLink', adminId, { expiresAt });
    return found;
  }));
  if (kind === 'missing') throw new ApiError(404, 'no-user');
  if (kind === 'anonymous') throw new ApiError(409, 'anonymous-user');
  if (kind === 'no-password') throw new ApiError(409, 'no-password');
  return { url: passwordResetLanding(baseURL, token), expiresAt };
}

/** 편지 처리 표시 — 처리하면 처리 시각을 남기고 취소하면 비운다. 편지가 없으면 404다 */
async function letterHandled({ db }: Database, raw: unknown): Promise<{ handled: boolean }> {
  const { letterId, handled } = (raw ?? {}) as { letterId?: unknown; handled?: unknown };
  if (!Number.isSafeInteger(letterId) || (letterId as number) < 1 || typeof handled !== 'boolean') throw new ApiError(400, 'bad-letter');
  const found = await dbWrite(() => setLetterHandled(db, letterId as number, handled, new Date().toISOString()));
  if (!found) throw new ApiError(404, 'no-letter');
  return { handled };
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
