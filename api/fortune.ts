// 일일 운세 이력 조회 함수 — 로그인 계정의 지난주 월요일 이후 운세 이력과 오늘 운세를 돌려준다 (Node 런타임)
// 계정 유저만 쓴다(게스트 제외 — 403 account-only).
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export = Node 시그니처.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { loadFortuneHistory } from './_data/fortune.js';
import { gameDayOf } from '../src/game/rules/time.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

/** 기준 게임 날짜가 속한 주의 직전 주 월요일(YYYY-MM-DD)을 돌려준다 */
export function fortuneSinceDay(currentDay: string): string {
  const date = new Date(`${currentDay}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - (daysSinceMonday + 7));
  return date.toISOString().slice(0, 10);
}

async function run<T>(code: 'db-read', work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw new ApiError(500, code, {}, { cause: e });
  }
}

export default async function handler(req: IncomingMessage, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
    if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
    const session = await sessionOf(req.headers);
    if (!session) throw new ApiError(401, 'unauthorized');
    if (session.email === null) throw new ApiError(403, 'account-only');

    const { db } = database();
    const currentDay = gameDayOf(new Date().toISOString());
    const sinceDay = fortuneSinceDay(currentDay);
    const history = await run('db-read', () => loadFortuneHistory(db, session.id, sinceDay));
    const today = history.find(item => item.day === currentDay) ?? null;
    res.status(200).json({ today, history, currentDay });
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code });
  }
}
