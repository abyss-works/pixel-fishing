import { useQuery, useQueryClient } from '@tanstack/react-query';
import { guildAction, liveAvailable, readGuild } from '../../../platform/api';
import type { GuildOp, GuildOpResult } from '../../../platform/api';
import { useSession } from '../../account/service/session';

// 내 길드 — 계정 유저만, 세션이 선 뒤 읽는다. 길드원의 접속 상태가 바뀌므로 poll이면 30초마다 다시 읽는다.
// 로컬 모드에는 게임 서버가 없어 길드 기능이 없다(available이 거짓).
const REFRESH = 30_000;

export function useGuild(account: boolean, poll = false) {
  const { ready, uid } = useSession();
  const client = useQueryClient();
  const key = ['guild', uid];
  const q = useQuery({
    queryKey: key,
    queryFn: readGuild,
    enabled: ready && account && liveAvailable,
    refetchInterval: poll ? REFRESH : false,
    retry: 1,
  });
  /** 만들기·가입·코드 발급·떠나기·내보내기·위임 — 성공하면 다시 읽는다 */
  const act = async (op: GuildOp): Promise<GuildOpResult> => {
    const result = await guildAction(op);
    if (result.ok) await client.invalidateQueries({ queryKey: key });
    return result;
  };
  return {
    available: liveAvailable && account,
    guild: q.data ?? null,
    loading: q.isPending,
    failed: q.isError,
    you: uid,
    act,
  };
}
