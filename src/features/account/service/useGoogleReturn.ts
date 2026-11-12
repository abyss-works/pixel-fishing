import { useEffect } from 'react';
import { api } from '../../../platform/api';
import { GOOGLE_TAG, googleOutcome, googleStartFailedText, overwriteCanceledText } from '../model/googleFlow';

type Tone = 'info' | 'gold' | 'warn';

// 구글 인증에서 돌아온 직후 한 번 처리한다. 돌아온 주소는 읽는 즉시 지워져 새로고침이나 개발 모드의 효과 재실행에서 다시 읽히지 않는다.
// 로그인과 연결이 끝난 세션은 이미 새 계정이라, 부팅이 그 세션으로 계정과 진행을 읽는다. 여기서는 결과를 알리는 일만 한다.
export function useGoogleReturn({ setToast, askOverwrite, showNotice, reopenAccount }: {
  setToast: (message: string, tone?: Tone) => void;
  /** 이미 다른 계정에 연결된 구글 계정으로 로그인해 덮어쓸지 묻는다. 로그인하면 true */
  askOverwrite: () => Promise<boolean>;
  showNotice: (title: string, body: string) => Promise<void>;
  /** 덮어쓰기를 취소하고 게스트 그대로 계정 관리 창을 다시 연다 */
  reopenAccount: () => void;
}) {
  useEffect(() => {
    if (!api.auth.isConfigured) return;
    const landing = api.auth.takeGoogleLanding();
    if (!landing) return;
    const outcome = googleOutcome(landing);
    if (!outcome) return;
    if (outcome.kind === 'none') return;
    if (outcome.kind === 'toast') { setToast(outcome.text, outcome.tone); return; }
    if (outcome.kind === 'notice') { void showNotice(outcome.title, outcome.body); return; }
    void askOverwrite().then(async proceed => {
      if (!proceed) { setToast(overwriteCanceledText, 'info'); reopenAccount(); return; }
      const r = await api.auth.startGoogle('sign-in', GOOGLE_TAG.signIn);
      if (!r.ok) setToast(googleStartFailedText, 'warn');
    });
    // 마운트 1회 확인 - 호출부의 콜백은 매 렌더 새로 만들어지고 읽는 시점의 값이면 충분하다
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
