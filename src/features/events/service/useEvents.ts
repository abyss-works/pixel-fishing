import { useQuery } from '@tanstack/react-query';
import { readEvents } from '../../../platform/api';
import { useConsentReady } from '../../account/service/consentGate';
import { useSession } from '../../account/service/session';

export const eventsKey = (uid: string | null): readonly [string, string | null] =>
  ['events', uid];

// 라이브 이벤트 스냅샷 조회 — 세션 게이트와 약관 동의 게이트 뒤에만 읽는다.
// offline: 클라우드 미설정이라 스냅샷이 없는 상태(오류와 구분한다).
export function useEvents(opts?: { enabled?: boolean; refetchIntervalMs?: number }) {
  const { ready, uid } = useSession();
  const consentReady = useConsentReady();
  const enabled = ready && consentReady && (opts?.enabled ?? true);
  const q = useQuery({
    queryKey: eventsKey(uid),
    enabled,
    queryFn: readEvents,
    staleTime: 30_000,
    refetchInterval: opts?.refetchIntervalMs,
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
