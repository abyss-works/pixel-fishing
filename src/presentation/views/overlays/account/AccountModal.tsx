import { Fragment, useState } from 'react';
import {
  connectGoogle,
  deleteAccount,
  isAccountConfigured,
  signOutAccount,
} from '../../../../features/account/service/accountActions';
import {
  clearPendingSailReturn,
  setPendingSailReturn,
} from '../../../../features/account/service/sailReturn';
import { GOOGLE_BUTTON_LABEL, googleStartFailedText, LEGAL_PATHS } from '../../../../features/account/model/googleFlow';
import { ACCOUNT_CHECK_FAILED_COPY, accountLabel } from '../../../../features/account/model/accountRules';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import Button from '../../../ui/Button';
import Divider from '../../../ui/Divider';
import ExternalLink from '../../../ui/ExternalLink';
import GoogleButton from '../../../ui/GoogleButton';
import GoogleLogo from '../../../ui/GoogleLogo';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { useDialogs } from '../../../ui/useDialogs';
import type { Notify } from '../../../ui/hud/messageFeed';

// 계정 관리 창 - 구글 계정 연결과 로그인 상태, 로그아웃, 계정 삭제, 약관과 처리방침 링크.
// 로그인 수단은 구글과 익명 게스트다: 게스트는 구글 계정을 연결해 같은 진행으로 영구 계정이 된다.
// 세션 확인에 실패했으면(accountFailed) 게스트로 보지 않고, 확인 실패 안내와 다시 확인 버튼만 둔다. 계정을 바꾸는 동작(구글 연결, 로그아웃, 계정 삭제)은 확인이 끝날 때까지 열지 않는다.
// 닉네임과 ID는 내 정보 창이 맡는다.
export default function AccountModal({
  layer, setToast, onAuthChanged, onClose, account, accountFailed, syncLabel, syncState, sailReturn = false,
}: {
  layer: 'stage' | 'app';
  setToast: Notify;
  onAuthChanged: () => Promise<void>; onClose: () => void;
  account: string | null;
  /** 세션 확인에 실패했는가 — 이때 account는 null이지만 게스트가 아니다 */
  accountFailed: boolean;
  /** 저장 상태 문구(클라우드 켜짐, 미설정 등). 계정과 한 묶음이라 여기서 보여 준다 */
  syncLabel?: string | null; syncState?: string;
  /** 마을 포구 출항 차단으로 열렸는가 — 로그인 시작 시 출항 복귀 표지를 남기고, 취소해 닫으면 지운다 */
  sailReturn?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const { confirm, input, dialogs } = useDialogs();
  const guest = account === null && !accountFailed;
  // 로컬(클라우드 미설정)에서도 화면은 보여준다 - 계정 기능만 막는다.
  const offline = !isAccountConfigured();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  // 구글 인증 화면으로 이동한다. 이동하면 이 페이지는 떠나므로 성공 뒤에는 busy를 풀지 않는다.
  const connect = async () => {
    setBusy(true);
    if (sailReturn) setPendingSailReturn();
    const r = await connectGoogle().catch(() => ({ ok: false as const }));
    if (!r.ok) {
      if (sailReturn) clearPendingSailReturn();
      sendNotice(setToast, { kind: 'system.modalRejected', text: googleStartFailedText, toastText: '구글 계정 화면 열기 실패' });
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (sailReturn && !busy) clearPendingSailReturn();
    onClose();
  };

  const signOut = async () => {
    if (!(await confirm({ layer, title: '로그아웃', body: '로그아웃할까요?\n이 기기는 새 게스트로 다시 시작해요.', confirmLabel: '로그아웃' }))) return;
    await signOutAccount();
    window.location.reload(); // 재부팅 = 새 익명 세션으로 깔끔하게 시작
  };

  // 되돌릴 수 없는 동작이라 확인 문구를 직접 입력해야 지운다
  const removeAccount = () => run(async () => {
    const typed = await input({
      layer,
      title: '계정 삭제',
      body: '계정을 삭제하면 진행, 도감, 골드, 우편, 편지가 모두 지워지고 되돌릴 수 없어요.\n삭제하려면 아래 칸에 “삭제”를 입력해 주세요.',
      label: '확인 문구', placeholder: '삭제', confirmLabel: '계정 삭제',
    });
    if (typed === null) return;
    if (typed.trim() !== '삭제') {
      sendNotice(setToast, {
        kind: 'system.modalRejected',
        text: '확인 문구가 달라 삭제하지 않았어요.',
        toastText: '확인 문구가 일치하지 않아요.',
      });
      return;
    }
    const r = await deleteAccount();
    if (!r.ok) {
      sendNotice(setToast, {
        kind: 'system.modalRejected',
        text: `계정을 삭제하지 못했어요. ${r.msg}`,
        toastText: '계정 삭제에 실패했어요.',
      });
      return;
    }
    window.location.reload(); // 재부팅 = 새 익명 세션으로 처음부터 시작
  });

  const accountRow = (
    <KeyValueRow label="계정" value={accountLabel(account, accountFailed)}
                 action={!guest && !accountFailed && !offline ? <GoogleLogo size={16} /> : undefined} />
  );

  const links = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <ExternalLink href={LEGAL_PATHS.terms}>이용약관</ExternalLink>
      <ExternalLink href={LEGAL_PATHS.privacy}>개인정보 처리방침</ExternalLink>
      <ExternalLink href={LEGAL_PATHS.policy}>운영정책</ExternalLink>
    </div>
  );

  const content = (
    <>
      <Inset divided className="mb-2">
        {accountRow}
        {syncLabel && (
          <div className={cx('px-2 py-1.5 text-xs', syncState === 'error' ? 'text-danger' : 'text-text-dim')}>
            {syncLabel}
          </div>
        )}
      </Inset>
      {offline && <Note className="mt-0">오프라인 상태에서는 계정 기능이 동작하지 않아요.<br />화면 확인용이에요.</Note>}

      {accountFailed ? (
        <>
          <Note tone="warn" className="mt-0">
            {ACCOUNT_CHECK_FAILED_COPY.lines.map((line, i) => <Fragment key={line}>{i > 0 && <br />}{line}</Fragment>)}
          </Note>
          <Button full disabled={busy || offline} onClick={() => void run(onAuthChanged)}>{ACCOUNT_CHECK_FAILED_COPY.retry}</Button>
        </>
      ) : guest ? (
        <>
          <GoogleButton disabled={busy || offline} onClick={() => void connect()}>{GOOGLE_BUTTON_LABEL}</GoogleButton>
          <Note size="xs" className="text-center mt-2 mb-0">
            계속하면 만 14세 이상이며 <ExternalLink href={LEGAL_PATHS.terms}>이용약관</ExternalLink>에 동의하고{' '}
            <ExternalLink href={LEGAL_PATHS.privacy}>개인정보 처리방침</ExternalLink>을 확인한 것으로 봐요.
          </Note>
          <Note className="text-center">구글 계정을 연결하면 지금까지의 진행이 그 계정에 이어져요.</Note>
        </>
      ) : (
        <>
          <Note className="mt-0">진행은 이 계정에 저장돼요.</Note>
          <Button full className="mt-3" disabled={offline} onClick={signOut}>로그아웃</Button>
        </>
      )}

      {!accountFailed && (
        <>
          <Divider className="mt-3 mb-2" />
          <div className="flex items-center gap-2 flex-wrap">
            {!guest && links}
            <Button variant="ghost" size="sm" className="ml-auto" disabled={busy || offline} onClick={removeAccount}>계정 삭제</Button>
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      {layer === 'stage' ? (
        <Modal layer="stage" onClose={handleClose}>
          <ModalCard title="계정 관리" onClose={handleClose}>{content}</ModalCard>
        </Modal>
      ) : (
        <Modal layer="app" title="계정 관리" narrow onClose={handleClose}>{content}</Modal>
      )}
      {dialogs}
    </>
  );
}
