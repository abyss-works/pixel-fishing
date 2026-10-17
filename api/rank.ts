// 랭킹 읽기 함수 — 명성·도감 완성도·어종별 크기의 공개 순위 (Vercel Function, Node 런타임)
// 다른 사용자의 기록을 공개하는 유일한 경로다. 브라우저가 다른 사용자의 행을 직접 읽지 않는다.
// 세션 토큰이 있으면 내 순위를 함께 돌려주고, 없으면 상위 목록만 돌려주며 짧게 공유 캐시한다.
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다. default export = Node 시그니처.
import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { bearerToken, verifyJwtLocal } from './_auth/session.js';
import { database } from './_db/client.js';
import { dexBoard, fameBoard, speciesBoard } from './_data/rank.js';
import { FISH } from '../src/game/rules/logic.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { query?: Record<string, string | string[] | undefined> };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

const BOARDS = ['fame', 'dex', 'species'] as const;
type Board = typeof BOARDS[number];
const isBoard = (v: unknown): v is Board => typeof v === 'string' && (BOARDS as readonly string[]).includes(v);

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
  const fish = req.query?.fish;
  if (board === 'species' && !(typeof fish === 'string' && FISH.some(f => f.id === fish))) throw new ApiError(400, 'bad-fish');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  // 토큰이 있으면 내 순위를 위해 사용자를 확인한다. 잘못된 토큰은 익명으로 넘기지 않고 거부한다
  const token = bearerToken(req.headers.authorization);
  const uid = token ? await userOf(token) : null;
  if (token && !uid) throw new ApiError(401, 'unauthorized');

  const { db } = database();
  const body = board === 'species'
    ? { board, fishId: fish, ...await read(() => speciesBoard(db, fish as string, uid)) }
    : { board, ...await read(() => (board === 'fame' ? fameBoard : dexBoard)(db, uid)) };

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

/** 토큰의 사용자 — JWT secret이 있으면 로컬 검증(왕복 0), 없으면 인증 서버 조회 */
async function userOf(token: string): Promise<string | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) return verifyJwtLocal(token, secret);
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new ApiError(500, 'server-config');
  const { data, error } = await createClient(url, serviceKey, { auth: { persistSession: false } }).auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}
