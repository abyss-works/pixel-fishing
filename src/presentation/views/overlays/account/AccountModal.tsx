import { useState } from 'react';
import {
  connectGoogle,
  deleteAccount,
  isAccountConfigured,
  requestAccountPasswordReset,
  signInAccount,
  signOutAccount,
} from '../../../../features/account/service/accountActions';
import { useLoginMethod } from '../../../../features/account/service/useLoginMethod';
import { emailSignInFailure, GOOGLE_BUTTON_LABEL, googleStartFailedText, LEGAL_PATHS } from '../../../../features/account/model/googleFlow';
import { MIN_PASSWORD_LENGTH, passwordLongEnough, type GuestProgress } from '../../../../features/account/model/accountRules';
import Button from '../../../ui/Button';
import Divider from '../../../ui/Divider';
import ExternalLink from '../../../ui/ExternalLink';
import Field from '../../../ui/Field';
import GoogleButton from '../../../ui/GoogleButton';
import GoogleLogo from '../../../ui/GoogleLogo';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import SectionTitle from '../../../ui/SectionTitle';
import Skeleton from '../../../ui/Skeleton';
import TextInput from '../../../ui/TextInput';
import TextLinkButton from '../../../ui/TextLinkButton';
import { cx } from '../../../ui/cx';
import { useDialogs } from '../../../ui/useDialogs';
import type { Notify } from '../../../ui/hud/messageFeed';

// 계정 관리 창 - 계정 연결과 로그인 상태, 로그아웃, 계정 삭제, 약관과 처리방침 링크.
// 새 계정의 로그인 수단은 구글 하나다: 게스트는 구글 계정을 연결해 같은 진행으로 영구 계정이 된다.
// 이미 있는 이메일 계정의 로그인은 텍스트 링크가 같은 창 안에서 펼치는 폼으로 남기고, 이메일 계정은 구글 연결로 옮겨 간다.
// 닉네임과 ID는 내 정보 창이 맡는다.
export default function AccountModal({
  setToast, onAuthChanged, onClose, account, guestProgress, syncLabel, syncState,
}: {
  setToast: Notify;
  onAuthChanged: () => Promise<void>; onClose: () => void;
  account: string | null;
  /** 이 기기의 게스트 진행. 버릴 진행이 없으면 이메일 계정 로그인 확인을 건너뛴다 */
  guestProgress: GuestProgress;
  /** 저장 상태 문구(클라우드 켜짐, 미설정 등). 계정과 한 묶음이라 여기서 보여 준다 */
  syncLabel?: string | null; syncState?: string;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 이메일 로그인 실패 안내. 문장마다 한 줄이며, 다시 시도하거나 폼을 접으면 지운다 */
  const [signInError, setSignInError] = useState<readonly string[]>([]);
  const { confirm, input, dialogs } = useDialogs();
  const { method, failed, retry } = useLoginMethod(account);
  const guest = method === 'guest';
  // 로컬(클라우드 미설정)에서도 화면은 보여준다 - 계정 폼만 막는다.
  const offline = !isAccountConfigured();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  // 구글 인증 화면으로 이동한다. 이동하면 이 페이지는 떠나므로 성공 뒤에는 busy를 풀지 않는다.
  const connect = async () => {
    setBusy(true);
    const r = await connectGoogle(guest ? 'guest' : 'email');
    if (!r.ok) { setToast(googleStartFailedText, 'warn'); setBusy(false); }
  };

  // 이미 있는 이메일 계정으로 로그인 - 계정 교체라 이 기기의 게스트 진행은 사라진다. 버릴 진행이 있으면 확인을 받은 뒤에만 로그인한다.
  const emailSignIn = () => run(async () => {
    setSignInError([]);
    if (!email.trim() || !passwordLongEnough(pw)) { setToast(`이메일과 ${MIN_PASSWORD_LENGTH}자 이상의 비밀번호를 입력해 주세요.`, 'warn'); return; }
    if (guestProgress !== 'nothing' && !(await confirm({
      title: '이메일 계정으로 로그인',
      body: '이 이메일 계정의 진행으로 바뀌어요.\n지금 게스트 진행은 사라져요.',
      confirmLabel: '로그인',
    }))) return;
    const r = await signInAccount(email.trim(), pw);
    if (!r.ok) { setSignInError(emailSignInFailure(r.code)); return; }
    await onAuthChanged();
    onClose();
  });

  const reset = () => run(async () => {
    if (!email.trim()) { setToast('비밀번호를 재설정할 이메일을 입력해 주세요.', 'warn'); return; }
    const r = await requestAccountPasswordReset(email.trim());
    if (r.ok) setToast('재설정 메일을 보냈어요. 받은편지함을 확인해 주세요.');
    else setToast(`메일을 보내지 못했어요. ${r.msg}`, 'warn');
  });

  const signOut = async () => {
    if (!(await confirm({ title: '로그아웃', body: '로그아웃할까요?\n이 기기는 새 게스트로 다시 시작해요.', confirmLabel: '로그아웃' }))) return;
    await signOutAccount();
    window.location.reload(); // 재부팅 = 새 익명 세션으로 깔끔하게 시작
  };

  // 되돌릴 수 없는 동작이라 확인 문구를 직접 입력해야 지운다
  const removeAccount = () => run(async () => {
    const typed = await input({
      title: '계정 삭제',
      body: '계정을 삭제하면 진행, 도감, 골드, 우편, 편지가 모두 지워지고 되돌릴 수 없어요.\n삭제하려면 아래 칸에 “삭제”를 입력해 주세요.',
      label: '확인 문구', placeholder: '삭제', confirmLabel: '계정 삭제',
    });
    if (typed === null) return;
    if (typed.trim() !== '삭제') { setToast('확인 문구가 달라 삭제하지 않았어요.', 'warn'); return; }
    const r = await deleteAccount();
    if (!r.ok) { setToast(`계정을 삭제하지 못했어요. ${r.msg}`, 'warn'); return; }
    window.location.reload(); // 재부팅 = 새 익명 세션으로 처음부터 시작
  });

  const accountRow = (
    <KeyValueRow label="계정" value={account ?? '게스트(이메일 없음)'}
                 action={method === 'email' ? <span className="text-xs text-text-dim shrink-0">이메일 로그인</span>
                   : method === 'google' ? <GoogleLogo size={16} /> : undefined} />
  );

  const links = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <ExternalLink href={LEGAL_PATHS.terms}>이용약관</ExternalLink>
      <ExternalLink href={LEGAL_PATHS.privacy}>개인정보 처리방침</ExternalLink>
    </div>
  );

  // placeholder면 자리만 차지하는 사본이다: 버튼을 쓸 수 없게 하고 포커스를 받지 못하게 한다
  const connectSection = (placeholder = false) => (
    <div>
      <SectionTitle>구글 계정 연결</SectionTitle>
      <Note>구글 계정을 연결하면 다음부터는 구글 계정으로 로그인해요.</Note>
      <Note tone="warn">연결하면 이메일과 비밀번호로는 더 이상 로그인할 수 없어요.</Note>
      <GoogleButton disabled={placeholder || busy || offline} tabIndex={placeholder ? -1 : undefined} onClick={() => void connect()}>{GOOGLE_BUTTON_LABEL}</GoogleButton>
    </div>
  );

  const emailForm = (
    <div className="flex flex-col gap-2 mt-2">
      <Field label="이메일">
        <TextInput type="email" placeholder="이메일" value={email} autoComplete="email"
                   disabled={offline} onChange={e => setEmail(e.target.value)} />
      </Field>
      <Field label="비밀번호" hint={`${MIN_PASSWORD_LENGTH}자 이상`}>
        <TextInput type="password" placeholder={`비밀번호 (${MIN_PASSWORD_LENGTH}자 이상)`} value={pw}
                   autoComplete="current-password" disabled={offline}
                   onChange={e => setPw(e.target.value)} />
      </Field>
      <Button full className="mt-1" onClick={emailSignIn} disabled={busy || offline}>로그인</Button>
      <div>
        <Button variant="ghost" size="sm" onClick={reset} disabled={busy || offline}>비밀번호 재설정</Button>
      </div>
      <div role="status" className={cx('flex flex-col', signInError.length > 0 && 'mt-1')}>
        {signInError.map(line => <Note key={line} tone="warn" className="my-0">{line}</Note>)}
      </div>
    </div>
  );

  return (
    <Modal title="계정 관리" narrow onClose={onClose}>
      <Inset divided className="mb-2">
        {accountRow}
        {syncLabel && (
          <div className={cx('px-2 py-1.5 text-xs', syncState === 'error' ? 'text-danger' : 'text-text-dim')}>
            {syncLabel}
          </div>
        )}
      </Inset>
      {offline && <Note className="mt-0">로컬 개발 모드에서는 계정 기능이 동작하지 않아요.<br />화면 확인용이에요.</Note>}

      {guest ? (
        <>
          <GoogleButton disabled={busy || offline} onClick={() => void connect()}>{GOOGLE_BUTTON_LABEL}</GoogleButton>
          <Note size="xs" className="text-center mt-2 mb-0">
            계속하면 만 14세 이상이며 <ExternalLink href={LEGAL_PATHS.terms}>이용약관</ExternalLink>에 동의하고{' '}
            <ExternalLink href={LEGAL_PATHS.privacy}>개인정보 처리방침</ExternalLink>을 확인한 것으로 봐요.
          </Note>
          <Note className="text-center">구글 계정을 연결하면 지금까지의 진행이 그 계정에 이어져요.</Note>
          <div className="text-center">
            <TextLinkButton open={formOpen} onClick={() => { setFormOpen(o => !o); setSignInError([]); }}>기존 이메일 계정으로 로그인</TextLinkButton>
          </div>
          {formOpen && emailForm}
        </>
      ) : (
        <>
          <Note className="mt-0">진행은 이 계정에 저장돼요.</Note>
          {/* 연결 구역은 로그인 수단을 읽는 동안 같은 구조의 스켈레톤이 자리를 잡아 레이아웃이 흔들리지 않게 한다.
              게임 서버가 없는 로컬 모드는 읽을 곳이 없어 연결 구역도 실패 안내도 두지 않는다 */}
          {method === 'email' && connectSection()}
          {method === null && !offline && (failed ? (
            <div>
              <Note>로그인 방식을 불러오지 못했어요.<br />잠시 뒤 다시 시도해 주세요.</Note>
              <Button full onClick={retry}>다시 시도</Button>
            </div>
          ) : (
            <div role="status" className="relative">
              <span className="sr-only">로그인 방식을 불러오고 있어요</span>
              {/* 실제 연결 구역을 보이지 않게 그대로 두어 폭과 관계없이 같은 높이를 차지한다. 그 위에 자리표시를 겹쳐 그린다 */}
              <div className="invisible" aria-hidden="true" inert>{connectSection(true)}</div>
              <Skeleton className="absolute inset-0" />
            </div>
          ))}
          <Button full className="mt-3" disabled={offline} onClick={signOut}>로그아웃</Button>
        </>
      )}

      <Divider className="mt-3 mb-2" />
      <div className="flex items-center gap-2 flex-wrap">
        {!guest && links}
        <Button variant="ghost" size="sm" className="ml-auto" disabled={busy || offline} onClick={removeAccount}>계정 삭제</Button>
      </div>
      {dialogs}
    </Modal>
  );
}
