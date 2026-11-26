// 일일 운세 이력 조회 함수 — 로그인 계정의 요청 월(YYYY-MM) 운세 이력과 최초 기록 월, 오늘 운세를 돌려준다 (Node 런타임)
// 계정 유저만 쓴다(게스트 제외 — 403 account-only).
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export = Node 시그니처.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { loadFortuneMonth } from './_data/fortune.js';
import { gameDayOf } from '../src/game/rules/time.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { query?: Record<string, string | string[] | undefined> };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** 요청의 month 파라미터(미지정 시 currentDay의 YYYY-MM)를 검증해 YYYY-MM을 돌려주고, 잘못되면 null을 돌려준다 */
export function parseFortuneMonth(raw: unknown, currentDay: string): string | null {
  if (raw === undefined) return currentDay.slice(0, 7);
  if (typeof raw !== 'string') return null;
  const match = MONTH_PATTERN.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || month < 1 || month > 12) return null;
  return raw;
}

/** YYYY-MM 월의 시작일(포함)과 다음 달 시작일(미포함, 9999-12는 null)을 돌려준다 */
export function fortuneMonthRange(month: string): { fromDay: string; toDay: string | null } {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const fromDay = `${month}-01`;
  if (year === 9999 && m === 12) return { fromDay, toDay: null };
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  return {
    fromDay,
    toDay: `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`,
  };
}

async function run<T>(code: 'db-read', work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw new ApiError(500, code, {}, { cause: e });
  }
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
    const currentDay = gameDayOf(new Date().toISOString());
    const month = parseFortuneMonth(req.query?.month, currentDay);
    if (!month) throw new ApiError(400, 'bad-month');
    if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
    const session = await sessionOf(req.headers);
    if (!session) throw new ApiError(401, 'unauthorized');
    if (session.email === null) throw new ApiError(403, 'account-only');

    const { db } = database();
    const { fromDay, toDay } = fortuneMonthRange(month);
    const { firstMonth, today, days, discovered } = await run('db-read', () => loadFortuneMonth(db, session.id, fromDay, toDay, currentDay));
    res.status(200).json({ month, firstMonth, currentDay, today, days, discovered });
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code });
  }
}
