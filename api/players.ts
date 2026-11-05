// 공개 프로필 읽기 함수 — 다른 플레이어의 닉네임·배·명성·도감 수를 읽는다 (Node 런타임)
// 세션이 있으면 게스트도 읽는다. 순위·가방 같은 그 밖의 상태는 주지 않는다.
//   GET /api/players/:uid   { nickname, boat, fame, dex, account }
//   오류: 세션 없음 401, 형식이 틀린 uid 400 bad-user, 없는 사용자 404 not-found
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { publicProfile } from './_data/profile.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { params?: Record<string, string | undefined> };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  if (!await sessionOf(req.headers)) throw new ApiError(401, 'unauthorized');
  const uid = req.params?.uid;
  if (typeof uid !== 'string' || !UUID.test(uid)) throw new ApiError(400, 'bad-user');

  let profile;
  try {
    profile = await publicProfile(database().db, uid);
  } catch (e) {
    throw new ApiError(500, 'db-read', { uid }, { cause: e });
  }
  if (!profile) throw new ApiError(404, 'not-found');
  res.status(200).json(profile);
}
