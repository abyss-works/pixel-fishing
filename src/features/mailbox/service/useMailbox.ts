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

/** 접속 안내를 이미 판정한 계정 — 계정마다 첫 조회 결과로 한 번만 판정한다 */
const noticeChecked = new Set<string>();

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
  const mails = q.data ?? null;
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const patch = (id: number, fields: Partial<MailItem>) =>
    client.setQueryData<MailItem[] | null>(key, list => list?.map(m => (m.id === id ? { ...m, ...fields } : m)) ?? list);

  /** 처음 열어 본 우편에 읽음을 남긴다. 화면은 바로 읽은 것으로 보이고, 기록 실패는 다시 읽어 바로잡는다 */
  const markRead = (id: number) => {
    const target = mails?.find(m => m.id === id);
    if (!target || target.readAt !== null) return;
    patch(id, { readAt: new Date().toISOString() });
    markMailRead(id).catch(() => { void refresh(); });
  };

  /** 골드 받기 — 게임 액션으로 보낸다. 받으면 바로 받은 것으로 보이고, 결과와 상관없이 목록을 다시 읽는다 */
  const claim = (dispatch: (action: GameAction) => MaybePromise<DispatchResult>, id: number): MaybePromise<DispatchResult> => {
    const settle = (result: DispatchResult) => {
      if (result.status === 'ok') {
        const now = new Date().toISOString();
        patch(id, { claimedAt: now, readAt: mails?.find(m => m.id === id)?.readAt ?? now });
      }
      void refresh();
      return result;
    };
    const sent = dispatch({ type: 'claimMail', id });
    if (sent instanceof Promise) return sent.then(settle, (e: unknown) => { void refresh(); throw e; });
    return when(sent, settle);
  };

  /**
   * 접속 안내 판정 — 이 계정의 첫 조회가 끝났을 때 한 번만 true를 돌려줄 수 있다(남은 우편이 있을 때).
   * 같은 계정의 이후 조회나 재마운트에서는 false다. 계정이 바뀌면 그 계정의 첫 조회로 다시 판정한다.
   */
  const takeLoginNotice = (): boolean => {
    if (!uid || !mails || noticeChecked.has(uid)) return false;
    noticeChecked.add(uid);
    return pendingCount(mails) > 0;
  };

  return {
    mails,
    pending: mails ? pendingCount(mails) : 0,
    loading: q.isPending,
    failed: q.isError,
    offline: q.isSuccess && q.data === null,
    markRead,
    claim,
    takeLoginNotice,
  };
}
