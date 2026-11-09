// 미리 만들어 둔 익명 계정의 세션. 인증 서버는 로그인 요청을 IP당 10초 3회로 제한하므로(운영 모드),
// 실행 중에 계정을 만들지 않고 한도 안의 속도로 미리 만들어 세션 쿠키를 파일에 둔다. 제한을 우회하지 않는다.
// 세션 쿠키는 비밀값이다. 파일은 저장소 밖이나 .gitignore에 걸리는 위치에만 둔다.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { guardedFetch } from './http';

export interface Account { cookie: string }
export interface AccountsFile { target: string; accounts: Account[] }

// 로그인 제한: 같은 IP의 로그인 요청은 마지막으로 허용된 요청에서 10초가 지나야 개수가 초기화되고, 그 전에는 3번째까지만 허용한다.
// 그래서 일정한 간격으로 만들지 않고, 한 묶음(2개, 한도 3개에 여유 1개)을 짧은 간격으로 만든 뒤 창이 지나도록 쉰다.
export const SIGNUP_BATCH = 2;
export const SIGNUP_GAP_MS = 1000;
export const SIGNUP_PAUSE_MS = 10_500;

/** made개를 만든 직후 다음 계정을 만들기까지의 대기 */
export const signupDelayMs = (made: number): number => (made % SIGNUP_BATCH === 0 ? SIGNUP_PAUSE_MS : SIGNUP_GAP_MS);

/** count개를 만드는 데 걸리는 대기 시간(초). 요청 시간은 뺀 값이다 */
export function estimateSignupSeconds(count: number): number {
  let ms = 0;
  for (let made = 1; made < count; made++) ms += signupDelayMs(made);
  return ms / 1000;
}

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

const git = (dir: string, args: string[]): { ok: boolean; out: string } => {
  try { return { ok: true, out: execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }; } catch { return { ok: false, out: '' }; }
};

const nearestExistingDir = (dir: string): string => (existsSync(dir) || dirname(dir) === dir ? dir : nearestExistingDir(dirname(dir)));

/**
 * 세션 파일 경로 검사. 파일이 놓일 폴더(없으면 가장 가까운 상위)가 어떤 Git 작업 트리 안이면 .gitignore에 걸리는 경로만 허용한다.
 * 현재 작업 디렉터리의 저장소가 아니라 대상 경로가 속한 저장소를 기준으로 본다. 어느 작업 트리에도 속하지 않으면 허용한다
 */
export function assertSecretPath(path: string): void {
  const abs = resolve(path);
  const dir = nearestExistingDir(dirname(abs));
  if (!git(dir, ['rev-parse', '--show-toplevel']).ok) return;
  if (!git(dir, ['check-ignore', '-q', '--', abs]).ok) {
    throw new Error('세션 파일은 비밀값입니다. 저장소 밖이나 .gitignore에 걸리는 경로에 두세요');
  }
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
