import { useEffect, useState } from 'react';
import { api } from '../../../platform/api';
import { sendNotice, toastToneFromLogTone } from '../../display/model/toastPolicy';
import type { NoticeSink } from '../../display/model/toastPolicy';
import type { GuestProgress } from '../model/accountRules';
import { GOOGLE_TAG, googleOutcome, googleStartFailedText, overwriteCanceledText } from '../model/googleFlow';
import {
  activateSailReturnIfPending,
  clearPendingSailReturn,
  isSailReturnReady,
} from './sailReturn';

// 구글 인증에서 돌아온 직후 한 번 처리한다. 돌아온 주소는 읽는 즉시 지워져 새로고침이나 개발 모드의 효과 재실행에서 다시 읽히지 않는다.
// 로그인과 연결이 끝난 세션은 이미 새 계정이라, 부팅이 그 세션으로 계정과 진행을 읽는다. 여기서는 결과를 알리는 일만 한다.
export function useGoogleReturn({ setToast, askOverwrite, showNotice, reopenAccount, progress }: {
  setToast: NoticeSink;
  /** 이미 다른 계정에 연결된 구글 계정으로 로그인해 덮어쓸지 묻는다. 로그인하면 true */
  askOverwrite: () => Promise<boolean>;
  showNotice: (title: string, body: string) => Promise<void>;
  /** 덮어쓰기를 취소하고 게스트 그대로 계정 관리 창을 다시 연다 */
  reopenAccount: () => void;
  /** 이 기기의 게스트 진행. 버릴 진행이 없으면 확인 없이 그 계정으로 로그인하고, 읽는 중이면 읽을 때까지 기다린다 */
  progress: GuestProgress;
}) {
  // 덮어쓰기 확인이 필요한 복귀가 있고 아직 처리하지 않았는가
  const [overwritePending, setOverwritePending] = useState(false);

  useEffect(() => {
    if (!api.auth.isConfigured) {
      if (!isSailReturnReady()) clearPendingSailReturn();
      return;
    }
    const landing = api.auth.takeGoogleLanding();
    if (!landing) {
      if (!isSailReturnReady()) clearPendingSailReturn();
      return;
    }
    const outcome = googleOutcome(landing);
    if (!outcome) {
      clearPendingSailReturn();
      return;
    }
    if (outcome.kind !== 'overwrite') {
      if (landing.error) clearPendingSailReturn();
      else activateSailReturnIfPending();
    }
    if (outcome.kind === 'none') return;
    if (outcome.kind === 'toast') {
      sendNotice(setToast, {
        kind: 'account.authMilestone',
        text: outcome.text,
        tone: toastToneFromLogTone(outcome.tone),
        logTone: outcome.tone,
      });
      return;
    }
    if (outcome.kind === 'notice') { void showNotice(outcome.title, outcome.body); return; }
    setOverwritePending(true);
    // 마운트 1회 확인 - 호출부의 콜백은 매 렌더 새로 만들어지고 읽는 시점의 값이면 충분하다
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 게스트 진행을 읽은 뒤 한 번 결정한다. 버릴 진행이 없으면 확인에서 로그인을 누른 것과 같다
  useEffect(() => {
    if (!overwritePending || progress === 'reading') return;
    setOverwritePending(false);
    void (progress === 'nothing' ? Promise.resolve(true) : askOverwrite()).then(async proceed => {
      if (!proceed) {
        clearPendingSailReturn();
        sendNotice(setToast, { kind: 'account.authMilestone', text: overwriteCanceledText, tone: 'accent', logTone: 'info' });
        reopenAccount();
        return;
      }
      const started = await api.auth.startGoogle('sign-in', GOOGLE_TAG.signIn).then(r => r.ok, () => false);
      if (!started) {
        clearPendingSailReturn();
        sendNotice(setToast, {
          kind: 'account.authMilestone',
          text: googleStartFailedText,
          toastText: '구글 인증 시작 실패',
          tone: 'danger',
        });
      }
    });
    // 콜백은 읽는 시점의 값이면 충분하다
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [overwritePending, progress]);
}
