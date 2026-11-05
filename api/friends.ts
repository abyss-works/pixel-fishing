// 친구 함수 — 본인의 친구 목록과 요청·수락·삭제 (Node 런타임)
// 계정 유저만 쓴다(게스트 제외). 차단한 사이(어느 쪽이든)는 요청·수락할 수 없고, 상대가 없는 것처럼 답한다.
//   GET            친구·받은 요청·보낸 요청. 친구에게는 접속 여부와 지금 있는 바다를 붙인다
//   POST op=request  { nickname }  닉네임으로 찾아 요청한다. 상대가 먼저 요청했으면 바로 친구가 된다
//   POST op=accept   { uid }       받은 요청을 수락한다
//   POST op=remove   { uid }       친구 끊기·요청 거절·요청 취소
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { blockedEitherWay } from './_data/blocks.js';
import { acceptFriend, accountByNickname, listFriends, removeFriend, requestFriend } from './_data/friends.js';
import { presenceOf } from './_server/livePresence.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { body?: unknown };
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
  if (req.method !== 'GET' && req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const session = await sessionOf(req.headers);
  if (!session) throw new ApiError(401, 'unauthorized');
  if (session.email === null) throw new ApiError(403, 'account-only');
  const me = session.id;
  const { db } = database();

  if (req.method === 'GET') {
    const rows = await run('db-read', () => listFriends(db, me));
    const friends = rows.map(r => {
      const live = r.state === 'friend' ? presenceOf(r.uid) : null;
      return { ...r, online: live !== null, region: live?.region ?? null, zone: live?.zone ?? null };
    });
    res.status(200).json({ friends });
    return;
  }

  const body = (req.body ?? {}) as { op?: unknown; nickname?: unknown; uid?: unknown };
  const now = new Date().toISOString();
  if (body.op === 'request') {
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    if (nickname.length < 1 || nickname.length > 32) throw new ApiError(400, 'bad-nickname');
    const target = await run('db-read', () => accountByNickname(db, nickname));
    if (target === me) throw new ApiError(400, 'self');
    if (!target || await run('db-read', () => blockedEitherWay(db, me, target))) throw new ApiError(404, 'not-found');
    const result = await run('db-write', () => requestFriend(db, me, target, now));
    res.status(200).json({ result });
    return;
  }
  const other = typeof body.uid === 'string' && UUID.test(body.uid) ? body.uid : null;
  if (!other) throw new ApiError(400, 'bad-user');
  if (body.op === 'accept') {
    if (await run('db-read', () => blockedEitherWay(db, me, other))) throw new ApiError(404, 'not-found');
    if (!await run('db-write', () => acceptFriend(db, me, other, now))) throw new ApiError(404, 'not-found');
    res.status(200).json({ result: 'accepted' });
    return;
  }
  if (body.op === 'remove') {
    await run('db-write', () => removeFriend(db, me, other));
    res.status(200).json({ result: 'removed' });
    return;
  }
  throw new ApiError(400, 'bad-op');
}

async function run<T>(code: 'db-read' | 'db-write', work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw new ApiError(500, code, {}, { cause: e });
  }
}
