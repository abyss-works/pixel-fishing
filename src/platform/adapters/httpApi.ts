// HTTP API 구현 — 스테이징·운영 (/api/auth 쿠키 세션 + /api/action, 관리자는 /api/admin/auth 쿠키 세션)
import { HttpGameGateway } from './httpGameGateway';
import { migrate } from '../../game/rules/logic';
import type { GameGateway } from '../api/types';
import type { GameState } from '../../game/rules/logic';
import type { AccountLookup, AuthApi, AuthResult, DevApi, PromoteTestResult, ResetDevAccountResult } from '../api/types';
import {
  sessionUid,
  ensureSession,
  currentAccount,
  startGoogleAuth,
  takeGoogleLanding,
  signOutAccount,
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
  startGoogle(start: 'link' | 'sign-in', tag: string): Promise<AuthResult> {
    return startGoogleAuth(start, tag);
  }
  takeGoogleLanding(): { tag: string; error: string | null } | null {
    return takeGoogleLanding();
  }
  signOut(): Promise<void> {
    return signOutAccount();
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
  AdminUserRow, AdminUserState, AdminOverview, AdminRetentionRow, AdminEconomyRow, AdminBountyFunnelRow,
  AdminLive, AdminDailyStatsRow, AdminSessionRow, AdminSpamFlagRow, AdminEventRow, AdminLetterRow, AdminChangelogRow, AdminChatReportRow, BalanceLive,
  AdminSentMailRow, AdminMailRequest, AdminMailPlan,
} from '../api/types';

const RATE_LIMIT_MESSAGE = '요청이 너무 많아 잠시 기다렸다가 다시 시도해 주세요.';
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 10_000;

class AdminHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterMs?: number;
  readonly retried: boolean;

  constructor(message: string, status: number, code?: string, retryAfterMs?: number, retried = false) {
    super(message);
    this.name = 'AdminHttpError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.retried = retried;
  }
}

function parseRetryAfterMs(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);
  }
  const ts = Date.parse(trimmed);
  if (!Number.isNaN(ts)) {
    return Math.min(Math.max(0, ts - Date.now()), MAX_RETRY_AFTER_MS);
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** 429 응답에 대해서만 Retry-After 또는 짧은 백오프로 제한 횟수 내 재시도한다. 401/403 등은 즉시 반환한다 */
async function fetchAdminWithRetry(url: string): Promise<{ res: Response; retried: boolean }> {
  let retried = false;
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.status !== 429 || attempt === MAX_RATE_LIMIT_RETRIES) {
      return { res, retried };
    }
    retried = true;
    const waitMs = parseRetryAfterMs(res.headers.get('retry-after')) ?? 300 * (attempt + 1);
    await sleep(waitMs);
  }
  throw new AdminHttpError(RATE_LIMIT_MESSAGE, 429, undefined, undefined, true);
}

/** 관리자 조회 하나를 GET으로 읽는다. 429는 제한적 백오프 재시도 후 실패 시 안내 문구를 던진다 */
async function getAdmin<T>(url: string, label: string): Promise<T> {
  const { res, retried } = await fetchAdminWithRetry(url);
  return adminBody(res, label, retried);
}

/** 관리자 조회 응답의 본문. 429와 비-JSON 응답을 삼키지 않고 명확한 오류로 변환한다 */
async function adminBody<T>(res: Response, label: string, retried = false): Promise<T> {
  if (res.status === 429) {
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after')) ?? undefined;
    throw new AdminHttpError(RATE_LIMIT_MESSAGE, 429, undefined, retryAfterMs, retried);
  }
  if (!res.ok) {
    const code = await res.json().then((body: { error?: unknown }) => body.error, () => undefined);
    const codeStr = typeof code === 'string' ? code : undefined;
    throw new AdminHttpError(
      `${label} 조회 실패: ${res.status}${codeStr ? ` ${codeStr}` : ''}`,
      res.status,
      codeStr,
      undefined,
      retried,
    );
  }
  try {
    return await res.json() as T;
  } catch {
    throw new AdminHttpError(`${label} 응답이 올바른 JSON 형식이 아니에요.`, res.status, undefined, undefined, retried);
  }
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

/** 관리자 쓰기 하나를 POST로 보낸다. 429·비-JSON 오류를 구분해 명확한 오류를 던진다 */
async function writeAdmin<T>(query: string, body: unknown, label: string): Promise<T> {
  const res = await fetch(`/api/admin?q=${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after')) ?? undefined;
    throw new AdminHttpError(RATE_LIMIT_MESSAGE, 429, undefined, retryAfterMs, false);
  }
  if (!res.ok) {
    const code = await res.json().then((b: { error?: unknown }) => b.error, () => undefined);
    const codeStr = typeof code === 'string' ? code : undefined;
    throw new AdminHttpError(`${label} 실패: ${res.status}${codeStr ? ` ${codeStr}` : ''}`, res.status, codeStr);
  }
  try {
    return await res.json() as T;
  } catch {
    throw new AdminHttpError(`${label} 응답이 올바른 JSON 형식이 아니에요.`, res.status);
  }
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
    const { res, retried } = await fetchAdminWithRetry('/api/admin?q=access');
    if (res.status === 401) return { kind: 'signedOut', uid: null };
    return adminBody(res, 'access', retried);
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

  overview(days?: number): Promise<AdminOverview> {
    return readAdmin('overview', days === undefined ? {} : { days });
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
  letterHandled(letterId: number, handled: boolean): Promise<{ handled: boolean }> {
    return writeAdmin('letterHandled', { letterId, handled }, '편지 처리 표시');
  }
  revokeSessions(userId: string): Promise<{ revoked: number }> {
    return writeAdmin('revokeSessions', { userId }, '세션 강제 종료');
  }
  userEvents(userId: string, limit = 500): Promise<AdminEventRow[]> {
    return readAdmin('userEvents', { user: userId, limit });
  }
  userState(uid: string): Promise<AdminUserState> {
    return readAdmin('userState', { uid });
  }
  balanceLive(days?: number): Promise<BalanceLive> {
    return readAdmin('balanceLive', days === undefined ? {} : { days });
  }
  deployHost(): string | null {
    return window.location.hostname || null;
  }
}

class DevHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'DevHttpError';
    this.status = status;
    this.code = code;
  }
}

function devAccountError(status: number, code?: string): { msg: string; code?: string } {
  if (status === 429) return { msg: RATE_LIMIT_MESSAGE, code: 'rate-limited' };
  if (status === 401) return { msg: '로그인 정보를 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.', code: code ?? 'unauthorized' };
  if (status === 403) return { msg: '스테이징 관리자 권한이 필요해요. 관리자 Google 계정으로 로그인한 뒤 다시 시도해 주세요.', code: code ?? 'forbidden' };
  if (status === 404) {
    return code === 'account-missing'
      ? { msg: '계정 정보를 찾을 수 없어요.', code }
      : { msg: '이 환경에서는 사용할 수 없는 기능이에요.', code: code ?? 'not-found' };
  }
  if (status === 409) return { msg: '이미 정식 계정으로 연결되어 있어요.', code: code ?? 'not-guest' };
  return { msg: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code };
}

async function readErrorCode(res: Response): Promise<string | undefined> {
  const code = await res.json().then((b: { error?: unknown }) => b?.error, () => undefined);
  return typeof code === 'string' ? code : undefined;
}

class HttpDev implements DevApi {
  async promoteTestAccount(): Promise<PromoteTestResult> {
    let res: Response;
    try {
      res = await fetch('/api/dev/promote-test', { method: 'POST' });
    } catch {
      return { ok: false, msg: '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'network' };
    }
    if (!res.ok) {
      const mapped = devAccountError(res.status, await readErrorCode(res));
      return { ok: false, msg: mapped.msg, ...(mapped.code ? { code: mapped.code } : {}) };
    }
    const data = await res.json().catch(() => null) as { ok?: unknown; email?: unknown; isAnonymous?: unknown } | null;
    if (data?.ok !== true || typeof data.email !== 'string' || data.isAnonymous !== false) {
      return { ok: false, msg: '서버 응답 형식이 올바르지 않아요.', code: 'bad-response' };
    }
    return { ok: true, email: data.email, isAnonymous: false };
  }

  async resetDevAccount(): Promise<ResetDevAccountResult> {
    let res: Response;
    try {
      res = await fetch('/api/dev/reset-account', { method: 'POST' });
    } catch {
      throw new DevHttpError('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 0, 'network');
    }
    if (!res.ok) {
      const mapped = devAccountError(res.status, await readErrorCode(res));
      throw new DevHttpError(mapped.msg, res.status, mapped.code);
    }
    const data = await res.json().catch(() => null) as { state?: unknown; version?: unknown } | null;
    if (!data || !data.state || typeof data.version !== 'number' || !Number.isFinite(data.version)) {
      throw new DevHttpError('서버 응답 형식이 올바르지 않아요.', res.status, 'bad-response');
    }
    return { state: migrate(data.state), version: data.version };
  }
}

export function createHttpApi():
{ createGameGateway(initial?: GameState): GameGateway; auth: AuthApi; admin: AdminApi; dev: DevApi } {
  return {
    // 시드 전달 — 델타 캐시의 출발점. 없으면 첫 델타가 풀재동기로 나간다 (무해, 1회).
    createGameGateway: (initial?: GameState) => new HttpGameGateway(initial ?? null),
    auth: new HttpAuth(),
    admin: new HttpAdmin(),
    dev: new HttpDev(),
  };
}
