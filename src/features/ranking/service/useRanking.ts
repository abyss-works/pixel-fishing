import { useQuery } from '@tanstack/react-query';
import { readRanking } from '../../../platform/api';
import type { RankingBiggestRow, RankingBoard } from '../../../platform/api';
import { useSession } from '../../account/service/session';

// 랭킹 조회 — 세션 게이트가 선 뒤 읽는다(내 순위가 세션 토큰에 달려 있다).
// 서버가 60초 동안 같은 상위 목록을 돌려줄 수 있어 같은 주기로 신선하다고 본다.
// offline: 클라우드 미설정(로컬 모드)이라 랭킹이 없다.
const STALE = 60_000;

export function useRankingBoard(board: 'fame' | 'dex') {
  const { ready, uid } = useSession();
  const q = useQuery({
    queryKey: ['ranking', board, uid],
    queryFn: () => readRanking(board),
    enabled: ready,
    staleTime: STALE,
    retry: 1,
  });
  return { data: (q.data ?? null) as RankingBoard | null, loading: q.isPending, failed: q.isError, offline: q.isSuccess && q.data === null };
}

export function useRankingBiggest() {
  const { ready, uid } = useSession();
  const q = useQuery({
    queryKey: ['ranking', 'biggest', uid],
    queryFn: () => readRanking('biggest'),
    enabled: ready,
    staleTime: STALE,
    retry: 1,
  });
  return {
    species: (q.data?.species ?? null) as RankingBiggestRow[] | null,
    loading: q.isPending, failed: q.isError, offline: q.isSuccess && q.data === null,
  };
}
