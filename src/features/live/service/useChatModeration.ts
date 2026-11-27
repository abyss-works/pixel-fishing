import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changeBlock, readBlocks, reportChat } from '../../../platform/api';
import type { BlockedUser, ChatActionError } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { useConsentReady } from '../../account/service/consentGate';
import { hideAuthor } from './useLive';

// 채팅 신고와 개인 차단 — 서버 함수로 보낸다. 차단하면 그 사람의 채팅 줄을 화면에서 바로 지우고,
// 이후 줄은 서버가 보내지 않는다. 차단 목록은 목록이나 플레이어 정보 창을 펼쳤을 때만 읽는다.
export type { BlockedUser, ChatActionError };

export function useChatModeration(listOpen: boolean) {
  const { ready, uid } = useSession();
  const consentReady = useConsentReady();
  const client = useQueryClient();
  const key = ['chat-blocks', uid];
  const q = useQuery({
    queryKey: key,
    // readBlocks가 던지는 AppError를 감싸지 않고 그대로 전파해 QueryProvider의 5xx/429 재시도 정책이 동작하게 한다
    queryFn: readBlocks,
    enabled: ready && consentReady && uid !== null && listOpen,
  });
  const unavailable = ready && uid === null;
  const loading = listOpen && !unavailable && q.isPending && !q.isError;
  const failed = q.isError || (listOpen && unavailable);

  const change = async (op: 'block' | 'unblock', target: string): Promise<ChatActionError | null> => {
    const result = await changeBlock(op, target);
    if ('error' in result) return result.error;
    client.setQueryData(key, result);
    void client.invalidateQueries({ queryKey: ['player-search'] });
    // 차단하면 서버가 친구 관계도 끊는다
    if (op === 'block') { hideAuthor(target); void client.invalidateQueries({ queryKey: ['friends'] }); }
    return null;
  };

  return {
    /** 차단 목록. 읽는 중이거나 실패했으면 null, 서버 오류 코드면 문자열 */
    blocks: q.data === undefined ? null : 'error' in q.data ? q.data.error : q.data.blocks,
    loading,
    failed,
    /** 차단 목록 다시 읽기 */
    reload: () => { void q.refetch(); },
    /** 그 사람을 차단했는가. 목록을 아직 못 읽었으면 null */
    isBlocked: (target: string): boolean | null =>
      q.data === undefined || 'error' in q.data ? null : q.data.blocks.some(b => b.uid === target),
    block: (target: string) => change('block', target),
    unblock: (target: string) => change('unblock', target),
    report: async (id: number): Promise<ChatActionError | null> => {
      const result = await reportChat(id);
      return 'error' in result ? result.error : null;
    },
  };
}
