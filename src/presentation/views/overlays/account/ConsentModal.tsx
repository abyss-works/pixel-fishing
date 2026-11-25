import { useState } from 'react';
import { LEGAL_PATHS } from '../../../../features/account/model/googleFlow';
import { deleteAccount } from '../../../../features/account/service/accountActions';
import type { ConsentStatus } from '../../../../features/account/service/consentGate';
import { clearPendingSailReturn } from '../../../../features/account/service/sailReturn';
import Button from '../../../ui/Button';
import Divider from '../../../ui/Divider';
import Field from '../../../ui/Field';
import { fmtKoreanDate } from '../../../ui/format';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import NoticeBody from '../../../ui/NoticeBody';
import PixelIcon from '../../../ui/PixelIcon';
import TextInput from '../../../ui/TextInput';

type ConsentStep = 'consent' | 'later' | 'delete';

const INQUIRY_EMAIL = 'contact@abyssworks.dev';
const INQUIRY_MAILTO = `mailto:${INQUIRY_EMAIL}`;
const LEGAL_DOCS = [
  { href: LEGAL_PATHS.terms, label: '이용약관' },
  { href: LEGAL_PATHS.privacy, label: '개인정보 처리방침' },
] as const;

function consentEffectiveDate(consent: ConsentStatus): string {
  const formatted = fmtKoreanDate(consent.version);
  return formatted !== consent.version ? formatted : fmtKoreanDate(consent.effectiveAt);
}

function ConsentBrandBar() {
  return (
    <div className="inline-flex items-center gap-2 pl-0.5 select-none" aria-hidden="true">
      <PixelIcon glyph="fish" size={16} className="text-gold" />
      <span className="pf-accent text-xs tracking-wider text-text-dim">PIXEL FISHING</span>
    </div>
  );
}

function LegalDocsCard() {
  return (
    <Inset divided aria-label="법무 문서 목록" className="flex flex-col">
      {LEGAL_DOCS.map(doc => (
        <a key={doc.href} href={doc.href} target="_blank" rel="noopener noreferrer" aria-label={doc.label}
           className="group flex items-center justify-between gap-2.5 min-h-[44px] px-3 py-2.5 text-text no-underline transition-colors hover:bg-(--inset-light)">
          <span className="inline-flex items-center gap-2 min-w-0">
            <PixelIcon glyph="book" size={14} className="text-accent shrink-0" />
            <span className="text-sm font-bold text-accent underline decoration-solid underline-offset-[3px] group-hover:text-text">
              {doc.label}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 shrink-0 text-xs text-text-dim group-hover:text-accent">
            <span>새 탭</span>
            <PixelIcon glyph="external" size={12} />
          </span>
        </a>
      ))}
    </Inset>
  );
}

// 이용약관 동의 차단 창 — 닫을 수 없는 앱 모달(closable=false).
// 나중에 하기 대기 상태와 계정 삭제(“삭제” 문구 입력) 확인 단계를 모달 내부 상태로 전환해 차단 레이어 위에서 가리지 않게 처리한다.
export default function ConsentModal({
  consent,
  mismatch,
  error,
  busy,
  entry = false,
  onAccept,
  onRetryLoad,
  onReload,
}: {
  consent: ConsentStatus | null;
  mismatch: boolean;
  error: string | null;
  busy: boolean;
  /** 초기 세이브 로드 전 진입 상태 여부. true면 불투명 배경과 브랜드 표식 위에 모달을 띄운다 */
  entry?: boolean;
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

  const footer = (
    <div className="mt-4 flex flex-col gap-3">
      <Divider className="my-0" />
      {step === 'consent' ? (
        <div className="grid grid-cols-2 gap-2">
          <Button full className="whitespace-nowrap px-2.5" disabled={busy} onClick={() => setStep('later')}>
            나중에 하기
          </Button>
          <Button variant="primary" full className="whitespace-nowrap px-2.5" disabled={busy || !consent} onClick={() => void onAccept()}>
            동의하고 시작
          </Button>
        </div>
      ) : step === 'later' ? (
        <div className="flex justify-start">
          <Button variant="primary" className="min-w-[212px] mobile:w-full mobile:min-w-0" onClick={() => setStep('consent')}>
            이용약관 다시 보기
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button full disabled={deleting} onClick={leaveDelete}>
            취소
          </Button>
          <Button variant="danger" full disabled={deleting} onClick={() => void handleDelete()}>
            계정 삭제
          </Button>
        </div>
      )}
      <Divider className="my-0 bg-line-dim" />
      <div className="flex items-center justify-between gap-2 flex-wrap min-h-[38px]">
        <a href={INQUIRY_MAILTO} aria-label="문의"
           className="group inline-flex items-center gap-1.5 min-h-[28px] text-xs text-text-dim no-underline">
          <PixelIcon glyph="letter" size={12} />
          <span>문의</span>
          <span className="text-accent underline decoration-solid underline-offset-[3px] group-hover:text-text">
            {INQUIRY_EMAIL}
          </span>
        </a>
        {step !== 'delete' && (
          <Button variant="ghost" size="sm" className="ml-auto hover:text-danger" disabled={busy} onClick={enterDelete}>
            계정 삭제
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal layer="app" title={title} onClose={() => {}} closable={false} opaque={entry}
           above={entry ? <ConsentBrandBar /> : undefined}
           className="min-h-[392px] mobile:min-h-[432px] p-5 pb-4 mobile:p-4 text-left" footer={footer}>
      {step === 'consent' ? (
        <div className="flex flex-col gap-3.5 text-left">
          <NoticeBody lead={consent ? `${consentEffectiveDate(consent)}부터 이용약관이 시행돼요.` : '이용약관 정보를 불러오는 중이에요.'}>
            <p>기존 계정은 약관에 동의해야 이어서 플레이할 수 있어요.</p>
          </NoticeBody>
          <LegalDocsCard />
          <p className="m-0 text-left text-xs leading-relaxed text-text-dim">
            동의하고 시작을 누르면 만 14세 이상이며 이용약관에 동의하고 개인정보 처리방침을 확인한 것으로 봐요.
          </p>
          {mismatch && (
            <Note tone="warn" className="my-0 text-left">
              확인하는 사이에 이용약관이 바뀌었어요.
              <br />
              새 이용약관을 확인한 뒤 다시 동의하고 시작을 눌러 주세요.
            </Note>
          )}
          {error && (
            <div className="flex flex-col gap-2">
              <Note tone="warn" className="my-0 text-left">{error}</Note>
              {!consent && onRetryLoad && (
                <Button size="sm" className="self-start" onClick={onRetryLoad}>
                  다시 불러오기
                </Button>
              )}
            </div>
          )}
        </div>
      ) : step === 'later' ? (
        <div className="flex flex-col gap-3.5 text-left">
          <NoticeBody lead="이용약관에 동의하지 않아 게임을 시작하지 않았어요.">
            <p>진행과 기록은 그대로 남으며 다음 접속에서 다시 물어요.</p>
          </NoticeBody>
          <LegalDocsCard />
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 text-left">
          <NoticeBody lead="계정을 삭제하면 모든 진행과 기록이 영구 삭제되며 되돌릴 수 없어요.">
            <p>삭제하려면 아래 칸에 “삭제”를 입력해 주세요.</p>
          </NoticeBody>
          <Field label="확인 문구" error={deleteError ?? undefined}>
            <TextInput
              value={confirmText}
              onChange={e => { setConfirmText(e.target.value); setDeleteError(null); }}
              placeholder="삭제"
              autoComplete="off"
              disabled={deleting}
              autoFocus
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
