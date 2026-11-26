import { useState } from 'react';
import { useGoogleReturn } from '../../../../features/account/service/useGoogleReturn';
import type { GoogleReturnOrigin } from '../../../../features/account/service/sailReturn';
import type { GuestProgress } from '../../../../features/account/model/accountRules';
import { useDialogs } from '../../../ui/useDialogs';
import type { Notify } from '../../../ui/hud/messageFeed';
import GoogleOverwriteDialog from './GoogleOverwriteDialog';

// 구글 인증에서 돌아온 직후의 안내를 띄운다. 돌아오지 않은 평소에는 아무것도 그리지 않는다.
// 결과 알림은 메시지 창, 실패 안내는 안내 창, 이미 다른 계정에 연결된 구글 계정을 고른 경우는 충돌 확인 창으로 보인다(버릴 진행이 없는 게스트는 확인 없이 로그인한다).
export default function GoogleReturn({ setToast, reopenAccount, progress }: {
  setToast: Notify;
  /** 이 기기의 게스트 진행. 버릴 진행이 없으면 충돌 확인 창 없이 그 계정으로 로그인한다 */
  progress: GuestProgress;
  /** 덮어쓰기를 되돌아가면 게스트 그대로 시작 출처에 맞는 계정 창을 다시 연다 */
  reopenAccount: (origin: GoogleReturnOrigin) => void;
}) {
  const { notice, dialogs } = useDialogs();
  const [answer, setAnswer] = useState<((proceed: boolean) => void) | null>(null);
  const [busy, setBusy] = useState(false);

  useGoogleReturn({
    setToast, reopenAccount, progress,
    showNotice: (title, body) => notice({ layer: 'stage', title, body }),
    askOverwrite: () => new Promise<boolean>(resolve => {
      setBusy(false);
      setAnswer(() => resolve);
    }),
    onOverwriteClose: () => {
      setBusy(false);
      setAnswer(null);
    },
  });

  const reply = (proceed: boolean) => {
    if (busy || !answer) return;
    setBusy(true);
    answer(proceed);
  };
  return (
    <>
      {dialogs}
      {answer && <GoogleOverwriteDialog busy={busy} onProceed={() => reply(true)} onBack={() => reply(false)} />}
    </>
  );
}
