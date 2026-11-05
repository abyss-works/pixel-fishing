// HTTP API 구현 — 스테이징·운영 (/api/auth 쿠키 세션 + /api/action)
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
  AdminApi,
  AdminUserRow, AdminDailyActiveRow, AdminRetentionRow, AdminEconomyRow, AdminBountyFunnelRow,
  AdminCatchQualityRow, AdminSpamFlagRow, AdminEventRow, AdminLetterRow, BalanceLive,
  AdminSentMailRow, AdminMailRequest, AdminMailPlan,
} from '../api/types';

/** 서버 읽기 함수에 조회 하나를 요청한다. 응답이 실패면(세션이 없으면 401) 던진다 */
async function readAdmin<T>(query: string, params: Record<string, string | number> = {}): Promise<T> {
  const search = new URLSearchParams({ q: query });
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  const res = await fetch(`/api/admin?${search}`);
  if (!res.ok) {
    const code = await res.json().then((body: { error?: unknown }) => body.error, () => undefined);
    throw new Error(`${query} 조회 실패: ${res.status}${typeof code === 'string' ? ` ${code}` : ''}`);
  }
  return await res.json() as T;
}

/** 관리자 쓰기 — 우편 보내기. 응답이 실패면(세션이 없으면 401) 던진다 */
async function writeAdminMail(op: 'preview' | 'send', request: AdminMailRequest): Promise<AdminMailPlan> {
  const res = await fetch('/api/admin?q=mail', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, request }),
  });
  if (!res.ok) {
    const code = await res.json().then((body: { error?: unknown }) => body.error, () => undefined);
    throw new Error(`우편 ${op} 실패: ${res.status}${typeof code === 'string' ? ` ${code}` : ''}`);
  }
  return await res.json() as AdminMailPlan;
}

class HttpAdmin implements AdminApi {
  access(): Promise<{ kind: 'granted' | 'denied'; uid: string }> {
    return readAdmin('access');
  }

  users(): Promise<AdminUserRow[]> {
    return readAdmin('users');
  }
  dailyActive(days: number): Promise<AdminDailyActiveRow[]> {
    return readAdmin('dailyActive', { days });
  }
  retention(): Promise<AdminRetentionRow[]> {
    return readAdmin('retention');
  }
  economy(days: number): Promise<AdminEconomyRow[]> {
    return readAdmin('economy', { days });
  }
  bountyFunnel(days: number): Promise<AdminBountyFunnelRow[]> {
    return readAdmin('bountyFunnel', { days });
  }
  catchQuality(days: number): Promise<AdminCatchQualityRow[]> {
    return readAdmin('catchQuality', { days });
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
  sentMails(): Promise<AdminSentMailRow[]> {
    return readAdmin('mails');
  }
  mail(op: 'preview' | 'send', request: AdminMailRequest): Promise<AdminMailPlan> {
    return writeAdminMail(op, request);
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
