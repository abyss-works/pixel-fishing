// 우편함 함수 — 플레이어 본인의 우편 목록과 읽음 기록 (Vercel Function, Node 런타임)
// 브라우저는 우편 표를 직접 읽지 않는다. 골드 받기는 게임 액션(claimMail)이 맡는다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { bearerToken, userOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { listMails, markMailRead } from './_data/mailbox.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

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

async function route(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const token = bearerToken(req.headers.authorization);
  const uid = token ? await userOf(token) : null;
  if (!uid) throw new ApiError(401, 'unauthorized');
  const { db } = database();

  if (req.method === 'GET') {
    res.status(200).json({ mails: await run('db-read', () => listMails(db, uid)) });
    return;
  }
  // 읽음 기록 — 처음 열어 본 시각만 남긴다
  const id = (req.body as { id?: unknown } | null)?.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'bad-id');
  await run('db-write', () => markMailRead(db, uid, id, new Date().toISOString()));
  res.status(200).json({ ok: true });
}

async function run<T>(code: 'db-read' | 'db-write', work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw new ApiError(500, code, {}, { cause: e });
  }
}
