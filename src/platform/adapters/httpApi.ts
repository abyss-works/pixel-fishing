// HTTP API 구현 — 스테이징·운영 (/api/auth 쿠키 세션 + /api/action, 관리자는 /api/admin/auth 쿠키 세션)
import { HttpGameGateway } from './httpGameGateway';
import type { GameGateway } from '../api/types';
import type { GameState } from '../../game/rules/logic';
import type { AccountLookup, AuthApi, AuthResult } from '../api/types';
import {
  sessionUid,
  ensureSession,
  currentAccount,
  signInWithEmail,
  startGoogleAuth,
  takeGoogleLanding,
  accountProviders,
  signOutAccount,
  requestPasswordReset,
  applyNewPassword,
  takePasswordResetLanding,
  deleteOwnAccount,
} from './auth';

class HttpAuth implements AuthApi {
  isConfigured = true;

  ensureSession(): Promise<string | null> {
    return ensureSession();
  }
  currentAccount(): Promise<AccountLookup> {
    return currentAccount();
  }
  async getSession(): Promise<{ uid: string | null; email: string | null }> {
    const [uid, lookup] = await Promise.all([sessionUid(), currentAccount()]);
    return { uid, email: lookup.status === 'account' ? lookup.email : null };
  }
  takePasswordResetLanding(): 'ready' | 'invalid' | null {
    return takePasswordResetLanding();
  }
  startGoogle(start: 'link' | 'sign-in', tag: string): Promise<AuthResult> {
    return startGoogleAuth(start, tag);
  }
  takeGoogleLanding(): { tag: string; error: string | null } | null {
    return takeGoogleLanding();
  }
  accountProviders(): Promise<string[] | null> {
    return accountProviders();
  }
  signIn(email: string, password: string): Promise<AuthResult> {
    return signInWithEmail(email, password);
  }
  signOut(): Promise<void> {
    return signOutAccount();
  }
  requestPasswordReset(email: string): Promise<AuthResult> {
    return requestPasswordReset(email);
  }
  applyNewPassword(password: string): Promise<AuthResult> {
    return applyNewPassword(password);
  }
  deleteAccount(): Promise<AuthResult> {
    return deleteOwnAccount();
  }
  accountNudgedDay(): string | null {
    const v = localStorage.getItem('pf-account-nudged');
    // 하루 한 번 규칙 이전의 값('1')은 날짜가 아니므로 띄운 적 없는 것으로 본다
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }
  markAccountNudged(day: string): void {
    localStorage.setItem('pf-account-nudged', day);
  }
}

// ---------- 관리자 읽기 (서버 읽기 함수) ----------
// 관리자 조회는 서버 읽기 함수가 대신 읽는다. 브라우저는 관리자 뷰와 함수를 직접 읽지 않는다.
// 전송 상세(요청 이름, 인자)는 여기에 갇히고, 소비처(기능 계층)는 AdminApi 인터페이스만 본다. 세션은 쿠키가 싣는다.

import type {
  AdminApi, AdminAccessResult,
  AdminUserRow, AdminRetentionRow, AdminEconomyRow, AdminBountyFunnelRow,
  AdminLive, AdminDailyStatsRow, AdminSessionRow, AdminSpamFlagRow, AdminEventRow, AdminLetterRow, AdminChangelogRow, AdminChatReportRow, BalanceLive,
  AdminSentMailRow, AdminMailRequest, AdminMailPlan, AdminResetLink,
} from '../api/types';

/** 관리자 조회 하나를 GET으로 읽는다. 응답이 실패면(세션이 없으면 401) 조회 이름과 상태를 담아 던진다 */
async function getAdmin<T>(url: string, label: string): Promise<T> {
  return adminBody(await fetch(url), label);
}

/** 관리자 조회 응답의 본문. 실패 응답이면 조회 이름과 상태를 담아 던진다 */
async function adminBody<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const code = await res.json().then((body: { error?: unknown }) => body.error, () => undefined);
    throw new Error(`${label} 조회 실패: ${res.status}${typeof code === 'string' ? ` ${code}` : ''}`);
  }
  return await res.json() as T;
}

/** 서버 읽기 함수에 조회 하나를 요청한다(`?q=` 조회) */
function readAdmin<T>(query: string, params: Record<string, string | number> = {}): Promise<T> {
  const search = new URLSearchParams({ q: query });
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  return getAdmin(`/api/admin?${search}`, query);
}

/** 관리자 REST 경로 하나를 읽는다. 값이 없는 인자는 보내지 않는다 */
function readAdminPath<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const query = search.toString();
  return getAdmin(`/api/admin/${path}${query ? `?${query}` : ''}`, path);
}

/** 관리자 쓰기 하나를 POST로 보낸다. 응답이 실패면(세션이 없으면 401) 작업 이름과 상태를 담아 던진다 */
async function writeAdmin<T>(query: string, body: unknown, label: string): Promise<T> {
  const res = await fetch(`/api/admin?q=${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const code = await res.json().then((b: { error?: unknown }) => b.error, () => undefined);
    throw new Error(`${label} 실패: ${res.status}${typeof code === 'string' ? ` ${code}` : ''}`);
  }
  return await res.json() as T;
}

/** 관리자 인증 경로에 JSON 본문을 POST한다. 세션 쿠키는 게임과 이름이 다른 관리자 쿠키다 */
const postAdminAuth = (path: string, body: unknown): Promise<Response> => fetch(`/api/admin/auth/${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** 관리자 구글 로그인에서 돌아온 주소를 알아보는 질의 이름과 값 */
const ADMIN_GOOGLE_PARAM = 'google';
const ADMIN_GOOGLE_TAG = 'sign-in';
/** 이 탭에서 관리자 구글 로그인을 시작했다는 표지를 담는 세션 저장소 키. 다른 곳에서 만든 복귀 주소를 처리하지 않기 위해서다 */
const ADMIN_GOOGLE_FLOW_KEY = 'pf-admin-google-flow';

class HttpAdmin implements AdminApi {
  isConfigured = true;

  /** 관리자 세션이 없으면(401) signedOut이다 */
  async access(): Promise<AdminAccessResult> {
    const res = await fetch('/api/admin?q=access');
    if (res.status === 401) return { kind: 'signedOut', uid: null };
    return adminBody(res, 'access');
  }
  /** 서버가 만든 구글 인증 주소로 이동한다. 성공과 실패 모두 같은 관리자 주소로 돌아오고, 실패는 서버가 error 질의를 더한다 */
  async signIn(): Promise<AuthResult> {
    const returnUrl = `${window.location.origin}/admin/?${ADMIN_GOOGLE_PARAM}=${ADMIN_GOOGLE_TAG}`;
    let res: Response;
    try {
      res = await postAdminAuth('sign-in/social', {
        provider: 'google', callbackURL: returnUrl, errorCallbackURL: returnUrl, disableRedirect: true,
      });
    } catch {
      return { ok: false, msg: '구글 계정 선택 화면을 열지 못했어요.\n네트워크를 확인해 주세요.' };
    }
    if (res.status === 429) return { ok: false, msg: '요청이 너무 잦아요.\n잠시 뒤 다시 시도해 주세요.' };
    if (!res.ok) return { ok: false, msg: `구글 계정 선택 화면을 열지 못했어요.\n서버에서 ${res.status} 응답을 받았어요.\n잠시 뒤 다시 시도해 주세요.` };
    const data = await res.json().catch(() => null) as { url?: string } | null;
    if (!data?.url) return { ok: false, msg: '구글 인증 주소를 받지 못했어요.' };
    // 세션 저장소를 쓸 수 없는 브라우저는 돌아왔을 때 이 탭의 흐름인지 알 수 없으므로 시작하지 않는다
    try {
      sessionStorage.setItem(ADMIN_GOOGLE_FLOW_KEY, ADMIN_GOOGLE_TAG);
    } catch {
      return { ok: false, msg: '브라우저 저장소를 쓸 수 없어요.' };
    }
    window.location.assign(data.url);
    return { ok: true };
  }
  /**
   * 돌아온 주소에서 표지와 오류 코드를 읽고 표지, 오류 코드, 오류 설명 질의를 주소에서 지운다.
   * 이 탭에서 시작한 흐름이 아니면 null이다. 표지 질의 없이 열렸는데 이 탭의 세션 저장소 표지가 남아 있으면(구글 화면에서 뒤로 돌아온 경우) 표지만 지운다.
   * error가 빈 문자열이면 빈 코드로 돌려준다.
   */
  takeSignInReturn(): { error: string | null } | null {
    const params = new URLSearchParams(window.location.search);
    const returned = params.get(ADMIN_GOOGLE_PARAM) === ADMIN_GOOGLE_TAG;
    const error = params.get('error');
    if (returned) {
      params.delete(ADMIN_GOOGLE_PARAM);
      params.delete('error');
      params.delete('error_description');
      const rest = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    }
    let started = false;
    try {
      started = sessionStorage.getItem(ADMIN_GOOGLE_FLOW_KEY) === ADMIN_GOOGLE_TAG;
      sessionStorage.removeItem(ADMIN_GOOGLE_FLOW_KEY);
    } catch {
      return null;
    }
    return returned && started ? { error } : null;
  }
  async signOut(): Promise<void> {
    await postAdminAuth('sign-out', {});
  }

  users(): Promise<AdminUserRow[]> {
    return readAdmin('users');
  }
  live(): Promise<AdminLive> {
    return readAdminPath('live');
  }
  dailyStats(from: string, to: string): Promise<AdminDailyStatsRow[]> {
    return readAdminPath('stats/daily', { from, to });
  }
  retention(): Promise<AdminRetentionRow[]> {
    return readAdminPath('retention');
  }
  sessions(userId?: string, limit?: number): Promise<AdminSessionRow[]> {
    return readAdminPath('sessions', { user: userId, limit });
  }
  economy(days: number): Promise<AdminEconomyRow[]> {
    return readAdmin('economy', { days });
  }
  bountyFunnel(days: number): Promise<AdminBountyFunnelRow[]> {
    return readAdmin('bountyFunnel', { days });
  }
  spamFlags(): Promise<AdminSpamFlagRow[]> {
    return readAdmin('spamFlags');
  }
  recentEvents(): Promise<AdminEventRow[]> {
    return readAdmin('recentEvents');
  }
  letters(): Promise<AdminLetterRow[]> {
    return readAdmin('letters');
  }
  changelog(): Promise<AdminChangelogRow[]> {
    return readAdmin('changelog');
  }
  chatReports(): Promise<AdminChatReportRow[]> {
    return readAdmin('chatReports');
  }
  sentMails(): Promise<AdminSentMailRow[]> {
    return readAdmin('mails');
  }
  mail(op: 'preview' | 'send', request: AdminMailRequest): Promise<AdminMailPlan> {
    return writeAdmin('mail', { op, request }, `우편 ${op}`);
  }
  restrict(userId: string, restricted: boolean): Promise<{ restricted: boolean }> {
    return writeAdmin('restrict', { userId, restricted }, restricted ? '제재' : '제재 해제');
  }
  resetLink(userId: string): Promise<AdminResetLink> {
    return writeAdmin('resetLink', { userId }, '재설정 링크 발급');
  }
  letterHandled(letterId: number, handled: boolean): Promise<{ handled: boolean }> {
    return writeAdmin('letterHandled', { letterId, handled }, '편지 처리 표시');
  }
  userEvents(userId: string, limit = 500): Promise<AdminEventRow[]> {
    return readAdmin('userEvents', { user: userId, limit });
  }
  balanceLive(days?: number): Promise<BalanceLive> {
    return readAdmin('balanceLive', days === undefined ? {} : { days });
  }
  deployHost(): string | null {
    return window.location.hostname || null;
  }
}

export function createHttpApi():
{ createGameGateway(initial?: GameState): GameGateway; auth: AuthApi; admin: AdminApi } {
  return {
    // 시드 전달 — 델타 캐시의 출발점. 없으면 첫 델타가 풀재동기로 나간다 (무해, 1회).
    createGameGateway: (initial?: GameState) => new HttpGameGateway(initial ?? null),
    auth: new HttpAuth(),
    admin: new HttpAdmin(),
  };
}
