// 본인 읽기 함수 — 로그인한 사용자 자신의 게임 상태·수배·프로필을 서버가 대신 읽는다 (Node 런타임)
// 브라우저는 표를 직접 읽지 않는다. q로 읽을 묶음을 고른다.
//   q=state   저장 상태와 개체·도감. 저장 상태가 없으면 구 저장의 최신 본문(legacy)을 함께 준다(첫 액션 전 이관 폴백).
//   q=bounty  오늘(게임 날짜)의 클리어와 수배 진행·도전권
//   q=profile 닉네임과 개발 도구 판정(devTools)
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다. default export = Node 시그니처.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { devToolsGranted } from './devAccess.js';
import { database } from './_db/client.js';
import { readOwnBounty, readOwnProfile, readOwnState } from './_data/me.js';
import { gameDayStartISO } from '../src/game/rules/time.js';
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
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  const user = await sessionOf(req.headers);
  if (!user) throw new ApiError(401, 'unauthorized');
  const uid = user.id;

  const { db } = database();
  const read = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (e) {
      throw new ApiError(500, 'db-read', { uid }, { cause: e });
    }
  };
  const q = req.query?.q;
  let body: unknown;
  if (q === 'state') body = await read(() => readOwnState(db, uid));
  else if (q === 'bounty') body = await read(() => readOwnBounty(db, uid, gameDayStartISO(new Date().toISOString())));
  else if (q === 'profile') {
    body = await read(async () => ({
      ...await readOwnProfile(db, uid), devTools: await devToolsGranted(db, user, process.env.DEPLOY_ENV),
    }));
  }
  else throw new ApiError(400, 'bad-query');

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json(body);
}
