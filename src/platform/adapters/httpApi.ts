// HTTP API 구현 — 스테이징·운영 (/api/auth 쿠키 세션 + /api/action, 관리자는 /api/admin/auth 쿠키 세션)
import { HttpGameGateway } from './httpGameGateway';
import type { GameGateway } from '../api/types';
import type { GameState } from '../../game/rules/logic';
import type { AuthApi, AuthResult } from '../api/types';
import {
  sessionUid,
  ensureSession,
  currentAccount,
  signUpWithEmail,
  signInWithEmail,
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
  currentAccount(): Promise<string | null> {
    return currentAccount();
  }
  async getSession(): Promise<{ uid: string | null; email: string | null }> {
    const [uid, email] = await Promise.all([sessionUid(), currentAccount()]);
    return { uid, email };
  }
  takePasswordResetLanding(): 'ready' | 'invalid' | null {
    return takePasswordResetLanding();
  }
  signUp(email: string, password: string): Promise<AuthResult> {
    return signUpWithEmail(email, password);
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
  AdminLive, AdminDailyStatsRow, AdminSessionRow, AdminSpamFlagRow, AdminEventRow, AdminLetterRow, AdminChatReportRow, BalanceLive,
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

class HttpAdmin implements AdminApi {
  isConfigured = true;

  /** 관리자 세션이 없으면(401) signedOut이다 */
  async access(): Promise<AdminAccessResult> {
    const res = await fetch('/api/admin?q=access');
    if (res.status === 401) return { kind: 'signedOut', uid: null };
    return adminBody(res, 'access');
  }
  async signIn(email: string, password: string): Promise<AuthResult> {
    let res: Response;
    try {
      res = await postAdminAuth('sign-in/email', { email, password });
    } catch {
      return { ok: false, msg: '로그인하지 못했어요. 네트워크를 확인해 주세요.' };
    }
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, msg: '이메일 또는 비밀번호가 틀렸어요.' };
    if (res.status === 429) return { ok: false, msg: '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.' };
    return { ok: false, msg: `로그인하지 못했어요. (${res.status})` };
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
