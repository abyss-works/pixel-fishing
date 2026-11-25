import { useQuery, useQueryClient } from '@tanstack/react-query';
import { guildAction, liveAvailable, readGuild } from '../../../platform/api';
import type { GuildOp, GuildOpResult, GuildState } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { useConsentReady } from '../../account/service/consentGate';

// 내 길드 — 계정 유저만, 세션이 선 뒤 읽는다. 길드원의 접속 상태가 바뀌므로 poll이면 30초마다 다시 읽는다.
// 길드가 없으면 내가 넣어 둔 가입 신청(request)을 함께 준다.
// 로컬 모드에는 게임 서버가 없어 길드 기능이 없다(available이 거짓).
const REFRESH = 30_000;

export const guildQueryKey = (uid: string | null) => ['guild', uid];

export function useGuild(account: boolean, poll = false) {
  const { ready, uid } = useSession();
  const consentReady = useConsentReady();
  const client = useQueryClient();
  const key = guildQueryKey(uid);
  const q = useQuery({
    queryKey: key,
    queryFn: readGuild,
    enabled: ready && consentReady && account && liveAvailable,
    refetchInterval: poll ? REFRESH : false,
    retry: 1,
  });
  /** 길드 요청 하나 — 자유 강화 초기화는 응답 값을 캐시에 먼저 반영한 뒤 서버 상태로 재조회한다 */
  const act = async (op: GuildOp): Promise<GuildOpResult> => {
    const result = await guildAction(op);
    if (result.ok) {
      if (op.op === 'resetEnhancements') {
        client.setQueryData<GuildState | undefined>(key, prev => {
          if (!prev?.guild) return prev;
          return {
            ...prev,
            guild: {
              ...prev.guild,
              enhanceResetCount: typeof result.enhanceResetCount === 'number'
                ? result.enhanceResetCount
                : prev.guild.enhanceResetCount + 1,
              bonuses: prev.guild.bonuses.map(b => ({ ...b, enhanceRank: 0, totalRank: b.rank })),
            },
          };
        });
      }
      await client.invalidateQueries({ queryKey: key });
    }
    return result;
  };
  return {
    available: liveAvailable && account,
    guild: q.data?.guild ?? null,
    request: q.data?.request ?? null,
    loading: q.isPending,
    failed: q.isError,
    you: uid,
    act,
  };
}
