import { useQuery, useQueryClient } from '@tanstack/react-query';
import { friendAction, readFriends } from '../../../platform/api';
import type { FriendOp, FriendOpResult } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { groupFriends } from '../model/friends';

// 친구 목록 — 세션이 선 뒤 읽는다. 접속 상태가 바뀌므로 열려 있는 동안 30초마다 다시 읽는다.
// offline: 클라우드 미설정(로컬 모드)이라 친구 기능이 없다.
const REFRESH = 30_000;

export function useFriends(enabled: boolean) {
  const { ready, uid } = useSession();
  const client = useQueryClient();
  const key = ['friends', uid];
  const q = useQuery({
    queryKey: key,
    queryFn: readFriends,
    enabled: ready && enabled,
    refetchInterval: REFRESH,
    retry: 1,
  });
  /** 요청·수락·삭제 — 성공하면 목록을 다시 읽는다 */
  const act = async (op: FriendOp): Promise<FriendOpResult> => {
    const result = await friendAction(op);
    if (result.ok) await client.invalidateQueries({ queryKey: key });
    return result;
  };
  return {
    groups: q.data ? groupFriends(q.data) : null,
    loading: q.isPending,
    failed: q.isError,
    offline: q.isSuccess && q.data === null,
    act,
  };
}
