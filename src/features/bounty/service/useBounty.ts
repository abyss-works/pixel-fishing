import { useQuery } from '@tanstack/react-query';
import { readBounty } from '../../../platform/api';
import { bountyKey } from './queryKeys';

// 수배판 스냅샷 조회 — views의 readBounty 직접 참조를 이 뒤에 숨긴다.
// 반환형 { snap, loaded, refresh }는 수동 조회 시절과 동일하다.
// 실패는 재시도 없이 null 스냅샷(오프라인 UI)으로 수렴한다 — 기존 동작 유지.
export function useBounty() {
  const q = useQuery({
    queryKey: bountyKey(),
    queryFn: readBounty,
    staleTime: 60_000,
  });
  return {
    snap: q.data ?? null,
    loaded: !q.isPending,
    refresh: () => {
      void q.refetch();
    },
  };
}
