import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changeBlock, readBlocks, reportChat } from '../../../platform/api';
import type { BlockedUser, ChatActionError } from '../../../platform/api';
import { useSession } from '../../account/service/session';
import { hideAuthor } from './useLive';

// 채팅 신고와 개인 차단 — 서버 함수로 보낸다. 차단하면 그 사람의 채팅 줄을 화면에서 바로 지우고,
// 이후 줄은 서버가 보내지 않는다. 차단 목록은 목록이나 플레이어 정보 창을 펼쳤을 때만 읽는다.
export type { BlockedUser, ChatActionError };

export function useChatModeration(listOpen: boolean) {
  const { ready, uid } = useSession();
  const client = useQueryClient();
  const key = ['chat-blocks', uid];
  const q = useQuery({ queryKey: key, queryFn: readBlocks, enabled: ready && uid !== null && listOpen, retry: false });

  const change = async (op: 'block' | 'unblock', target: string): Promise<ChatActionError | null> => {
    const result = await changeBlock(op, target);
    if ('error' in result) return result.error;
    client.setQueryData(key, result);
    // 차단하면 서버가 친구 관계도 끊는다
    if (op === 'block') { hideAuthor(target); void client.invalidateQueries({ queryKey: ['friends'] }); }
    return null;
  };

  return {
    /** 차단 목록. 읽는 중이면 null, 실패하면 이유 */
    blocks: q.data === undefined ? null : 'error' in q.data ? q.data.error : q.data.blocks,
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
