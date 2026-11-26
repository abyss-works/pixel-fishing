import { useQuery } from '@tanstack/react-query';
import { gameDay, readFortuneHistory } from '../../../platform/api';
import type { FortuneHistory } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { useConsentReady } from '../../account/service/consentGate';

// 월간 운세 이력 조회 — 세션 게이트가 선 뒤 로그인 계정의 월별 기록을 읽는다.
// offline: 클라우드 미설정(로컬 모드)이라 서버 이력이 없다.
const STALE = 60_000;

export function useFortuneHistory(month: string | null, enabled: boolean) {
  const { ready, uid } = useSession();
  const consentReady = useConsentReady();
  const q = useQuery({
    queryKey: ['fortune', 'history', month ?? 'current', uid, gameDay()],
    queryFn: () => readFortuneHistory(month ?? undefined),
    enabled: ready && consentReady && enabled,
    staleTime: STALE,
  });
  return {
    data: (q.data ?? null) as FortuneHistory | null,
    loading: enabled && q.isPending,
    failed: enabled && q.isError,
    offline: enabled && q.isSuccess && q.data === null,
    retry: () => { void q.refetch(); },
  };
}
