// 인증 — 같은 오리진의 /api/auth(Better Auth)에 쿠키 세션으로 붙는다.
// VITE_CLOUD가 '1'이 아니면 authClient = null → 게임은 로컬 저장만으로 정상 동작 (오프라인 모드).
import { createAuthClient } from 'better-auth/client';
import { anonymousClient } from 'better-auth/client/plugins';
import type { AuthResult } from '../api/types';

/** 서버(스테이징·운영)에 붙는 빌드인가 — 빌드 때 정해진다 */
export const isCloud = import.meta.env.VITE_CLOUD === '1';

export const authClient = isCloud
  ? createAuthClient({ basePath: '/api/auth', plugins: [anonymousClient()] })
  : null;

type AuthError = { code?: string; message?: string; status?: number } | null | undefined;
type SessionUser = { id: string; email: string; isAnonymous?: boolean | null };

/** 현재 세션의 사용자. 세션이 없으면 null, 확인 자체가 실패하면 던진다 */
async function sessionUser(): Promise<SessionUser | null> {
  if (!authClient) return null;
  const { data, error } = await authClient.getSession();
  if (error) throw new Error(`session check failed (${error.status})`);
  return data?.user ?? null;
}

// 익명 세션 확보 — 이미 세션이 있으면 재사용 (기기당 계정 유지).
// 세션 확인이 실패했을 때는 새 게스트를 만들지 않는다 — 일시 장애에 기존 계정의 쿠키를 덮으면 계정을 잃는다.
export async function ensureSession(): Promise<string | null> {
  if (!authClient) return null;
  let user: SessionUser | null;
  try {
    user = await sessionUser();
  } catch {
    return null;
  }
  if (user) return user.id;
  const { data, error } = await authClient.signIn.anonymous();
  if (error) return null;
  return data?.user.id ?? null;
}

/** 세션 사용자 id. 세션이 없거나 확인하지 못하면 null */
export async function sessionUid(): Promise<string | null> {
  try {
    return (await sessionUser())?.id ?? null;
  } catch {
    return null;
  }
}

// ---------- 계정 로그인 (v0.4.0) ----------
// 게스트(익명)는 유지하고, 가입 = 익명 계정에 이메일 자격을 붙이는 "승격"이다 —
// uid가 안 바뀌므로 세이브/DB 전부 무변경. 로그인은 다른 계정으로 갈아타는 것.

// 인증 서버 오류 코드 → 화면이 분기에 쓰는 코드. 통합 계정 폼(v0.4.2)이 email_exists 분기에 쓴다
const CODE: Record<string, string> = {
  USER_ALREADY_EXISTS: 'email_exists',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'email_exists',
  INVALID_EMAIL_OR_PASSWORD: 'invalid_credentials',
  PASSWORD_TOO_SHORT: 'weak_password',
  INVALID_EMAIL: 'validation_failed',
  INVALID_TOKEN: 'invalid_token',
};

// 화면 코드 → 유저가 행동할 수 있는 한국어 안내 (코드 없으면 원문 노출)
const AUTH_MSG: Record<string, string> = {
  email_exists: '이미 가입된 이메일이에요.',
  weak_password: '비밀번호가 너무 짧아요. 6자 이상으로 입력해 주세요.',
  invalid_credentials: '이메일 또는 비밀번호가 틀렸어요.',
  validation_failed: '이메일 형식을 확인해 주세요.',
  over_email_send_rate_limit: '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.',
  invalid_token: '재설정 링크가 만료됐거나 이미 쓰였어요. 비밀번호 재설정을 다시 요청해 주세요.',
};

const authErr = (e: AuthError): AuthResult => {
  const code = e?.status === 429 ? 'over_email_send_rate_limit' : (e?.code ? CODE[e.code] : undefined);
  return {
    ok: false,
    msg: (code && AUTH_MSG[code]) ?? `${e?.message ?? '알 수 없는 오류'}${e?.status ? ` (${e.status})` : ''}`,
    code,
  };
};

const NOT_CLOUD: AuthResult = { ok: false, msg: '클라우드가 설정되지 않았어요.' };

// 로그인된 영구 계정의 이메일 (게스트/미설정이면 null). 게스트의 이메일은 서버가 만든 자리표시라 보이지 않는다
export async function currentAccount(): Promise<string | null> {
  let u: SessionUser | null;
  try {
    u = await sessionUser();
  } catch {
    return null;
  }
  return u && !u.isAnonymous && u.email ? u.email : null;
}

// 가입 = 익명 → 영구 승격. 서버의 승격 경로가 같은 uid에 이메일 자격을 붙인다
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!authClient) return NOT_CLOUD;
  const { error } = await authClient.$fetch('/anonymous/upgrade', { method: 'POST', body: { email, password } });
  return error ? authErr(error) : { ok: true };
}

// 다른 계정으로 로그인 — 현재 기기의 게스트 진행은 버려진다 (호출 전 UI가 경고+백업)
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!authClient) return NOT_CLOUD;
  const { error } = await authClient.signIn.email({ email, password });
  return error ? authErr(error) : { ok: true };
}

export async function signOutAccount(): Promise<void> {
  if (!authClient) return;
  await authClient.signOut();
}

// 재설정 메일의 링크는 서버를 거쳐 redirectTo?token=… 으로 돌아온다(토큰이 틀리면 ?error=INVALID_TOKEN)
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!authClient) return NOT_CLOUD;
  const { error } = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/` });
  return error ? authErr(error) : { ok: true };
}

// 재설정 착지 — 부팅 때 한 번 주소에서 토큰을 꺼내 들고, 주소에서는 바로 지운다(새로고침·공유로 다시 쓰이지 않게)
let resetToken: string | null = null;

/** 재설정 링크로 들어왔는가. 'ready'면 새 비밀번호를 받을 차례, 'invalid'면 링크가 쓸 수 없는 것이다 */
export function takePasswordResetLanding(): 'ready' | 'invalid' | null {
  if (!authClient) return null;
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  const error = url.searchParams.get('error');
  if (!token && !error) return null;
  url.searchParams.delete('token');
  url.searchParams.delete('error');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  if (error || !token) return 'invalid';
  resetToken = token;
  return 'ready';
}

// 재설정 착지 후 새 비밀번호 적용
export async function applyNewPassword(password: string): Promise<AuthResult> {
  if (!authClient) return NOT_CLOUD;
  if (!resetToken) return { ok: false, msg: AUTH_MSG.invalid_token, code: 'invalid_token' };
  const { error } = await authClient.resetPassword({ newPassword: password, token: resetToken });
  if (error) return authErr(error);
  resetToken = null;
  return { ok: true };
}

// 본인 탈퇴 — 서버 함수(/api/account)가 계정 행과 인증 계정을 지운다. 지운 뒤 이 기기의 세션을 끝낸다
const DELETE_MSG: Record<number, string> = {
  401: '로그인 정보를 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.',
  403: '관리자 계정은 여기서 삭제할 수 없어요.',
  404: '이미 삭제된 계정이에요.',
};
export async function deleteOwnAccount(): Promise<AuthResult> {
  if (!authClient) return NOT_CLOUD;
  let res: Response;
  try {
    res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'delete' }),
    });
  } catch {
    return { ok: false, msg: '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
  }
  if (!res.ok) return { ok: false, msg: DELETE_MSG[res.status] ?? `잠시 뒤 다시 시도해 주세요. (${res.status})` };
  // 인증 계정이 이미 없어 서버 로그아웃이 실패할 수 있다 — 쿠키를 지우는 것이 목적이라 결과는 보지 않는다
  await authClient.signOut().catch(() => {});
  return { ok: true };
}

// 이 모듈은 인증을 맡으며 세이브 읽기와 액션 전송은 게임 게이트웨이가 맡는다.
