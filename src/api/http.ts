// HTTP API 구현 — 스테이징·운영 (supabase + /api/action)
import { HttpBackend } from '../backend/http';
import type { Backend } from '../backend/types';
import type { AuthApi, StorageApi } from './types';
import type { AuthResult } from '../backend/auth';
import type { GameState } from '../game/logic';
import {
  supabase,
  ensureSession,
  currentAccount,
  signUpWithEmail,
  signInWithEmail,
  signOutAccount,
  requestPasswordReset,
  applyNewPassword,
  saveCode as encodeSave,
} from '../backend/auth';

class HttpAuth implements AuthApi {
  isConfigured = true;

  ensureSession(): Promise<string | null> {
    return ensureSession();
  }
  currentAccount(): Promise<string | null> {
    return currentAccount();
  }
  async getSession(): Promise<{ uid: string | null; email: string | null }> {
    if (!supabase) return { uid: null, email: null };
    const { data: { session } } = await supabase.auth.getSession();
    return { uid: session?.user.id ?? null, email: session?.user.email ?? null };
  }
  onAuthStateChange(cb: (event: string) => void): { unsubscribe(): void } {
    if (!supabase) return { unsubscribe() {} };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => cb(event));
    return { unsubscribe: () => subscription.unsubscribe() };
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
  onAccountNudged(): boolean {
    return !!localStorage.getItem('pf-account-nudged');
  }
  markAccountNudged(): void {
    localStorage.setItem('pf-account-nudged', '1');
  }
}

class HttpStorage implements StorageApi {
  saveCode(state: GameState): string {
    return encodeSave(state);
  }
  decodeSave(code: string): unknown {
    return JSON.parse(decodeURIComponent(atob(code.trim())));
  }
}

// ---------- 관리자 읽기 (0010 뷰/RPC) ----------
// 전송 상세(뷰 이름, PostgREST 파라미터, KST day 컷오프)는 여기에 갇힌다 —
// 소비처(admin/**)는 AdminApi 인터페이스만 본다.

import type {
  AdminApi,
  AdminUserRow, AdminDailyActiveRow, AdminRetentionRow, AdminEconomyRow,
  AdminCatchQualityRow, AdminSpamFlagRow, AdminImportLogRow,
  AdminDexMismatchRow, AdminEventRow,
} from './types';

/** day 문자열 비교 = ISO 사전순. KST 축이라 서버 todayKST 공식과 동일하게 자른다 */
const kstDayCutoff = (days: number): string =>
  new Date(Date.now() + 9 * 3600_000 - (days - 1) * 86_400_000)
    .toISOString().slice(0, 10);

async function selectView<T>(view: string, days?: number): Promise<T[]> {
  if (!supabase) throw new Error('클라우드 미설정 — 관리자 데이터는 운영 DB에서만 읽힌다');
  let q = supabase.from(view).select('*');
  if (days !== undefined) q = q.gte('day', kstDayCutoff(days));
  const { data, error } = await q;
  if (error) throw new Error(`${view} 조회 실패: ${error.message}`);
  return (data ?? []) as T[];
}

class HttpAdmin implements AdminApi {
  async access(): Promise<{ kind: 'granted' | 'denied'; uid: string | null }> {
    if (!supabase) throw new Error('클라우드 미설정');
    // uid 먼저 — 비권한 판정이라도 안내문에는 본인 식별값이 필요하다
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id ?? null;
    const { data, error } = await supabase.rpc('is_admin');
    if (error) throw new Error(`권한 판정 실패: ${error.message}`);
    return { kind: data === true ? 'granted' : 'denied', uid };
  }

  users(): Promise<AdminUserRow[]> {
    // 최근 행동순이 대시보드 기본 정렬 — 뷰가 보장하지 않으므로 여기서 고정한다
    return selectView<AdminUserRow>('v_admin_users').then(rows =>
      rows.sort((a, b) => String(b.last_action_at ?? '')
        .localeCompare(String(a.last_action_at ?? ''))));
  }
  dailyActive(days: number): Promise<AdminDailyActiveRow[]> {
    return selectView<AdminDailyActiveRow>('v_daily_active', days);
  }
  retention(): Promise<AdminRetentionRow[]> {
    return selectView<AdminRetentionRow>('v_retention_cohorts');
  }
  economy(days: number): Promise<AdminEconomyRow[]> {
    return selectView<AdminEconomyRow>('v_economy_daily', days);
  }
  catchQuality(days: number): Promise<AdminCatchQualityRow[]> {
    return selectView<AdminCatchQualityRow>('v_catch_quality', days);
  }
  spamFlags(): Promise<AdminSpamFlagRow[]> {
    return selectView<AdminSpamFlagRow>('v_spam_flags');
  }
  imports(): Promise<AdminImportLogRow[]> {
    return selectView<AdminImportLogRow>('v_import_log');
  }
  dexMismatch(): Promise<AdminDexMismatchRow[]> {
    return selectView<AdminDexMismatchRow>('v_dex_mismatch');
  }
  recentEvents(): Promise<AdminEventRow[]> {
    // 뷰 LIMIT 유지를 위해 id 내림차순 재정렬만
    return selectView<AdminEventRow>('v_events_recent').then(rows => rows.sort((a, b) => b.id - a.id));
  }
  async userEvents(userId: string, limit = 500): Promise<AdminEventRow[]> {
    if (!supabase) throw new Error('클라우드 미설정');
    const { data, error } = await supabase.rpc('fn_user_events',
      { p_uid: userId, p_limit: limit });
    if (error) throw new Error(`유저 이벤트 조회 실패: ${error.message}`);
    return ((data ?? []) as AdminEventRow[]).sort((a, b) => a.id - b.id);
  }
  projectRef(): string | null {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) return null;
    try { return new URL(url).hostname.split('.')[0]; } catch { return null; }
  }
}

export function createHttpApi():
{ game: Backend; auth: AuthApi; storage: StorageApi; admin: AdminApi } {
  return {
    game: new HttpBackend(),
    auth: new HttpAuth(),
    storage: new HttpStorage(),
    admin: new HttpAdmin(),
  };
}
