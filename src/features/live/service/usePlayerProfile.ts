import { useQuery } from '@tanstack/react-query';
import { readPlayer } from '../../../platform/api';
import type { PublicProfile } from '../../../platform/api';

// 다른 플레이어의 공개 프로필(닉네임·배·명성·도감 수) — 정보 창을 열 때 읽는다.
export type { PublicProfile };

export function usePlayerProfile(uid: string) {
  const q = useQuery({ queryKey: ['player', uid], queryFn: () => readPlayer(uid), retry: 1 });
  return {
    /** 공개 프로필. 로컬 모드(서버 없음)면 null */
    profile: q.data,
    loading: q.isPending,
    failed: q.isError,
  };
}
