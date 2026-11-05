// 관리자 함수. 대시보드가 보는 모든 조회를 서버가 대신 읽고, 관리자 쓰기(POST)를 받는다 (Node 런타임)
// 쓰기는 우편 보내기(q=mail), 제재·해제(q=restrict), 비밀번호 재설정 링크 발급(q=resetLink), 편지 처리 표시(q=letterHandled)이다.
// 제재·해제와 재설정 링크 발급은 조치한 관리자 id를 대상 사용자의 이벤트로 함께 남긴다.
// 브라우저는 관리자 뷰와 함수를 직접 읽지 않는다. 세션 토큰의 사용자가 관리자 명부(admins)에 있어야 읽을 수 있다.
// 토큰이 없거나 확인되지 않으면 401, 명부에 없으면 403이다. 접근 판정(access)만 명부에 없어도 denied로 답한다.
// 응답에는 이메일 같은 개인정보가 담기므로 어떤 응답도 캐시하지 않는다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { newPasswordResetToken, passwordResetLanding, RESET_PASSWORD_EXPIRES_IN } from './_auth/auth.js';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import type { Database, Executor } from './_db/client.js';
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

async function route(req: Req, res: Res): Promise<void> {
  const q = param(req, 'q');
  const write = req.method === 'POST' && q !== undefined && Object.hasOwn(WRITES, q) ? WRITES[q] : null;
  if (req.method !== 'GET' && !write) throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const uid = (await sessionOf(req.headers))?.id ?? null;
  if (!uid) throw new ApiError(401, 'unauthorized');

  const store = database();
  const { db } = store;
  const admin = await dbRead(() => read.isAdmin(db, uid));
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
 * 게스트 계정은 비밀번호가 없어 409, 인증 계정이 없으면 404다.
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
    await insertPasswordResetToken(tx, userId, token, expiresAt);
    await recordAdminAction(tx, userId, 'adminResetLink', adminId, { expiresAt });
    return found;
  }));
  if (kind === 'missing') throw new ApiError(404, 'no-user');
  if (kind === 'anonymous') throw new ApiError(409, 'anonymous-user');
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
