// 공개 프로필 읽기 함수 — 다른 플레이어의 닉네임·배·낚싯대·명성·도감·유물을 읽는다 (Node 런타임)
// 세션이 있으면 게스트도 읽는다. 순위·가방 같은 그 밖의 상태는 주지 않는다.
//   GET /api/players/:uid   { nickname, boat, rod, fame, dexFish, artifacts, account }
//   오류: 세션 없음 401, 형식이 틀린 uid 400 bad-user, 없는 사용자 404 not-found
//   GET /api/players?nickname=<앞부분>   { players: [{ uid, nickname }] } — 친구 요청 자동완성. 계정 유저만 쓴다
//   오류: 세션 없음 401, 게스트 403 account-only, 빈 검색어·32자 초과 400 bad-nickname
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { publicProfile } from './_data/profile.js';
import { searchAccounts } from './_data/friends.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { params?: Record<string, string | undefined>; query?: Record<string, unknown> };

/** 자동완성 후보 수 */
const SEARCH_LIMIT = 8;
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
  const session = await sessionOf(req.headers);
  if (!session) throw new ApiError(401, 'unauthorized');
  const uid = req.params?.uid;
  if (uid === undefined) {
    if (session.email === null) throw new ApiError(403, 'account-only');
    const raw = req.query?.nickname;
    const prefix = typeof raw === 'string' ? raw.trim() : '';
    if (prefix.length < 1 || prefix.length > 32) throw new ApiError(400, 'bad-nickname');
    let players;
    try {
      players = await searchAccounts(database().db, session.id, prefix, SEARCH_LIMIT);
    } catch (e) {
      throw new ApiError(500, 'db-read', undefined, { cause: e });
    }
    res.status(200).json({ players });
    return;
  }
  if (typeof uid !== 'string' || !UUID.test(uid)) throw new ApiError(400, 'bad-user');

  let profile;
  try {
    profile = await publicProfile(database().db, uid);
  } catch (e) {
    throw new ApiError(500, 'db-read', { uid }, { cause: e });
  }
  // 게스트의 프로필은 본인만 읽는다
  if (!profile || (!profile.account && uid !== session.id)) throw new ApiError(404, 'not-found');
  res.status(200).json(profile);
}
