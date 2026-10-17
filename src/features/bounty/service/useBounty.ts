import { useQuery } from '@tanstack/react-query';
import { readBounty } from '../../../platform/api';
import { bountyKey } from './queryKeys';

// 수배판 스냅샷 조회 — views의 readBounty 직접 참조를 이 뒤에 숨긴다.
// 반환형 { snap, loaded, refresh }는 수동 조회 시절과 동일하다.
// 실패(세션 전·토큰 갱신 경합·순단)는 두 번까지 다시 시도한다. 끝내 실패하면 snap은 null로 남고
// 부트스트랩이 세션을 세운 뒤 다시 무효화한다. 클라우드 미설정은 실패가 아니라 null 값이다.
export function useBounty() {
  const q = useQuery({
    queryKey: bountyKey(),
    queryFn: readBounty,
    staleTime: 60_000,
    retry: 2,
  });
  return {
    snap: q.data ?? null,
    loaded: !q.isPending,
    refresh: () => {
      void q.refetch();
    },
  };
}
