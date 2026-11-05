// 마지막 위치 읽기 함수 — 로그인한 사용자가 바다 지역 안에서 마지막으로 있던 자리를 돌려준다 (Node 런타임)
//   GET /api/me/position   { position: { region, x, y } | null }
// 쓰기는 실시간 채널이 맡는다. 게스트도 바다에 나가므로 세션만 있으면 된다.
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다. default export = Node 시그니처.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { readLastPosition } from './_data/position.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

export default async function handler(req: IncomingMessage, res: Res): Promise<void> {
  try {
    await route(req, res);
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code });
  }
}

async function route(req: IncomingMessage, res: Res): Promise<void> {
  if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  const uid = (await sessionOf(req.headers))?.id ?? null;
  if (!uid) throw new ApiError(401, 'unauthorized');

  let position;
  try {
    position = await readLastPosition(database().db, uid);
  } catch (e) {
    throw new ApiError(500, 'db-read', { uid }, { cause: e });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({ position });
}
