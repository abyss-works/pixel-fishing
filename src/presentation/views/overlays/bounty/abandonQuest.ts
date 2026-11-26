import type { BountyQuest } from '../../../../game/content/bounties.js';
import type { GameAction } from '../../../../game/rules/actions.js';
import { REJECT_TEXT } from '../../../../game/rules/logic.js';
import { abandonConfirmSpec } from '../../../../features/bounty/model/abandon';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { when } from '../../../../shared/lib/when';
import type { Notify } from '../../../ui/hud/messageFeed';
import type { useDialogs } from '../../../ui/useDialogs';

export type ConfirmDialogFn = ReturnType<typeof useDialogs>['confirm'];

/** 미완료 의뢰 포기 확인 창을 띄우고 확정 시 서버 액션과 결과 알림을 처리한다 */
export async function confirmAndAbandonQuest({
  quest,
  hasTicket,
  busy,
  setBusy,
  confirm,
  dispatch,
  setToast,
}: {
  quest: Pick<BountyQuest, 'id' | 'difficulty'>;
  hasTicket: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  confirm?: ConfirmDialogFn;
  dispatch?: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast?: Notify;
}): Promise<void> {
  if (busy || !confirm || !dispatch) return;
  const spec = abandonConfirmSpec(quest, hasTicket);
  const ok = await confirm({ layer: 'stage', ...spec });
  if (!ok) return;
  setBusy(true);
  when(dispatch({ type: 'abandonQuest', questId: quest.id }), r => {
    setBusy(false);
    if (!setToast) return;
    if (r.status === 'ok') {
      sendNotice(setToast, { kind: 'bounty.questAbandoned', text: '의뢰를 포기했어요.' });
    } else if (r.status === 'rejected') {
      sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
    }
  });
}
