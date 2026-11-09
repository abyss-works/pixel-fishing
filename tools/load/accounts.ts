// 미리 만들어 둔 익명 계정의 세션. 인증 서버는 로그인 요청을 IP당 10초 3회로 제한하므로(운영 모드),
// 실행 중에 계정을 만들지 않고 한도 안의 속도로 미리 만들어 세션 쿠키를 파일에 둔다. 제한을 우회하지 않는다.
// 세션 쿠키는 비밀값이다. 파일은 저장소 밖이나 .gitignore에 걸리는 위치에만 둔다.
import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import { guardedFetch } from './http';

export interface Account { cookie: string }
export interface AccountsFile { target: string; accounts: Account[] }

/** 계정 하나를 만드는 간격. 10초 창에 최대 2개(한도 3개에 여유 1개) */
export const SIGNUP_INTERVAL_MS = 5500;
/** 한도에 걸렸을 때 다음 시도까지의 대기. 창(10초)보다 길다 */
export const LIMITED_WAIT_MS = 11_000;

export const signupsNeeded = (have: number, want: number): number => Math.max(0, want - have);

export function parseAccountsFile(raw: string): AccountsFile {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('계정 파일 형식이 올바르지 않습니다'); }
  const o = data as { target?: unknown; accounts?: unknown } | null;
  if (typeof o?.target !== 'string' || !Array.isArray(o.accounts)) throw new Error('계정 파일 형식이 올바르지 않습니다');
  const accounts = o.accounts.map((a: { cookie?: unknown }) => {
    if (typeof a?.cookie !== 'string' || a.cookie === '') throw new Error('계정 파일에 쿠키가 없는 항목이 있습니다');
    return { cookie: a.cookie };
  });
  return { target: o.target, accounts };
}

/** 실행에 쓸 계정을 앞에서부터 count개 고른다. 다른 대상의 계정이나 모자란 수는 거부한다 */
export function usableAccounts(file: AccountsFile, target: string, count: number): Account[] {
  if (file.target !== target) throw new Error(`계정 파일의 대상(${file.target})이 --target과 다릅니다`);
  if (file.accounts.length < count) {
    throw new Error(`계정이 ${file.accounts.length}개뿐입니다. ${count}개가 필요합니다. pnpm load:accounts로 더 만드세요`);
  }
  return file.accounts.slice(0, count);
}

const gitIgnored = (path: string): boolean => {
  try { execFileSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' }); return true; } catch { return false; }
};

/** 세션 파일 경로 검사. 저장소 안이면 .gitignore에 걸리는 경로만 허용한다 */
export function assertSecretPath(path: string, repoRoot: string, isIgnored: (p: string) => boolean = gitIgnored): void {
  const rel = relative(repoRoot, resolve(path));
  const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (inside && !isIgnored(path)) {
    throw new Error('세션 파일은 비밀값입니다. 저장소 밖이나 .gitignore에 걸리는 경로에 두세요');
  }
}

export function repoRootOf(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

/** 익명 계정을 만들고 세션 쿠키를 돌려준다. 호출 한 번에 요청 한 번이다 */
export async function signInAnonymous(origin: string): Promise<{ status: number; cookie: string }> {
  const res = await guardedFetch(`${origin}/api/auth/sign-in/anonymous`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  const cookie = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  await res.body?.cancel();
  return { status: res.status, cookie };
}
