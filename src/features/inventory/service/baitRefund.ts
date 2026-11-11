import { useState } from 'react';
import type { GameAction } from '../../../game/rules/actions';
import type { BaitRefund } from '../../../game/rules/logic';
import { baitRefundNotice } from '../model/baitRefund';

/**
 * 미끼 환불 안내를 띄우고 닫는다. 영수증이 있으면 한 번 뜨고, 닫으면 영수증을 지우는 액션을 보낸다.
 * 닫은 안내는 서버 응답을 기다리지 않고 바로 숨긴다. 액션이 실패해도 다음 접속에 한 번 더 뜰 뿐이라 조용히 넘긴다.
 * @param ready 세이브가 준비됐는지 - 준비 전의 빈 상태로 판정하지 않는다
 * @param suspended 다른 안내 창(업데이트 소식)이 떠 있거나 뜰 차례면 참 - 끝난 뒤에 띄운다
 * @returns pending은 아직 닫지 않은 영수증이 있는지다. 뒤에 뜰 안내 창이 이 안내 창 뒤로 차례를 미루는 데 쓴다
 */
export function useBaitRefund({ refund, boat, ready, suspended, dispatch }: {
  refund: BaitRefund | null;
  boat: number;
  ready: boolean;
  suspended: boolean;
  dispatch: (action: GameAction) => unknown;
}) {
  const [closed, setClosed] = useState(false);
  const pending = refund !== null && !closed;
  const notice = pending && ready && !suspended ? baitRefundNotice(refund, boat) : null;
  const close = () => {
    if (!pending) return;
    setClosed(true);
    void Promise.resolve(dispatch({ type: 'dismissBaitRefund' })).catch(() => {});
  };
  return { notice, pending, close };
}
