import { GUEST_VILLAGE_ONLY_TEXT } from '../../../features/gameplay/service/useGame';
import { hasOpenWindows } from '../../ui/openWindows';
import type { Notify } from '../../ui/hud/messageFeed';

/**
 * 게스트가 포구에서 되밀렸을 때 부르는 처리를 만든다. 서버가 거부할 때와 같은 안내를 메시지 창에 남기고 계정 관리 창을 연다.
 * 계정 관리 창이나 다른 창이 이미 떠 있으면 안내도 창도 다시 띄우지 않는다.
 */
export function createGuestBlockedNotice({ accountOpen, openAccount, setToast }: {
  accountOpen: boolean;
  openAccount: () => void;
  setToast: Notify;
}): () => void {
  return () => {
    if (accountOpen || hasOpenWindows()) return;
    setToast(GUEST_VILLAGE_ONLY_TEXT, 'warn');
    openAccount();
  };
}
