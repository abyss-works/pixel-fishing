// 랭킹 읽기 함수 — 명성·도감 완성도·네임드 토벌·어종별 크기의 공개 순위 (Node 런타임)
// 다른 사용자의 기록을 공개하는 유일한 경로다. 브라우저가 다른 사용자의 행을 직접 읽지 않는다.
// 세션 토큰이 있으면 내 순위를 함께 돌려주고, 없으면 상위 목록만 돌려주며 짧게 공유 캐시한다.
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다. default export = Node 시그니처.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import type { Executor } from './_db/client.js';
import { dexBoard, fameBoard, namedBoard, namedClearsBoard, sellGoldBoard, speciesBoard, variantBoard } from './_data/rank.js';
import type { RankBoard, RankWindow } from './_data/rank.js';
import { FISH } from '../src/game/rules/logic.js';
import { gameWeekStartDay, isValidGameWeekStartDay } from '../src/game/rules/time.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { query?: Record<string, string | string[] | undefined> };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

const BOARDS = ['fame', 'sellGold', 'dex', 'variant', 'named', 'namedClears', 'species'] as const;
type Board = typeof BOARDS[number];
const PERIOD_RANK_BOARDS = new Set<Board>(['fame', 'sellGold', 'namedClears']);
const WINDOWS = ['weekly', 'all'] as const;
const isBoard = (v: unknown): v is Board => typeof v === 'string' && (BOARDS as readonly string[]).includes(v);
const isWindow = (v: unknown): v is RankWindow => typeof v === 'string' && (WINDOWS as readonly string[]).includes(v);

const STATIC_BOARD_READERS: Record<'dex' | 'variant' | 'named', (db: Executor, uid: string | null) => Promise<RankBoard>> = {
  dex: dexBoard,
  variant: variantBoard,
  named: namedBoard,
};

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
  const board = req.query?.board;
  if (!isBoard(board)) throw new ApiError(400, 'bad-board');
  const rawWindow = req.query?.window;
  if (rawWindow !== undefined && !isWindow(rawWindow)) throw new ApiError(400, 'bad-window');
  const nowIso = new Date().toISOString();
  const rawWeek = req.query?.week;
  if (rawWeek !== undefined) {
    if (typeof rawWeek !== 'string' || !isValidGameWeekStartDay(rawWeek) || rawWeek > gameWeekStartDay(nowIso)) {
      throw new ApiError(400, 'bad-week');
    }
  }
  const fish = req.query?.fish;
  if (board === 'species' && !(typeof fish === 'string' && FISH.some(f => f.id === fish))) throw new ApiError(400, 'bad-fish');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  // 로그인 세션이 있으면 내 순위를 함께 준다
  const uid = (await sessionOf(req.headers))?.id ?? null;
  const resolvedWindow: RankWindow = PERIOD_RANK_BOARDS.has(board) ? (rawWindow ?? 'weekly') : 'all';

  const { db } = database();
  let data: RankBoard;
  if (board === 'species') {
    data = await read(() => speciesBoard(db, fish as string, uid));
  } else if (board === 'fame') {
    data = await read(() => fameBoard(db, uid, resolvedWindow, nowIso, rawWeek));
  } else if (board === 'sellGold') {
    data = await read(() => sellGoldBoard(db, uid, resolvedWindow, nowIso, rawWeek));
  } else if (board === 'namedClears') {
    data = await read(() => namedClearsBoard(db, uid, resolvedWindow, nowIso, rawWeek));
  } else {
    data = await read(() => STATIC_BOARD_READERS[board](db, uid));
  }
  const body = board === 'species' ? { board, fishId: fish, ...data } : { board, ...data };

  res.setHeader('Cache-Control', uid ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).json(body);
}

async function read<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw new ApiError(500, 'db-read', {}, { cause: e });
  }
}
