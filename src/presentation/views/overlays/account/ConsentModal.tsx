import { useState } from 'react';
import { LEGAL_PATHS } from '../../../../features/account/model/googleFlow';
import { deleteAccount } from '../../../../features/account/service/accountActions';
import type { ConsentStatus } from '../../../../features/account/service/consentGate';
import { clearPendingSailReturn } from '../../../../features/account/service/sailReturn';
import Button from '../../../ui/Button';
import ExternalLink from '../../../ui/ExternalLink';
import LinkButton from '../../../ui/LinkButton';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import NoticeBody from '../../../ui/NoticeBody';
import TextInput from '../../../ui/TextInput';

type ConsentStep = 'consent' | 'later' | 'delete';

const INQUIRY_EMAIL = 'contact@abyssworks.dev';
const INQUIRY_MAILTO = `mailto:${INQUIRY_EMAIL}`;

// 이용약관 동의 차단 창 — 닫을 수 없는 앱 모달(closable=false).
// 나중에 하기 대기 상태와 계정 삭제(“삭제” 문구 입력) 확인 단계를 모달 내부 상태로 전환해 차단 레이어 위에서 가리지 않게 처리한다.
export default function ConsentModal({
  consent,
  mismatch,
  error,
  busy,
  onAccept,
  onRetryLoad,
  onReload,
}: {
  consent: ConsentStatus | null;
  mismatch: boolean;
  error: string | null;
  busy: boolean;
  onAccept: () => void | Promise<void>;
  onRetryLoad?: () => void;
  onReload?: () => void;
}) {
  const [step, setStep] = useState<ConsentStep>('consent');
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const enterDelete = () => {
    setConfirmText('');
    setDeleteError(null);
    setStep('delete');
  };

  const leaveDelete = () => {
    setConfirmText('');
    setDeleteError(null);
    setStep('consent');
  };

  const handleDelete = async () => {
    if (confirmText.trim() !== '삭제') {
      setDeleteError('확인 문구가 달라 삭제하지 않았어요.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await deleteAccount();
      if (!r.ok) {
        setDeleteError(`계정을 삭제하지 못했어요. ${r.msg}`);
        return;
      }
      clearPendingSailReturn();
      (onReload ?? (() => window.location.reload()))();
    } catch {
      setDeleteError('계정을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };

  const title = step === 'delete' ? '계정 삭제' : '이용약관 동의';

  const footer = step === 'consent' ? (
    <div className="mt-3 flex flex-col gap-2">
      <Note size="xs" className="my-0 text-center">
        동의하고 시작을 누르면 만 14세 이상이며{' '}
        <ExternalLink href={LEGAL_PATHS.terms}>이용약관</ExternalLink>에 동의하고{' '}
        <ExternalLink href={LEGAL_PATHS.privacy}>개인정보 처리방침</ExternalLink>을 확인한 것으로 봐요.
      </Note>
      <Button variant="primary" full disabled={busy || !consent} onClick={() => void onAccept()}>
        동의하고 시작
      </Button>
      <Button full disabled={busy} onClick={() => setStep('later')}>
        나중에 하기
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" full disabled={busy} onClick={enterDelete}>
          계정 삭제
        </Button>
        <LinkButton variant="ghost" href={INQUIRY_MAILTO} className="w-full">
          문의
        </LinkButton>
      </div>
      <p className="m-0 text-center text-2xs text-text-dim">{`문의 ${INQUIRY_EMAIL}`}</p>
    </div>
  ) : step === 'later' ? (
    <div className="mt-3 flex flex-col gap-2">
      <Button variant="primary" full onClick={() => setStep('consent')}>
        이용약관 다시 보기
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" full onClick={enterDelete}>
          계정 삭제
        </Button>
        <LinkButton variant="ghost" href={INQUIRY_MAILTO} className="w-full">
          문의
        </LinkButton>
      </div>
      <p className="m-0 text-center text-2xs text-text-dim">{`문의 ${INQUIRY_EMAIL}`}</p>
    </div>
  ) : (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button full disabled={deleting} onClick={leaveDelete}>
        취소
      </Button>
      <Button variant="danger" full disabled={deleting} onClick={() => void handleDelete()}>
        계정 삭제
      </Button>
    </div>
  );

  return (
    <Modal layer="app" title={title} onClose={() => {}} closable={false} footer={footer}>
      {step === 'consent' ? (
        <div className="flex flex-col gap-3">
          <NoticeBody lead={consent ? `${consent.version}부터 이용약관이 시행돼요.` : '이용약관 정보를 불러오는 중이에요.'}>
            <p>기존 계정은 약관에 동의해야 이어서 플레이할 수 있어요.</p>
          </NoticeBody>
          {mismatch && (
            <Note tone="warn" className="my-0">
              확인하는 사이에 이용약관이 바뀌었어요.
              <br />
              새 이용약관을 확인한 뒤 다시 동의하고 시작을 눌러 주세요.
            </Note>
          )}
          {error && (
            <div className="flex flex-col gap-2">
              <Note tone="warn" className="my-0">{error}</Note>
              {!consent && onRetryLoad && (
                <Button size="sm" onClick={onRetryLoad}>
                  다시 불러오기
                </Button>
              )}
            </div>
          )}
        </div>
      ) : step === 'later' ? (
        <NoticeBody lead="이용약관에 동의하지 않아 게임을 시작하지 않았어요.">
          <p>진행과 기록은 그대로 남으며 다음 접속에서 다시 물어요.</p>
        </NoticeBody>
      ) : (
        <div className="flex flex-col gap-3">
          <NoticeBody lead="계정을 삭제하면 모든 진행과 기록이 영구 삭제되며 되돌릴 수 없어요.">
            <p>삭제하려면 아래 칸에 “삭제”를 입력해 주세요.</p>
          </NoticeBody>
          <TextInput
            value={confirmText}
            onChange={e => { setConfirmText(e.target.value); setDeleteError(null); }}
            aria-label="확인 문구"
            placeholder="삭제"
            disabled={deleting}
            autoFocus
          />
          {deleteError && <Note tone="warn" className="my-0">{deleteError}</Note>}
        </div>
      )}
    </Modal>
  );
}
