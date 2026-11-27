import { useQuery } from '@tanstack/react-query';
import { readBounty } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { useConsentReady } from '../../account/service/consentGate';
import { bountyKey } from './queryKeys';

// 수배판 스냅샷 조회 — views의 readBounty 직접 참조를 이 뒤에 숨긴다.
// 세션 게이트와 약관 수락 게이트가 선 뒤에만 읽는다. 재시도는 QueryProvider 기본 정책을 따른다.
// failed: 조회 실패(다시 시도할 수 있다). offline: 클라우드 미설정이라 스냅샷이 없는 상태 — 실패와 구분한다.
export function useBounty(opts?: { refetchOnMount?: boolean | 'always' }) {
  const { ready, uid } = useSession();
  const consentReady = useConsentReady();
  const q = useQuery({
    queryKey: bountyKey(uid),
    enabled: ready && consentReady,
    queryFn: readBounty,
    staleTime: 60_000,
    refetchOnMount: opts?.refetchOnMount,
  });
  const snap = q.data ?? null;
  return {
    snap,
    loaded: !q.isPending,
    failed: q.isError,
    offline: !q.isPending && !q.isError && snap === null,
    refresh: () => {
      void q.refetch();
    },
  };
}
