import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { liveAvailable, readPublicGuilds } from '../../../platform/api';
import type { PublicGuildSort } from '../../../game/rules/guild';
import { useSession } from '../../account/service/session';
import { useConsentReady } from '../../account/service/consentGate';

export const publicGuildsQueryKey = (uid: string | null, q: string, sort: PublicGuildSort) =>
  ['publicGuilds', uid, q.trim(), sort] as const;

/** 자유 가입 공개 길드 목록 — 계정 유저가 미가입 화면에서 검색·정렬할 때 읽는다 */
export function usePublicGuilds(q: string, sort: PublicGuildSort, enabled = true) {
  const { ready, uid } = useSession();
  const consentReady = useConsentReady();
  const query = useQuery({
    queryKey: publicGuildsQueryKey(uid, q, sort),
    queryFn: () => readPublicGuilds({ q: q.trim() || undefined, sort }),
    enabled: enabled && ready && consentReady && liveAvailable,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  return {
    guilds: query.data ?? [],
    loading: query.isPending,
    fetching: query.isFetching,
    failed: query.isError,
    refresh: query.refetch,
  };
}
