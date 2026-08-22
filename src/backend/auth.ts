// P1: 클라우드 저장 (Supabase 익명 로그인 + saves 테이블, RLS)
// 환경변수가 없으면 supabase = null → 게임은 로컬 저장만으로 정상 동작 (오프라인 모드).
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '../game/logic';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

// 익명 세션 확보 — 이미 세션이 있으면 재사용 (기기당 계정 유지)
export async function ensureSession(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) return null;
  return data.user?.id ?? null;
}

// ---------- 계정 로그인 (v0.4.0) ----------
// 게스트(익명)는 유지하고, 가입 = 익명 계정에 이메일 자격을 붙이는 "승격"이다 —
// uid가 안 바뀌므로 세이브/DB/RLS 전부 무변경. 로그인은 다른 계정으로 갈아타는 것.

// code: Supabase 에러 코드 원문 — 통합 계정 폼(v0.4.2)이 email_exists 분기에 쓴다
export type AuthResult = { ok: true } | { ok: false; msg: string; code?: string };

// Supabase 에러 코드 → 유저가 행동할 수 있는 한국어 안내 (코드 없으면 원문 노출)
const AUTH_MSG: Record<string, string> = {
  email_exists: '이미 가입된 이메일이에요.',
  user_already_exists: '이미 가입된 이메일이에요.',
  email_provider_disabled: '서버에서 이메일 가입이 꺼져 있어요 (Supabase 대시보드 → Email provider ON 필요).',
  signup_disabled: '서버에서 가입이 꺼져 있어요 (Supabase 대시보드 설정 필요).',
  weak_password: '비밀번호가 너무 짧아요 (6자 이상).',
  invalid_credentials: '이메일 또는 비밀번호가 틀렸어요.',
  validation_failed: '이메일 형식을 확인하세요.',
  over_email_send_rate_limit: '메일을 너무 자주 보냈어요 — 잠시 후 다시 시도하세요.',
  email_not_confirmed: '이메일 확인이 필요해요 — 받은편지함을 확인하세요. (Confirm email OFF 권장)',
  // 이전 가입 시도가 비밀번호만 심고 이메일 확인에 걸린 상태에서 재클릭하면 발생
  same_password: '이미 이 비밀번호로 처리된 시도가 있어요 — 다른 비밀번호로 다시 가입하거나, 메일함의 확인 링크를 눌러 완료하세요.',
};

const authErr = (e: { message?: string; code?: string; status?: number } | null): AuthResult => ({
  ok: false,
  msg: (e?.code && AUTH_MSG[e.code]) ?? `${e?.message ?? '알 수 없는 오류'}${e?.status ? ` (${e.status})` : ''}`,
  code: e?.code,
});

// 로그인된 영구 계정의 이메일 (게스트/미설정이면 null)
export async function currentAccount(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  const u = session?.user;
  return u && !u.is_anonymous && u.email ? u.email : null;
}

// 가입 = 익명 → 영구 승격 (updateUser가 익명 유저에 이메일 자격을 붙이는 Supabase 공식 경로)
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, msg: '클라우드 미설정' };
  const { error } = await supabase.auth.updateUser({ email, password });
  return error ? authErr(error) : { ok: true };
}

// 다른 계정으로 로그인 — 현재 기기의 게스트 진행은 버려진다 (호출 전 UI가 경고+백업)
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, msg: '클라우드 미설정' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? authErr(error) : { ok: true };
}

export async function signOutAccount(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, msg: '클라우드 미설정' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  return error ? authErr(error) : { ok: true };
}

// 비밀번호 재설정 착지 후 새 비밀번호 적용 (PASSWORD_RECOVERY 이벤트에서 호출)
export async function applyNewPassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, msg: '클라우드 미설정' };
  const { error } = await supabase.auth.updateUser({ password });
  return error ? authErr(error) : { ok: true };
}

// 이사 코드 — 세이브를 사람이 옮길 수 있는 문자열로 (설정 탭 내보내기 + 동기화 실패 구조용 공용)
export const saveCode = (state: GameState): string =>
  btoa(encodeURIComponent(JSON.stringify(state)));

// (v0.5.0) 세이브 읽기/쓰기는 backend/http.ts(HttpBackend)로 이관 — 이 파일은 인증·이사코드만.
// 구 pushCloudSave/fetchCloudSave/fetchCoupon 삭제: 쓰기는 /api/action, 동적 쿠폰 조회는 서버 소관.
