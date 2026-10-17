// 랭킹 읽기 — 서버 읽기 함수(/api/rank)를 부른다. 다른 사용자의 행을 표에서 직접 읽지 않는다.
// 세션 토큰을 붙이면 내 순위가 함께 온다. supabase 미설정(로컬 dev·테스트)이면 null — 화면이 오프라인 안내를 띄운다.
// 그 밖의 실패는 null로 숨기지 않고 던진다(조회가 다시 시도한다).
import { AppError } from '../../core/errors';
import { supabase } from './auth';
import type { RankingBiggest, RankingBoard } from '../api/types';

export async function readRanking(board: 'fame' | 'dex'): Promise<RankingBoard | null>;
export async function readRanking(board: 'biggest'): Promise<RankingBiggest | null>;
export async function readRanking(board: 'fame' | 'dex' | 'biggest'): Promise<RankingBoard | RankingBiggest | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = session ? { authorization: `Bearer ${session.access_token}` } : {};
  const res = await fetch(`/api/rank?board=${board}`, { headers });
  if (!res.ok) throw new AppError('network', 'ranking read failed', { status: res.status });
  return await res.json() as RankingBoard | RankingBiggest;
}
