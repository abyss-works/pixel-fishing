import { useQuery } from '@tanstack/react-query';
import { readLastPosition } from '../../../platform/api';
import type { LastPosition } from '../../../platform/api';
import { useSession } from '../../account/service/session';

/**
 * 마지막 위치 — 세션 게이트가 선 뒤 한 번 읽는다. 다시 접속했을 때 그 자리에서 시작하는 데만 쓴다.
 * settled는 읽기가 끝났는지(실패 포함)이고, 실패하거나 기록이 없으면 position은 null이다.
 */
export function useLastPosition(): { settled: boolean; position: LastPosition | null } {
  const { ready, uid } = useSession();
  const q = useQuery({
    queryKey: ['lastPosition', uid],
    queryFn: readLastPosition,
    enabled: ready,
    staleTime: Infinity,
    retry: 1,
  });
  return { settled: q.isSuccess || q.isError, position: q.data ?? null };
}
