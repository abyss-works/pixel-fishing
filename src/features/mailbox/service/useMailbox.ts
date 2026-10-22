import { useQuery, useQueryClient } from '@tanstack/react-query';
import { markMailRead, readMails } from '../../../platform/api';
import type { MailItem } from '../../../platform/api';
import type { GameAction } from '../../../game/rules/actions';
import { when } from '../../../shared/lib/when';
import { useSession } from '../../account/service/session';
import type { DispatchResult, MaybePromise } from '../../gameplay/service/types';
import { pendingCount } from '../model/mailbox';

// 우편함 조회 — 세션 게이트가 선 뒤 읽는다. 운영자가 보낸 우편이 접속 중에도 보이도록 몇 분마다 다시 읽는다.
// offline: 클라우드 미설정(로컬 모드)이라 우편함이 없다.
const STALE = 60_000;
const REFRESH = 5 * 60_000;

export function useMailbox() {
  const { ready, uid } = useSession();
  const client = useQueryClient();
  const key = ['mailbox', uid];
  const q = useQuery({
    queryKey: key,
    queryFn: readMails,
    enabled: ready,
    staleTime: STALE,
    refetchInterval: REFRESH,
    retry: 1,
  });
  const mails = (q.data ?? null) as MailItem[] | null;
  const refresh = () => client.invalidateQueries({ queryKey: key });

  /** 처음 열어 본 우편에 읽음을 남긴다. 화면은 바로 읽은 것으로 보이고, 기록 실패는 다음 조회가 바로잡는다 */
  const markRead = (id: number) => {
    const target = mails?.find(m => m.id === id);
    if (!target || target.readAt !== null) return;
    const now = new Date().toISOString();
    client.setQueryData<MailItem[] | null>(key, list => list?.map(m => (m.id === id ? { ...m, readAt: now } : m)) ?? list);
    markMailRead(id).catch(() => { void refresh(); });
  };

  /** 골드 받기 — 게임 액션으로 보내고, 결과와 상관없이 목록을 다시 읽는다 */
  const claim = (dispatch: (action: GameAction) => MaybePromise<DispatchResult>, id: number): MaybePromise<DispatchResult> =>
    when(dispatch({ type: 'claimMail', id }), result => {
      void refresh();
      return result;
    });

  return {
    mails,
    pending: mails ? pendingCount(mails) : 0,
    loading: q.isPending,
    failed: q.isError,
    offline: q.isSuccess && q.data === null,
    markRead,
    claim,
  };
}
