// 채팅 함수 — 개인 차단 목록과 채팅 신고 (Node 런타임)
// 채팅 쓰기와 받기는 실시간 채널이 맡는다. 차단과 신고는 계정(이메일) 유저만 할 수 있다.
//   GET    /api/blocks                      → { blocks: { uid, nick }[] }  내가 차단한 사람
//   PUT    /api/blocks/:uid                 → { blocks }                    차단(친구 관계도 끊는다)
//   DELETE /api/blocks/:uid                 → { blocks }                    차단 해제
//   POST   /api/chat/messages/:id/reports   → { reported: true }            메시지 신고(같은 메시지 재신고는 한 건)
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. 경로 변수는 Express가 req.params로 넘긴다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import type { Executor } from './_db/client.js';
import { isForeignKeyViolation } from './_db/errors.js';
import { block, blockedIds, blockedUsers, unblock } from './_data/blocks.js';
import { reportChat } from './_data/chat.js';
import { removeFriend } from './_data/friends.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { body?: unknown; params?: Record<string, string | undefined> };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };
type NodeHandler = (req: Req, res: Res) => Promise<void>;

/** 차단 목록이 바뀐 뒤 부른다. 실시간 채널이 그 사용자의 채팅 거르기를 갱신한다 */
export type BlocksChanged = (uid: string, ids: readonly string[]) => void;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 응답·오류 처리를 감싼다 */
function handle(route: (req: Req, res: Res) => Promise<void>): NodeHandler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      await route(req, res);
    } catch (e) {
      const err = toApiError(e);
      if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
      res.status(err.status).json({ error: err.code });
    }
  };
}

/** 계정 유저의 세션. 게스트는 403이다 */
async function memberOf(req: Req): Promise<string> {
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  const session = await sessionOf(req.headers);
  if (!session) throw new ApiError(401, 'unauthorized');
  if (session.email === null) throw new ApiError(403, 'account-only');
  return session.id;
}

/** /api/blocks와 /api/blocks/:uid */
export function blocksHandler(blocksChanged: BlocksChanged): NodeHandler {
  return handle(async (req, res) => {
    const target = req.params?.uid;
    const allowed = target === undefined ? ['GET'] : ['PUT', 'DELETE'];
    if (!allowed.includes(req.method ?? '')) throw new ApiError(405, 'method-not-allowed');
    const uid = await memberOf(req);
    const { db } = database();
    if (target !== undefined) {
      if (!UUID.test(target) || target === uid) throw new ApiError(400, 'bad-user');
      await changeBlock(db, uid, target, req.method === 'PUT' ? 'block' : 'unblock');
      blocksChanged(uid, await run('db-read', () => blockedIds(db, uid)));
    }
    res.status(200).json({ blocks: await run('db-read', () => blockedUsers(db, uid)) });
  });
}

/** POST /api/chat/messages/:id/reports */
export const chatReportHandler: NodeHandler = handle(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');
  const uid = await memberOf(req);
  const raw = req.params?.id ?? '';
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'bad-id');
  const { db } = database();
  const found = await run('db-write', () => reportChat(db, uid, id, new Date().toISOString()));
  if (!found) throw new ApiError(404, 'chat-missing');
  res.status(200).json({ reported: true });
});

/**
 * 차단하거나 푼다. 차단하면 두 사람 사이의 친구 관계와 요청도 지운다(차단 목록은 하나, `friends.md`).
 * 없는 계정을 차단하면 404다.
 */
async function changeBlock(db: Executor, uid: string, target: string, op: 'block' | 'unblock'): Promise<void> {
  try {
    if (op === 'block') {
      await block(db, uid, target);
      await removeFriend(db, uid, target);
    } else {
      await unblock(db, uid, target);
    }
  } catch (e) {
    if (isForeignKeyViolation(e)) throw new ApiError(404, 'user-missing');
    throw new ApiError(500, 'db-write', {}, { cause: e });
  }
}

async function run<T>(code: 'db-read' | 'db-write', work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw new ApiError(500, code, {}, { cause: e });
  }
}
