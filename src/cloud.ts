// P1: 클라우드 저장 (Supabase 익명 로그인 + saves 테이블, RLS)
// 환경변수가 없으면 supabase = null → 게임은 로컬 저장만으로 정상 동작 (오프라인 모드).
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from './logic';

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

export interface CloudSave {
  data: unknown;
}

export async function fetchCloudSave(): Promise<CloudSave | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('saves')
    .select('data')
    .maybeSingle();
  if (error || !data) return null;
  return { data: data.data };
}

export async function pushCloudSave(userId: string, state: GameState): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('saves').upsert({
    user_id: userId,
    data: state,
    updated_at: new Date().toISOString(),
  });
  return !error;
}
