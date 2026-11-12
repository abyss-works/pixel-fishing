import { useState } from 'react';
import { useGoogleReturn } from '../../../../features/account/service/useGoogleReturn';
import { useDialogs } from '../../../ui/useDialogs';
import type { Notify } from '../../../ui/hud/messageFeed';
import GoogleOverwriteDialog from './GoogleOverwriteDialog';

// 구글 인증에서 돌아온 직후의 안내를 띄운다. 돌아오지 않은 평소에는 아무것도 그리지 않는다.
// 결과 알림은 메시지 창, 실패 안내는 안내 창, 이미 다른 계정에 연결된 구글 계정을 고른 경우는 충돌 확인 창으로 보인다.
export default function GoogleReturn({ setToast, reopenAccount }: {
  setToast: Notify;
  /** 덮어쓰기를 되돌아가면 게스트 그대로 계정 관리 창을 다시 연다 */
  reopenAccount: () => void;
}) {
  const { notice, dialogs } = useDialogs();
  const [answer, setAnswer] = useState<((proceed: boolean) => void) | null>(null);

  useGoogleReturn({
    setToast, reopenAccount,
    showNotice: (title, body) => notice({ title, body }),
    askOverwrite: () => new Promise<boolean>(resolve => setAnswer(() => resolve)),
  });

  const reply = (proceed: boolean) => { answer?.(proceed); setAnswer(null); };
  return (
    <>
      {dialogs}
      {answer && <GoogleOverwriteDialog onProceed={() => reply(true)} onBack={() => reply(false)} />}
    </>
  );
}
