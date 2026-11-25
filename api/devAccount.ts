// 스테이징·로컬 전용 개발 계정 도구 — 원클릭 테스트 정식 계정 승격과 현재 계정 초기 상태 되돌리기 (Node 런타임).
// 운영(production) 및 미설정 환경에서는 항상 404로 차단한다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { newState } from '../src/game/rules/logic.js';
import { adminSessionUid, refreshAppSessionCookies, sessionOf } from './_auth/session.js';
import { promoteGuestToTestAccount } from './_data/account.js';
import { counterClearFragment } from './_data/achievements.js';
import { isAdmin } from './_data/admin.js';
import { bountyClearAllFragments } from './_data/bounty.js';
import { ALWAYS_GUARD, resetAccountSaveFragments } from './_data/save.js';
import { database } from './_db/client.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

const PROMOTE_PATH = '/api/dev/promote-test';
const RESET_PATH = '/api/dev/reset-account';

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
  const deployEnv = process.env.DEPLOY_ENV;
  if (deployEnv !== 'preview' && deployEnv !== 'local') {
    throw new ApiError(404, 'not-found');
  }

  const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '');
  if (path !== PROMOTE_PATH && path !== RESET_PATH) {
    throw new ApiError(404, 'not-found');
  }
  if (req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');
  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');

  const { db, withTransaction } = database();
  if (deployEnv === 'preview') {
    const adminUid = await adminSessionUid(req.headers);
    if (!adminUid || !await isAdmin(db, adminUid)) {
      throw new ApiError(403, 'forbidden');
    }
  }

  const user = await sessionOf(req.headers);
  if (!user) throw new ApiError(401, 'unauthorized');
  const uid = user.id;

  if (path === PROMOTE_PATH) {
    const outcome = await promoteGuestToTestAccount(withTransaction, uid).catch(e => {
      throw new ApiError(500, 'db-write', { uid }, { cause: e });
    });
    if (outcome.status === 'missing') throw new ApiError(404, 'account-missing');
    if (outcome.status === 'not-guest') throw new ApiError(409, 'not-guest');

    const cookies = await refreshAppSessionCookies(req.headers);
    if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
    res.status(200).json({ ok: true, email: outcome.email, isAnonymous: false });
    return;
  }

  const initial = newState();
  const nowISO = new Date().toISOString();
  const { upsertSave, clears } = resetAccountSaveFragments(uid, initial, nowISO);
  const fragments = [...clears, ...bountyClearAllFragments(uid), counterClearFragment(ALWAYS_GUARD, uid)];
  const version = await withTransaction(async tx => {
    const { rows } = await tx.execute<{ version: string | number }>(upsertSave);
    for (const frag of fragments) {
      if (frag) await tx.execute(frag);
    }
    return Number(rows[0].version);
  }).catch(e => {
    throw new ApiError(500, 'db-write', { uid }, { cause: e });
  });

  res.status(200).json({ state: initial, version });
}
