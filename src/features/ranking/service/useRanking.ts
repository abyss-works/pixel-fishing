import { useQuery } from '@tanstack/react-query';
import { readRanking } from '../../../platform/api';
import type { RankingBoard, RankingBoardId } from '../../../platform/api';
import { useSession } from '../../account/service/session';

// 랭킹 조회 — 세션 게이트가 선 뒤 읽는다(내 순위가 세션 토큰에 달려 있다).
// 서버가 60초 동안 같은 상위 목록을 돌려줄 수 있어 같은 주기로 신선하다고 본다.
// offline: 클라우드 미설정(로컬 모드)이라 랭킹이 없다.
const STALE = 60_000;

function useBoard(board: RankingBoardId, fishId?: string) {
  const { ready, uid } = useSession();
  const q = useQuery({
    queryKey: ['ranking', board, fishId ?? null, uid],
    queryFn: () => readRanking(board, fishId),
    enabled: ready,
    staleTime: STALE,
    retry: 1,
  });
  return { data: (q.data ?? null) as RankingBoard | null, loading: q.isPending, failed: q.isError, offline: q.isSuccess && q.data === null };
}

/** 명성·도감 완성도 순위 */
export const useRankingBoard = (board: 'fame' | 'dex') => useBoard(board);

/** 어종 하나의 크기 순위 */
export const useSpeciesRanking = (fishId: string) => useBoard('species', fishId);
