// 방치 결과 보고 읽기 함수 — 자리를 비운 사이의 캐치·자동 방생 기록을 요약해 돌려준다 (Node 런타임)
// 브라우저는 떠나 있던 시간(awayMs)만 보낸다. 기간의 기준 시각은 서버 시계다(기기 시계 차이를 피한다).
// 게스트도 낚시하므로 세션만 있으면 된다.
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다. default export = Node 시그니처.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { awayEvents } from './_data/telemetry.js';
import { awayWindow, summarizeAway } from '../src/game/rules/away.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { query?: Record<string, string | string[] | undefined> };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    await route(req, res);
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code });
  }
}

async function route(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
  const raw = req.query?.awayMs;
  const window = typeof raw === 'string' && /^\d+$/.test(raw) ? awayWindow(Number(raw), new Date().toISOString()) : null;
  if (!window) throw new ApiError(400, 'bad-away-ms');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  const uid = (await sessionOf(req.headers))?.id ?? null;
  if (!uid) throw new ApiError(401, 'unauthorized');

  const { db } = database();
  let events;
  try {
    events = await awayEvents(db, uid, window.from, window.to);
  } catch (e) {
    throw new ApiError(500, 'db-read', { uid }, { cause: e });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json(summarizeAway(events, window));
}
