// 계정 함수 — 플레이어 본인의 계정 정보 조회와 탈퇴 (Node 런타임)
//   GET  /api/account                  계정의 약관 상태 { consent: { required, version, effectiveAt } }. 게스트도 읽는다
//   POST /api/account { op: 'delete' } 탈퇴
// 탈퇴는 계정의 공개 표 행과 인증 계정을 한 트랜잭션에서 지운다. 관리자 계정은 거부한다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { database } from './_db/client.js';
import { consentPolicy } from './_auth/consentPolicy.js';
import { deleteOwnAccount } from './_data/account.js';
import { consentStatus } from './_data/consent.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

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
  if (req.method !== 'POST' && req.method !== 'GET') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const session = await sessionOf(req.headers);
  if (!session) throw new ApiError(401, 'unauthorized');
  const uid = session.id;
  if (req.method === 'GET') {
    let consent;
    try {
      consent = await consentStatus(database().db, session, consentPolicy(), new Date());
    } catch (e) {
      throw new ApiError(500, 'db-read', { uid }, { cause: e });
    }
    res.status(200).json({ consent });
    return;
  }
  // 본문에 탈퇴 요청을 명시해야 지운다. 다른 요청이 잘못 이 경로로 와도 계정이 지워지지 않는다
  if ((req.body as { op?: unknown } | null)?.op !== 'delete') throw new ApiError(400, 'bad-request');

  const { withTransaction } = database();
  let outcome;
  try {
    outcome = await deleteOwnAccount(withTransaction, uid);
  } catch (e) {
    throw new ApiError(500, 'db-write', { uid }, { cause: e });
  }
  if (outcome === 'admin') throw new ApiError(403, 'admin-account');
  if (outcome === 'missing') throw new ApiError(404, 'account-missing');
  res.status(200).json({ deleted: true });
}
