// 개발 도구 계열(이사 코드 import, debug 명령, 강제 조우, 프로필의 개발 도구 판정)의 허용 판정.
// 요청 Origin 헤더를 읽지 않고 서버 환경(DEPLOY_ENV), 게임 세션, 스테이징 진입 관리자 세션만 본다. 정책 표:
// production은 관리자 명부에 있어도 거부, preview는 명부에 있는 정식 계정 또는 관리자 OAuth 세션 쿠키를 동반한 세션만,
// local은 모두 허용하고, 설정이 없거나 모르는 값은 거부한다.
import type { IncomingHttpHeaders } from 'node:http';
import type { Executor } from './_db/client.js';
import { isAdmin } from './_data/admin.js';
import { adminSessionUid } from './_auth/session.js';
import type { SessionUser } from './_auth/session.js';

export function devGateVerdict({ deployEnv, admin }: {
  deployEnv: string | undefined; admin: boolean;
}): 'ok' | 'admin-only' | 'disabled' {
  if (deployEnv === 'local') return 'ok';
  if (deployEnv === 'preview') return admin ? 'ok' : 'admin-only';
  return 'disabled';
}

/** 이사 코드 import 허용 판정. 거부 사유는 응답 코드로 돌려준다 */
export function importVerdict(args: {
  deployEnv: string | undefined; admin: boolean;
}): 'ok' | 'import-owner-only' | 'import-disabled' {
  const verdict = devGateVerdict(args);
  return verdict === 'ok' ? 'ok' : verdict === 'admin-only' ? 'import-owner-only' : 'import-disabled';
}

/** debug 명령과 강제 조우의 허용 판정 */
export function debugTriggerAllowed(args: { deployEnv: string | undefined; admin: boolean }): boolean {
  return devGateVerdict(args) === 'ok';
}

/**
 * 호출자가 관리자 명부에 있는 정식 계정인가, 또는 스테이징 진입 관리자 OAuth 쿠키를 동반했는가.
 * 명부 조회는 preview에서만 한다 — 그 밖의 환경은 결과가 명부와 무관하다.
 */
export async function isListedAdmin(
  db: Executor,
  user: SessionUser,
  deployEnv: string | undefined,
  headers?: IncomingHttpHeaders,
): Promise<boolean> {
  if (deployEnv !== 'preview') return false;
  if (user.email !== null && await isAdmin(db, user.id)) return true;
  if (!headers?.cookie) return false;
  const adminUid = await adminSessionUid(headers);
  return adminUid !== null && await isAdmin(db, adminUid);
}

/** 호출자가 개발 도구를 쓸 수 있는가 — 프로필 응답의 판정이다 */
export async function devToolsGranted(
  db: Executor,
  user: SessionUser,
  deployEnv: string | undefined,
  headers?: IncomingHttpHeaders,
): Promise<boolean> {
  return devGateVerdict({ deployEnv, admin: await isListedAdmin(db, user, deployEnv, headers) }) === 'ok';
}
