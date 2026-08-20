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

// saves는 append-only(0003) — 유저당 여러 행이 있을 수 있어 "가장 최근 행"만 가져온다.
export async function fetchCloudSave(): Promise<CloudSave | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('saves')
    .select('data')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { data: data.data };
}

export type PushResult = 'ok' | 'conflict' | 'error';

// 저장은 /api/save 경유(서버가 불변식 검증) — 프로덕션 DB는 클라이언트 직접 쓰기 금지(0002).
// 로컬 vite dev에는 함수가 없으므로 직접 insert 폴백(개발용 Supabase 프로젝트는 쓰기 정책 유지).
// insert만 하는 이유(0003): saves는 append-only라 update/upsert로 이전 행을 덮으면 안 된다.
export async function pushCloudSave(state: GameState): Promise<PushResult> {
  if (!supabase) return 'error';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'error';

  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(state),
    });
    if ((res.headers.get('content-type') ?? '').includes('application/json')) {
      if (res.ok) return 'ok';
      if (res.status === 409) return 'conflict'; // 검증 거부(변조/기기 충돌) — 클라우드 채택
      return 'error';
    }
    // JSON이 아니면 API 미존재(로컬 dev SPA 폴백 등) → 직접 insert로
  } catch { /* 네트워크 오류 → 직접 insert 시도 */ }

  const { error } = await supabase.from('saves').insert({
    user_id: session.user.id,
    data: state,
    updated_at: new Date().toISOString(),
  });
  return error ? 'error' : 'ok';
}
