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

// ---------- 계정 로그인 ----------
// 새 계정의 로그인 수단은 구글 하나다. 게스트(익명)는 같은 uid에 구글 계정을 붙여(연결) 영구 계정이 된다.
// 이메일과 비밀번호는 이미 있는 계정의 로그인에만 남아 있다.

// 인증 서버 오류 코드 → 화면이 분기에 쓰는 코드
const CODE: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'invalid_credentials',
  PASSWORD_TOO_SHORT: 'weak_password',
  INVALID_EMAIL: 'validation_failed',
  INVALID_TOKEN: 'invalid_token',
};

// 화면 코드 → 유저가 행동할 수 있는 한국어 안내 (코드 없으면 원문 노출)
const AUTH_MSG: Record<string, string> = {
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

// 이미 있는 이메일 계정으로 로그인 — 현재 기기의 게스트 진행은 버려진다 (호출 전 UI가 확인을 받는다)
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!authClient) return NOT_CLOUD;
  const { error } = await authClient.signIn.email({ email, password });
  return error ? authErr(error) : { ok: true };
}

// ---------- 구글 연결과 로그인 ----------
// 구글 인증 화면은 서버가 만든 주소로 전체 페이지를 이동해 거친다. 돌아올 때는 앱 루트에 표지 질의가 붙고,
// 실패하면 서버가 같은 주소에 error=<코드>를 더한다. 표지 값은 호출한 쪽이 정하며 이 모듈은 뜻을 모른다.

/** 구글 인증에서 돌아온 주소를 알아보는 질의 이름 */
export const GOOGLE_RETURN_PARAM = 'google';
const GOOGLE_ENDPOINT = { link: '/link-social', 'sign-in': '/sign-in/social' } as const;

/** 연결(link) 또는 확인 뒤 로그인(sign-in). 표지(tag)는 돌아온 주소에 실려 돌아온다 */
export type GoogleStart = keyof typeof GOOGLE_ENDPOINT;

/** 구글 인증이 끝나고 돌아올 같은 출처 주소 */
export function googleReturnUrl(origin: string, tag: string): string {
  return `${origin}/?${GOOGLE_RETURN_PARAM}=${encodeURIComponent(tag)}`;
}

/** 돌아온 주소의 질의에서 표지와 오류 코드를 읽는다. rest는 두 질의를 지운 나머지다. 표지가 없으면 구글 복귀가 아니다 */
export function parseGoogleLanding(search: string): { tag: string; error: string | null; rest: string } | null {
  const params = new URLSearchParams(search);
  const tag = params.get(GOOGLE_RETURN_PARAM);
  if (!tag) return null;
  const error = params.get('error');
  params.delete(GOOGLE_RETURN_PARAM);
  params.delete('error');
  const rest = params.toString();
  return { tag, error: error || null, rest: rest ? `?${rest}` : '' };
}

/** 구글 인증 화면으로 이동한다. 주소를 받지 못하면 이동하지 않고 실패로 알린다 */
export async function startGoogleAuth(start: GoogleStart, tag: string): Promise<AuthResult> {
  if (!authClient) return NOT_CLOUD;
  const returnUrl = googleReturnUrl(window.location.origin, tag);
  const { data, error } = await authClient.$fetch<{ url?: string }>(GOOGLE_ENDPOINT[start], {
    method: 'POST',
    body: { provider: 'google', callbackURL: returnUrl, errorCallbackURL: returnUrl, disableRedirect: true },
  });
  if (error) return authErr(error);
  if (!data?.url) return { ok: false, msg: '구글 인증 주소를 받지 못했어요.' };
  window.location.assign(data.url);
  return { ok: true };
}

/** 구글 인증에서 돌아왔는가. 부팅 때 한 번 읽고, 두 질의는 주소에서 바로 지운다(새로고침으로 다시 읽히지 않게) */
export function takeGoogleLanding(): { tag: string; error: string | null } | null {
  if (!authClient) return null;
  const landing = parseGoogleLanding(window.location.search);
  if (!landing) return null;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${landing.rest}${window.location.hash}`);
  return { tag: landing.tag, error: landing.error };
}

/** 이 계정에 붙은 로그인 수단의 공급자 이름(google, credential). 조회하지 못하면 null */
export async function accountProviders(): Promise<string[] | null> {
  if (!authClient) return null;
  const { data, error } = await authClient.listAccounts();
  if (error || !data) return null;
  return data.map(a => a.providerId);
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
  // 구글 인증에서 돌아온 주소의 error 질의는 재설정 링크의 오류가 아니다
  if (url.searchParams.has(GOOGLE_RETURN_PARAM)) return null;
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
