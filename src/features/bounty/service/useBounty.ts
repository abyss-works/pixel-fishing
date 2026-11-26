import { useQuery } from '@tanstack/react-query';
import { readBounty } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { useConsentReady } from '../../account/service/consentGate';
import { bountyKey } from './queryKeys';

// 수배판 스냅샷 조회 — views의 readBounty 직접 참조를 이 뒤에 숨긴다.
// 반환형 { snap, loaded, refresh }는 수동 조회 시절과 동일하다.
// 세션 게이트와 약관 수락 게이트가 선 뒤에만 읽는다. 일시 실패(토큰 갱신 경합·순단)는 두 번까지 다시 시도한다.
// 클라우드 미설정은 실패가 아니라 null 값이다.
export function useBounty(opts?: { refetchOnMount?: boolean | 'always' }) {
  const { ready, uid } = useSession();
  const consentReady = useConsentReady();
  const q = useQuery({
    queryKey: bountyKey(uid),
    enabled: ready && consentReady,
    queryFn: readBounty,
    staleTime: 60_000,
    refetchOnMount: opts?.refetchOnMount,
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
