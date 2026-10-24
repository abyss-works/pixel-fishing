import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import {
  deleteAccount,
  isAccountConfigured,
  requestAccountPasswordReset,
  saveGameCode,
  signInAccount,
  signOutAccount,
  signUpAccount,
} from '../../../../features/account/service/accountActions';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import { checkNickname } from '../../../../game/rules/nickname';
import type { RejectReason } from '../../../../game/rules/rules';
import Button from '../../../ui/Button';
import Field from '../../../ui/Field';
import Modal from '../../../ui/Modal';
import { useDialogs } from '../../../ui/useDialogs';
import Note from '../../../ui/Note';
import SectionTitle from '../../../ui/SectionTitle';
import TextInput from '../../../ui/TextInput';
import { maskUid } from './maskUid';
import { MIN_PASSWORD_LENGTH, passwordLongEnough } from '../../../../features/account/model/accountRules';
import { cx } from '../../../ui/cx';
import Frame from '../../../ui/Frame';
import type { Notify } from '../../../ui/hud/messageFeed';

// 계정 관리 모달 — 연동 폼·닉네임·내 정보(ID)·로그아웃을 한 곳에 모은다.
// 가입 = 익명 계정 승격(진행 유지) / 로그인 = 다른 계정으로 교체(게스트 진행 소멸 — 경고+백업).
// 신규/기존 판별은 유저가 아니라 서버가 한다: 승격(updateUser) 먼저 시도하고,
// email_exists면 "기존 계정 로그인" 확인 후 signInWithPassword로 전환.
// 알려진 트레이드오프: 기존 유저가 이메일을 오타 내면 오타 주소로 새 계정이 생긴다
// (진행 유실은 없음, 유령 계정 1개) — 친구 규모에서 수용
export default function AccountModal({
  game, setToast, onAuthChanged, onClose, account, uid, nickname, onRename, syncLabel, syncState,
}: {
  game: GameState; setToast: Notify;
  onAuthChanged: () => Promise<void>; onClose: () => void;
  account: string | null; uid: string | null;
  nickname: string | null; onRename: (name: string) => Promise<null | RejectReason>;
  /** 저장 상태 문구(클라우드 켜짐·미설정 등) — 계정과 한 묶음이라 여기서 보여 준다 */
  syncLabel?: string | null; syncState?: string;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [nickBusy, setNickBusy] = useState(false);
  const { confirm, input, notice, dialogs } = useDialogs();
  // 로컬(supabase 없음)에서도 화면은 보여준다 — 계정 폼만 막고 닉네임·ID는 그대로 동작한다.
  const offline = !isAccountConfigured();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const proceed = () => run(async () => {
    if (!email.trim() || !passwordLongEnough(pw)) { setToast(`이메일과 ${MIN_PASSWORD_LENGTH}자 이상의 비밀번호를 입력해 주세요.`, 'warn'); return; }

    // ① 승격 시도 — 처음 보는 이메일이면 여기서 끝 (익명 uid 유지, 진행 그대로)
    const r = await signUpAccount(email.trim(), pw);
    if (r.ok) {
      await onAuthChanged();
      setToast('계정을 만들었어요. 이제 어느 기기에서든 이 진행을 이어갈 수 있어요.');
      onClose();
      return;
    }

    // ② 이미 가입된 이메일 → 기존 계정 로그인으로 전환 (계정 교체 = 게스트 진행 소멸: 경고+백업)
    if (r.code === 'email_exists' || r.code === 'user_already_exists') {
      if (!(await confirm({
        title: '기존 계정으로 로그인',
        body: '이미 가입된 이메일이에요. 이 계정으로 로그인할까요?\n로그인하면 지금 게스트 진행은 사라져요.\n(만약을 위해 이사 코드를 클립보드에 복사해 둘게요)',
        confirmLabel: '로그인',
      }))) return;
      try { await navigator.clipboard.writeText(saveGameCode(game)); } catch { /* 백업 실패해도 진행 */ }
      const r2 = await signInAccount(email.trim(), pw);
      if (!r2.ok) { setToast(`로그인하지 못했어요. ${r2.msg}`, 'warn'); return; }
      await onAuthChanged();
      onClose();
      return;
    }

    setToast(`처리하지 못했어요. ${r.msg}`, 'warn');
  });

  const reset = () => run(async () => {
    if (!email.trim()) { setToast('비밀번호를 재설정할 이메일을 입력해 주세요.', 'warn'); return; }
    const r = await requestAccountPasswordReset(email.trim());
    if (r.ok) setToast('재설정 메일을 보냈어요. 받은편지함을 확인해 주세요.');
    else setToast(`메일을 보내지 못했어요. ${r.msg}`, 'warn');
  });

  const signOut = async () => {
    if (!(await confirm({ title: '로그아웃', body: '로그아웃할까요? 이 기기는 새 게스트로 다시 시작해요.', confirmLabel: '로그아웃' }))) return;
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

  const submitNick = async () => {
    if (!checkNickname(draft).ok) {
      setToast('닉네임은 한글 1~8자·영문 2~16자(가중치)까지 쓸 수 있어요. 한글·영문·숫자와 -_만 쓸 수 있어요.', 'warn');
      return;
    }
    setNickBusy(true);
    try {
      const err = await onRename(draft);
      if (err) setToast(REJECT_TEXT[err], 'warn');
      else { setToast(`닉네임을 ${draft}(으)로 바꿨어요.`); setDraft(''); }
    } finally {
      setNickBusy(false);
    }
  };

  // body에 user-select:none이 걸려 있어 드래그 복사가 안 된다 — 버튼이 유일한 경로다.
  const copyId = async (value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setToast('내 ID를 복사했어요. 문의하실 때 함께 보내 주세요.');
    } catch {
      void notice({ title: '직접 복사', body: '복사가 막혀 있어요. 아래 값을 직접 복사해 주세요.', value });
    }
  };

  return (
    <Modal title="계정 관리" onClose={onClose}>
      {syncLabel && (
        <div className={cx('text-xs mb-2', syncState === 'error' ? 'text-danger' : 'text-text-dim')}>
          {syncLabel}
        </div>
      )}
      {offline && <Note className="mt-0">로컬 개발 모드에서는 계정 기능이 동작하지 않아요. 화면 확인용이에요.</Note>}

      {account ? (
        <>
          <Note className={offline ? 'mt-2' : 'mt-0'}>
            <b className="text-gold">{account}</b>(으)로 로그인했어요. 진행은 이 계정에 저장돼요.
          </Note>
          <div className="flex flex-col gap-2 mt-2">
            <Button disabled={offline} onClick={signOut}>로그아웃</Button>
          </div>
        </>
      ) : (
        <>
          <Note className="mt-0">
            이메일과 비밀번호를 입력해 주세요. 처음이면 계정이 만들어지고 지금 진행이 그대로 이어져요.
            이미 가입한 이메일이면 그 계정으로 로그인해요.
          </Note>

          <div className="flex flex-col gap-2 my-2">
            <Field label="이메일">
              <TextInput type="email" placeholder="이메일" value={email} autoComplete="email"
                         disabled={offline} onChange={e => setEmail(e.target.value)} />
            </Field>
            <Field label="비밀번호" hint={`${MIN_PASSWORD_LENGTH}자 이상`}>
              <TextInput type="password" placeholder={`비밀번호 (${MIN_PASSWORD_LENGTH}자 이상)`} value={pw}
                         autoComplete="current-password" disabled={offline}
                         onChange={e => setPw(e.target.value)} />
            </Field>
          </div>

            <Button variant="primary" full className="mt-3" onClick={proceed} disabled={busy || offline}>이메일로 계속</Button>
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy || offline}>비밀번호 재설정</Button>
          </div>
        </>
      )}

      <SectionTitle>닉네임</SectionTitle>
      <Frame divided className="mb-2 text-xs">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="text-text-dim shrink-0">현재</span>
          <span className="truncate" aria-label="현재 닉네임">{nickname ?? '불러오는 중…'}</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1">
          <TextInput aria-label="새 닉네임" className="flex-1 min-w-0"
                     value={draft} maxLength={16} disabled={nickBusy}
                     onChange={e => setDraft(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter') void submitNick(); }}
                     placeholder="새 닉네임" />
          <Button size="sm" className="shrink-0" disabled={nickBusy || draft.length === 0}
                  onClick={() => void submitNick()}>변경</Button>
        </div>
      </Frame>
      <Note>닉네임은 한글 1~8자·영문 2~16자(가중치)까지 쓸 수 있어요. 나중에 랭킹에 표시될 이름이에요.</Note>

      {/* 내 정보 — **문의 대응용이다.** 게스트는 이메일조차 없어 uid 말고는 식별할 방법이 없다.
          화면은 가운데를 가리지만 복사는 전체 값이라, 버튼이 없으면 문의 대응이 불가능해진다. */}
      <SectionTitle>내 정보</SectionTitle>
      <Frame divided className="mb-2 text-xs">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="text-text-dim shrink-0">ID</span>
          <span className="pf-accent text-2xs truncate select-text">{uid ? maskUid(uid) : '연결 중…'}</span>
          <Button size="sm" className="ml-auto shrink-0" disabled={!uid}
                  onClick={() => copyId(uid)}>복사</Button>
        </div>
      </Frame>
      <Note>문의하실 때 이 <b>ID</b>를 함께 알려 주시면 빠르게 해결할 수 있어요.<br/>
        가운데는 가려 두었지만 <b>복사</b>를 누르면 전체가 복사돼요.</Note>

      <SectionTitle>계정 삭제</SectionTitle>
      <Note>계정과 모든 진행을 지워요. 삭제한 뒤에는 되돌릴 수 없어요.</Note>
      <div className="flex gap-2 mt-2">
        <Button variant="ghost" size="sm" disabled={busy || offline} onClick={removeAccount}>계정 삭제</Button>
      </div>
      {dialogs}
    </Modal>
  );
}
