import { useEffect, useRef, useState } from 'react';
import { LEGAL_PATHS } from '../../../../features/account/model/googleFlow';
import { signOutAccount } from '../../../../features/account/service/accountActions';
import { clearPendingSailReturn } from '../../../../features/account/service/sailReturn';
import AppBrandBar from '../../../ui/AppBrandBar';
import Button from '../../../ui/Button';
import Divider from '../../../ui/Divider';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import NoticeBody from '../../../ui/NoticeBody';
import PixelIcon from '../../../ui/PixelIcon';
import { maskUid } from './maskUid';

type RestrictedStep = 'info' | 'confirm';

const INQUIRY_EMAIL = 'contact@abyssworks.dev';
const INQUIRY_MAILTO = `mailto:${INQUIRY_EMAIL}`;

// 이용 제한 계정 차단 창 — 닫을 수 없는 앱 모달(closable=false, 불투명 배경).
// 제재 계정이 접속했을 때 사유, 계정 식별 정보 복사, 운영정책, 이의 문의 경로와 세션 전환을 안내한다.
export default function RestrictedModal({
  account,
  uid,
  onReload,
}: {
  account: string | null;
  uid: string | null;
  onReload?: () => void;
}) {
  const [step, setStep] = useState<RestrictedStep>('info');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const copyUid = async () => {
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      // 클립보드 접근이 막힌 환경에서는 조용히 무시한다.
    }
  };

  const handleResetSession = async () => {
    setBusy(true);
    try {
      await signOutAccount();
      clearPendingSailReturn();
      (onReload ?? (() => window.location.reload()))();
    } catch {
      setBusy(false);
    }
  };

  const actionLabel = account ? '로그아웃' : '새 게스트로 시작';
  const confirmTitle = account ? '로그아웃할까요?' : '새 게스트로 시작할까요?';
  const confirmBody = account
    ? '이 기기는 새 게스트로 다시 시작해요.'
    : '지금 계정으로 돌아올 수 없으니 필요하면 계정 ID를 먼저 복사해 주세요.';

  const footer = (
    <div className="mt-4 flex flex-col gap-3">
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
        {step !== 'confirm' && (
          <Button size="sm" className="ml-auto" onClick={() => setStep('confirm')}>
            {actionLabel}
          </Button>
        )}
      </div>
      {step === 'confirm' && (
        <>
          <Divider className="my-0" />
          <Inset className="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-1">
              <p className="m-0 text-sm font-bold text-text">{confirmTitle}</p>
              <p className="m-0 text-xs leading-relaxed text-text-dim">{confirmBody}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button full disabled={busy} onClick={() => setStep('info')}>
                취소
              </Button>
              <Button variant="primary" full disabled={busy} onClick={() => void handleResetSession()}>
                {actionLabel}
              </Button>
            </div>
          </Inset>
        </>
      )}
    </div>
  );

  return (
    <Modal layer="app" title="이용이 제한된 계정이에요" onClose={() => {}} closable={false} opaque
           above={<AppBrandBar />}
           className="min-h-[392px] mobile:min-h-[432px] p-5 pb-4 mobile:p-4 text-left" footer={footer}>
      <div className="flex flex-col gap-3.5 text-left">
        <NoticeBody lead="운영정책에 따라 지금은 이 계정으로 게임을 플레이할 수 없어요.">
          <p>지금까지의 진행과 보유 자산은 그대로 남아 있어요.</p>
          <p>이의가 있다면 계정 ID 또는 이메일과 함께 {INQUIRY_EMAIL}로 문의해 주세요.</p>
        </NoticeBody>
        <Inset divided aria-label="계정 정보" className="flex flex-col">
          <KeyValueRow
            className="min-h-[40px] px-3 py-2 text-xs"
            label="계정"
            value={account ?? '게스트 계정'}
            valueEnd
          />
          {uid && (
            <KeyValueRow
              className="min-h-[40px] px-3 py-2 text-xs"
              label="계정 ID"
              value={<span className="pf-accent text-2xs select-text">{maskUid(uid)}</span>}
              valueEnd
              action={
                <Button size="sm" className="shrink-0" onClick={() => void copyUid()}>
                  {copied ? '복사됨' : '복사'}
                </Button>
              }
            />
          )}
        </Inset>
        <Inset className="flex flex-col">
          <a href={LEGAL_PATHS.policy} target="_blank" rel="noopener noreferrer" aria-label="운영정책"
             className="group flex items-center justify-between gap-2.5 min-h-[44px] px-3 py-2.5 text-text no-underline transition-colors hover:bg-(--inset-light)">
            <span className="inline-flex items-center gap-2 min-w-0">
              <PixelIcon glyph="book" size={14} className="text-accent shrink-0" />
              <span className="text-sm font-bold text-accent underline decoration-solid underline-offset-[3px] group-hover:text-text">
                운영정책
              </span>
            </span>
            <span className="inline-flex items-center gap-1 shrink-0 text-xs text-text-dim group-hover:text-accent">
              <span>새 탭</span>
              <PixelIcon glyph="external" size={12} />
            </span>
          </a>
        </Inset>
      </div>
    </Modal>
  );
}
