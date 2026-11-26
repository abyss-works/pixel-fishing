import { useState } from 'react';
import type { GameAction } from '../../../../game/rules/actions';
import type { GameState } from '../../../../game/rules/logic';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { useQuestInfo } from '../../../../features/bounty/service/useQuestInfo';
import type { Notify } from '../../../ui/hud/messageFeed';
import { confirmAndAbandonQuest } from './abandonQuest';
import type { ConfirmDialogFn } from './abandonQuest';
import QuestInfoWindow from './QuestInfoWindow';

// 의뢰 창 - 메뉴 줄의 의뢰를 눌러 여는, 지금 수주 중인 의뢰를 보는 창. 값은 의뢰 기능에서 읽어 화면에 넘긴다.
export default function QuestInfoModal({ game, dispatch, setToast, confirm, onClose }: {
  game: GameState;
  dispatch?: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast?: Notify;
  confirm?: ConfirmDialogFn;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <QuestInfoWindow
      info={useQuestInfo(game)}
      busy={busy}
      onAbandon={(quest, hasTicket) => {
        void confirmAndAbandonQuest({ quest, hasTicket, busy, setBusy, confirm, dispatch, setToast });
      }}
      onClose={onClose}
    />
  );
}
