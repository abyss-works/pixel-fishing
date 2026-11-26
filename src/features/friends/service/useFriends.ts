import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isUnauthorizedFailure } from '../../../core/retryPolicy';
import { friendAction, readFriends } from '../../../platform/api';
import type { FriendOp, FriendOpResult } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { useConsentReady } from '../../account/service/consentGate';
import { groupFriends } from '../model/friends';

// 친구 목록 — 세션이 선 뒤 읽는다. 접속 상태가 바뀌므로 poll이 참인 동안(친구 창이 열려 있을 때) 30초마다 다시 읽는다.
// 세션 만료(401)면 폴링을 멈춘다. offline: 클라우드 미설정(로컬 모드)이라 친구 기능이 없다.
const REFRESH = 30_000;

export function useFriends(enabled: boolean, poll = false) {
  const { ready, uid } = useSession();
  const consentReady = useConsentReady();
  const client = useQueryClient();
  const key = ['friends', uid];
  const q = useQuery({
    queryKey: key,
    queryFn: readFriends,
    enabled: ready && consentReady && enabled,
    refetchInterval: query => (poll && !isUnauthorizedFailure(query.state.error) ? REFRESH : false),
  });
  /** 요청·수락·삭제 — 성공하면 목록을 다시 읽는다 */
  const act = async (op: FriendOp): Promise<FriendOpResult> => {
    const result = await friendAction(op);
    if (result.ok) {
      // 닉네임 검색 제안의 관계 표시도 낡는다
      void client.invalidateQueries({ queryKey: ['player-search'] });
      await client.invalidateQueries({ queryKey: key });
    }
    return result;
  };
  return {
    groups: q.data ? groupFriends(q.data) : null,
    loading: q.isPending,
    failed: q.isError,
    offline: q.isSuccess && q.data === null,
    refresh: () => { void q.refetch(); },
    act,
  };
}
