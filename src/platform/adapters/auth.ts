// 인증 — 같은 오리진의 /api/auth(Better Auth)에 쿠키 세션으로 붙는다.
// VITE_CLOUD가 '1'이 아니면 authClient = null → 게임은 로컬 저장만으로 정상 동작 (오프라인 모드).
import { createAuthClient } from 'better-auth/client';
import { anonymousClient } from 'better-auth/client/plugins';
import type { AcceptConsentResult, AccountLookup, AuthResult, ConfirmGoogleSwitchResult, ConsentStatus } from '../api/types';
import { isRateLimitedError, networkError, rateLimitedError, requestFailure, serverError, unauthorizedError } from './requestFailure';

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
  if (error) {
    if (error.status === 429) {
      throw rateLimitedError('요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.', { code: 'rate_limited' });
    }
    throw new Error(`session check failed (${error.status})`);
  }
  return data?.user ?? null;
}

// 익명 세션 확보 — 이미 세션이 있으면 재사용 (기기당 계정 유지).
// 세션 확인이 실패했을 때는 새 게스트를 만들지 않는다 — 일시 장애에 기존 계정의 쿠키를 덮으면 계정을 잃는다.
export async function ensureSession(): Promise<string | null> {
  if (!authClient) return null;
  let user: SessionUser | null;
  try {
    user = await sessionUser();
  } catch (err) {
    if (isRateLimitedError(err)) throw err;
    return null;
  }
  if (user) return user.id;
  const { data, error } = await authClient.signIn.anonymous();
  if (error) {
    if (error.status === 429) {
      throw rateLimitedError('요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.', { code: 'rate_limited' });
    }
    return null;
  }
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
// 계정의 로그인 수단은 구글과 익명 게스트다. 게스트는 같은 uid에 구글 계정을 붙여(연결) 영구 계정이 된다.

const authErr = (e: AuthError): AuthResult => {
  if (e?.status === 429) {
    return {
      ok: false,
      msg: '요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.',
      code: 'rate_limited',
    };
  }
  return {
    ok: false,
    msg: `${e?.message ?? '알 수 없는 오류'}${e?.status ? ` (${e.status})` : ''}`,
    ...(e?.code ? { code: e.code } : {}),
  };
};

const NOT_CLOUD_MSG = '클라우드가 설정되지 않았어요.';
const NOT_CLOUD: AuthResult = { ok: false, msg: NOT_CLOUD_MSG };

// 로그인된 영구 계정 확인. 게스트(미설정 포함)와 확인 실패를 구분한다. 게스트의 이메일은 서버가 만든 자리표시라 보이지 않는다
export async function currentAccount(): Promise<AccountLookup> {
  let u: SessionUser | null;
  try {
    u = await sessionUser();
  } catch {
    return { status: 'failed' };
  }
  return u && !u.isAnonymous && u.email ? { status: 'account', email: u.email } : { status: 'guest' };
}

// ---------- 구글 연결과 로그인 ----------
// 구글 인증 화면은 서버가 만든 주소로 전체 페이지를 이동해 거친다. 돌아올 때는 앱 루트에 표지 질의가 붙고,
// 실패하면 서버가 같은 주소에 error=<코드>를 더한다. 표지 값은 호출한 쪽이 정하며 이 모듈은 뜻을 모른다.

/** 구글 인증에서 돌아온 주소를 알아보는 질의 이름 */
export const GOOGLE_RETURN_PARAM = 'google';
/** 이 기기의 이 탭에서 구글 인증을 시작했다는 표지를 담는 세션 저장소 키. 다른 곳에서 만든 복귀 주소를 처리하지 않기 위해서다 */
const GOOGLE_FLOW_KEY = 'pf-google-flow';
const GOOGLE_ENDPOINT = { link: '/link-social', 'sign-in': '/sign-in/social' } as const;
const FALLBACK_SWITCH_CODES = new Set(['switch_ticket_missing', 'switch_ticket_expired']);

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
  // 세션 저장소를 쓸 수 없는 브라우저는 돌아왔을 때 이 기기의 흐름인지 알 수 없으므로 시작하지 않는다
  try {
    sessionStorage.setItem(GOOGLE_FLOW_KEY, tag);
  } catch {
    return { ok: false, msg: '브라우저 저장소를 쓸 수 없어요.' };
  }
  window.location.assign(data.url);
  return { ok: true };
}

/** 1회용 전환 티켓으로 2차 구글 인증 없이 기존 계정에 로그인한다. 티켓이 만료되거나 없는 경우에만 fallback: true를 돌려준다 */
export async function confirmGoogleSwitch(tag: string): Promise<ConfirmGoogleSwitchResult> {
  if (!authClient) return { ok: false, fallback: false, msg: NOT_CLOUD_MSG };
  let res: { data?: { ok?: boolean } | null; error?: AuthError };
  try {
    res = await authClient.$fetch<{ ok?: boolean }>('/confirm-google-switch', {
      method: 'POST',
      body: {},
    });
  } catch {
    return { ok: false, fallback: false, msg: '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'network' };
  }
  if (res.error) {
    const status = res.error.status;
    if (status === 429) {
      return { ok: false, fallback: false, msg: '요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.', code: 'rate-limited' };
    }
    const base = authErr(res.error);
    const msg = base.ok ? '계정 전환에 실패했어요.' : base.msg;
    if (typeof status === 'number' && status >= 500) {
      return { ok: false, fallback: false, msg, code: 'server' };
    }
    const code = base.ok ? undefined : base.code;
    const fallback = status !== 403 && status !== 409 && typeof code === 'string' && FALLBACK_SWITCH_CODES.has(code);
    return { ok: false, fallback, msg, ...(code ? { code } : {}) };
  }
  if (!res.data?.ok) {
    return { ok: false, fallback: false, msg: '계정 전환을 확인하지 못했어요.', code: 'server' };
  }
  try {
    sessionStorage.setItem(GOOGLE_FLOW_KEY, tag);
    window.location.assign(googleReturnUrl(window.location.origin, tag));
  } catch {
    window.location.reload();
  }
  return { ok: true };
}

/** 보류 중인 게스트→기존 구글 계정 전환 티켓과 쿠키를 폐기한다 */
export async function cancelGoogleSwitch(): Promise<void> {
  if (!authClient) return;
  try {
    await authClient.$fetch('/cancel-google-switch', { method: 'POST', body: {} });
  } catch {
    // 취소 정리 실패는 게스트 상태 복귀를 막지 않는다
  }
}

/**
 * 구글 인증에서 돌아왔는가. 부팅 때 한 번 읽고, 두 질의는 주소에서 바로 지운다(새로고침으로 다시 읽히지 않게).
 * 이 기기에서 시작한 흐름(시작할 때 남긴 표지와 같은 표지)에만 반응하고, 아니면 질의만 지우고 무시한다.
 */
export function takeGoogleLanding(): { tag: string; error: string | null } | null {
  if (!authClient) return null;
  const landing = parseGoogleLanding(window.location.search);
  if (!landing) return null;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${landing.rest}${window.location.hash}`);
  let started: string | null = null;
  try {
    started = sessionStorage.getItem(GOOGLE_FLOW_KEY);
    sessionStorage.removeItem(GOOGLE_FLOW_KEY);
  } catch {
    return null;
  }
  if (started !== landing.tag) return null;
  return { tag: landing.tag, error: landing.error };
}

export async function signOutAccount(): Promise<void> {
  if (!authClient) return;
  await authClient.signOut();
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

function parseConsentStatus(raw: unknown): ConsentStatus | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const consent = (raw as { consent?: unknown }).consent;
  if (typeof consent !== 'object' || consent === null) return null;
  const obj = consent as { required?: unknown; version?: unknown; effectiveAt?: unknown };
  if (typeof obj.required !== 'boolean' || typeof obj.version !== 'string' || typeof obj.effectiveAt !== 'string') {
    return null;
  }
  return { required: obj.required, version: obj.version, effectiveAt: obj.effectiveAt };
}

/** 현재 세션 계정의 이용약관 수락 상태를 조회한다 */
export async function getAccountConsent(): Promise<ConsentStatus> {
  if (!authClient) throw networkError('cloud not configured');
  let res: Response;
  try {
    res = await fetch('/api/account');
  } catch (cause) {
    throw networkError('account consent request failed', cause);
  }
  if (res.status === 401) throw unauthorizedError('account consent read before session');
  if (!res.ok) throw requestFailure(res, 'account consent read failed');
  const data = await res.json().catch(() => null);
  const consent = parseConsentStatus(data);
  if (!consent) throw serverError('invalid account consent response', { status: res.status });
  return consent;
}

/** 확인 화면에서 현재 판의 이용약관을 수락하고 서버가 반환한 최신 약관 상태를 돌려준다 */
export async function acceptAccountConsent(version: string): Promise<AcceptConsentResult> {
  if (!authClient) return { ok: false, code: 'network' };
  let res: Response;
  try {
    res = await fetch('/api/account/consents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, ageConfirmed: true }),
    });
  } catch {
    return { ok: false, code: 'network' };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: unknown } | null;
    const bodyCode = typeof body?.error === 'string' ? body.error : undefined;
    if (res.status === 429) return { ok: false, code: bodyCode ?? 'rate-limited', status: 429 };
    if (res.status === 409) return { ok: false, code: bodyCode ?? 'consent-version-mismatch', status: 409 };
    if (res.status === 403) return { ok: false, code: bodyCode ?? 'account-only', status: 403 };
    if (res.status === 401) return { ok: false, code: bodyCode ?? 'unauthorized', status: 401 };
    if (res.status === 400) return { ok: false, code: bodyCode ?? 'bad-request', status: 400 };
    return { ok: false, code: bodyCode ?? 'server', status: res.status };
  }
  const data = await res.json().catch(() => null);
  const consent = parseConsentStatus(data);
  if (!consent) return { ok: false, code: 'bad-response', status: res.status };
  return { ok: true, consent };
}

// 이 모듈은 인증을 맡으며 세이브 읽기와 액션 전송은 게임 게이트웨이가 맡는다.
