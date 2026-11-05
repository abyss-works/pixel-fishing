// 채팅 함수 — 채팅 신고와 개인 차단 목록 (Node 런타임)
// 채팅 쓰기와 받기는 실시간 채널이 맡는다. 신고와 차단은 계정(이메일) 유저만 할 수 있다.
//   GET                         → { blocks: { uid, nick }[] }  내가 차단한 사람
//   POST { op: 'block', uid }   → { blocks }                    차단
//   POST { op: 'unblock', uid } → { blocks }                    차단 해제
//   POST { op: 'report', id }   → { reported: true }            메시지 신고(같은 메시지 재신고는 한 건)
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import type { Executor } from './_db/client.js';
import { isForeignKeyViolation } from './_db/errors.js';
import { block, blockedIds, blockedUsers, unblock } from './_data/blocks.js';
import { reportChat } from './_data/chat.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };
type NodeHandler = (req: Req, res: Res) => Promise<void>;

/** 차단 목록이 바뀐 뒤 부른다. 실시간 채널이 그 사용자의 채팅 거르기를 갱신한다 */
export type BlocksChanged = (uid: string, ids: readonly string[]) => void;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function chatHandler(blocksChanged: BlocksChanged): NodeHandler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      await route(req, res, blocksChanged);
    } catch (e) {
      const err = toApiError(e);
      if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
      res.status(err.status).json({ error: err.code });
    }
  };
}

async function route(req: Req, res: Res, blocksChanged: BlocksChanged): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const session = await sessionOf(req.headers);
  if (!session) throw new ApiError(401, 'unauthorized');
  if (session.email === null) throw new ApiError(403, 'guest');
  const uid = session.id;
  const { db } = database();

  if (req.method === 'GET') {
    res.status(200).json({ blocks: await run('db-read', () => blockedUsers(db, uid)) });
    return;
  }
  const body = (req.body ?? {}) as { op?: unknown; uid?: unknown; id?: unknown };
  if (body.op === 'report') {
    const id = body.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'bad-id');
    const found = await run('db-write', () => reportChat(db, uid, id, new Date().toISOString()));
    if (!found) throw new ApiError(404, 'chat-missing');
    res.status(200).json({ reported: true });
    return;
  }
  if (body.op !== 'block' && body.op !== 'unblock') throw new ApiError(400, 'bad-request');
  const target = body.uid;
  if (typeof target !== 'string' || !UUID.test(target) || target === uid) throw new ApiError(400, 'bad-user');
  await changeBlock(db, uid, target, body.op);
  blocksChanged(uid, await run('db-read', () => blockedIds(db, uid)));
  res.status(200).json({ blocks: await run('db-read', () => blockedUsers(db, uid)) });
}

/**
 * 차단하거나 푼다. 차단에 딸린 다른 관계 정리(예: 친구 관계 해제)는 이 함수에 더한다.
 * 없는 계정을 차단하면 404다.
 */
async function changeBlock(db: Executor, uid: string, target: string, op: 'block' | 'unblock'): Promise<void> {
  try {
    if (op === 'block') await block(db, uid, target);
    else await unblock(db, uid, target);
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
