// 라이브 이벤트 스냅샷 조회 핸들러(GET /api/events, Node 런타임).
// 비로그인은 401, 게스트는 활성 요약 목록만 반환하고 개인 진행·순위·당첨 PIN은 숨긴다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export = Node 시그니처.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { loadEventsSnapshot } from './_data/events.js';
import { database } from './_db/client.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage;
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
    if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
    const session = await sessionOf(req.headers);
    if (!session) throw new ApiError(401, 'unauthorized');

    const { db } = database();
    const nowISO = new Date().toISOString();
    let snapshot;
    try {
      snapshot = await loadEventsSnapshot(db, session.id, session.email === null, nowISO);
    } catch (e) {
      throw new ApiError(500, 'db-read', {}, { cause: e });
    }
    res.status(200).json(snapshot);
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code });
  }
}
