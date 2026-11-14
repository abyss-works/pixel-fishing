// 개발 도구 계열(이사 코드 import, debug 명령, 강제 조우, 프로필의 개발 도구 판정)의 허용 판정.
// 요청 헤더를 읽지 않고 서버 환경(DEPLOY_ENV)과 호출자 계정만 본다. 정책 표(이 모듈이 유일한 지점):
// production은 관리자 명부에 있어도 거부, preview는 명부에 있는 정식 계정만, local은 모두 허용하고,
// 설정이 없거나 모르는 값은 거부한다. 게스트는 명부에 올라 있어도 거부한다.
import type { Executor } from './_db/client.js';
import { isAdmin } from './_data/admin.js';
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
 * 호출자가 관리자 명부에 있는 정식 계정인가. 게스트는 명부를 조회하지 않고 아니다.
 * 명부 조회는 preview에서만 한다 — 그 밖의 환경은 결과가 명부와 무관하다.
 */
export async function isListedAdmin(db: Executor, user: SessionUser, deployEnv: string | undefined): Promise<boolean> {
  if (deployEnv !== 'preview' || user.email === null) return false;
  return isAdmin(db, user.id);
}

/** 호출자가 개발 도구를 쓸 수 있는가 — 프로필 응답의 판정이다 */
export async function devToolsGranted(db: Executor, user: SessionUser, deployEnv: string | undefined): Promise<boolean> {
  return devGateVerdict({ deployEnv, admin: await isListedAdmin(db, user, deployEnv) }) === 'ok';
}
