import { useQuery } from '@tanstack/react-query';
import { readPlayer } from '../../../platform/api';
import type { PublicProfile } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { useConsentReady } from '../../account/service/consentGate';

// 다른 플레이어의 공개 프로필(닉네임·배·낚싯대·명성·도감·유물) — 정보 창을 열 때 읽는다.
export type { PublicProfile };

export function usePlayerProfile(uid: string) {
  const { ready, uid: me } = useSession();
  const consentReady = useConsentReady();
  const unavailable = ready && me === null;
  const q = useQuery({
    queryKey: ['player', uid],
    queryFn: () => readPlayer(uid),
    enabled: ready && consentReady && me !== null,
  });
  return {
    /** 공개 프로필. 로컬 모드(서버 없음)면 null */
    profile: q.data,
    loading: !unavailable && q.isPending && !q.isError,
    failed: q.isError,
    unavailable,
    retry: () => { void q.refetch(); },
  };
}
