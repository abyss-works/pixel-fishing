// 약관 수락 함수 — 확인 화면에서 현재 판의 약관과 개인정보 처리방침 수락을 기록한다 (Node 런타임)
//   POST /api/account/consents { version, ageConfirmed: true }
// 요청의 판이 서버의 현재 판과 같을 때만 받는다(다르면 409 consent-version-mismatch). 게스트는 403 account-only로 거부한다.
// 같은 판을 다시 요청해도 성공하고 처음 기록을 바꾸지 않는다. 응답은 수락 뒤의 약관 상태다.
//
// 주의: 시그니처는 Node 스타일(req, res)만 쓴다. default export가 Node 시그니처다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { consentPolicy } from './_auth/consentPolicy.js';
import { sessionOf } from './_auth/session.js';
import { consentStatus, recordConsent } from './_data/consent.js';
import { database } from './_db/client.js';
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
  if (req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const session = await sessionOf(req.headers);
  if (!session) throw new ApiError(401, 'unauthorized');
  if (session.email === null) throw new ApiError(403, 'account-only');

  const body = req.body as { version?: unknown; ageConfirmed?: unknown } | null | undefined;
  if (typeof body?.version !== 'string' || body.ageConfirmed !== true) throw new ApiError(400, 'bad-request');
  const policy = consentPolicy();
  if (body.version !== policy.version) throw new ApiError(409, 'consent-version-mismatch');

  const { db } = database();
  try {
    await recordConsent(db, session.id, policy.version, 'confirm-screen');
    res.status(200).json({ consent: await consentStatus(db, session, policy, new Date()) });
  } catch (e) {
    throw new ApiError(500, 'db-write', { uid: session.id }, { cause: e });
  }
}
