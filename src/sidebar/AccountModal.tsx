import { useState } from 'react';
import type { GameState } from '../game/logic';
import { api } from '../api';
import { REJECT_TEXT } from '../game/logic';
import { checkNickname } from '../game/nickname';
import type { RejectReason } from '../game/rules';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';
import TextInput from '../ui/TextInput';
import { maskUid } from './shared';

// 계정 관리 모달 — 연동 폼·닉네임·내 정보(ID)·로그아웃을 한 곳에 모은다.
// 가입 = 익명 계정 승격(진행 유지) / 로그인 = 다른 계정으로 교체(게스트 진행 소멸 — 경고+백업).
// 신규/기존 판별은 유저가 아니라 서버가 한다: 승격(updateUser) 먼저 시도하고,
// email_exists면 "기존 계정 로그인" 확인 후 signInWithPassword로 전환.
// 알려진 트레이드오프: 기존 유저가 이메일을 오타 내면 오타 주소로 새 계정이 생긴다
// (진행 유실은 없음, 유령 계정 1개) — 친구 규모에서 수용
export default function AccountModal({ game, setToast, onAuthChanged, onClose, account, uid, nickname, onRename }: {
  game: GameState; setToast: (m: string) => void;
  onAuthChanged: () => Promise<void>; onClose: () => void;
  account: string | null; uid: string | null;
  nickname: string | null; onRename: (name: string) => Promise<null | RejectReason>;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [nickBusy, setNickBusy] = useState(false);
  // 로컬(supabase 없음)에서도 화면은 보여준다 — 계정 폼만 막고 닉네임·ID는 그대로 동작한다.
  const offline = !api.auth.isConfigured;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const proceed = () => run(async () => {
    if (!email.trim() || pw.length < 6) { setToast('이메일과 6자 이상 비밀번호를 입력하세요.'); return; }

    // ① 승격 시도 — 처음 보는 이메일이면 여기서 끝 (익명 uid 유지, 진행 그대로)
    const r = await api.auth.signUp(email.trim(), pw);
    if (r.ok) {
      await onAuthChanged();
      setToast('계정이 만들어졌다! 이제 어느 기기에서든 이 진행을 이어갈 수 있다.');
      onClose();
      return;
    }

    // ② 이미 가입된 이메일 → 기존 계정 로그인으로 전환 (계정 교체 = 게스트 진행 소멸: 경고+백업)
    if (r.code === 'email_exists' || r.code === 'user_already_exists') {
      if (!window.confirm('이미 가입된 이메일이에요 — 이 계정으로 로그인할까요?\n로그인하면 지금 게스트 진행은 사라져요.\n(만약을 위해 이사 코드를 클립보드에 복사해 둘게요)')) return;
      try { await navigator.clipboard.writeText(api.storage.saveCode(game)); } catch { /* 백업 실패해도 진행 */ }
      const r2 = await api.auth.signIn(email.trim(), pw);
      if (!r2.ok) { setToast(`로그인 실패: ${r2.msg}`); return; }
      await onAuthChanged();
      onClose();
      return;
    }

    setToast(`실패: ${r.msg}`);
  });

  const reset = () => run(async () => {
    if (!email.trim()) { setToast('비밀번호를 재설정할 이메일을 입력하세요.'); return; }
    const r = await api.auth.requestPasswordReset(email.trim());
    setToast(r.ok ? '재설정 메일을 보냈다. 받은편지함을 확인하세요.' : `실패: ${r.msg}`);
  });

  const signOut = async () => {
    if (!window.confirm('로그아웃할까요? 이 기기는 새 게스트로 다시 시작해요.')) return;
    await api.auth.signOut();
    window.location.reload(); // 재부팅 = 새 익명 세션으로 깔끔하게 시작
  };

  const submitNick = async () => {
    if (!checkNickname(draft).ok) {
      setToast('한글 1~8자·영문 2~16자(가중치) — 한글·영문·숫자·-_만 쓸 수 있어요.');
      return;
    }
    setNickBusy(true);
    try {
      const err = await onRename(draft);
      if (err) setToast(REJECT_TEXT[err]);
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
      setToast('내 ID를 복사했어요. 문의하실 때 함께 보내주세요.');
    } catch {
      window.prompt('복사가 막혀 있어요. 아래 값을 직접 복사하세요.', value);
    }
  };

  return (
    <Modal title="계정 관리" onClose={onClose}>
      {offline && <Note className="mt-0">로컬 개발 모드 — 계정 기능은 동작하지 않아요(화면 확인용).</Note>}

      {account ? (
        <>
          <Note className={offline ? 'mt-2' : 'mt-0'}>
            <b className="text-gold">{account}</b>로 로그인됨 — 진행이 이 계정에 저장돼요.
          </Note>
          <div className="flex flex-col gap-2 mt-2">
            <Button disabled={offline} onClick={signOut}>로그아웃</Button>
          </div>
        </>
      ) : (
        <>
          <Note className="mt-0">
            이메일과 비밀번호를 입력하세요. 처음이면 계정이 만들어지고 지금 진행이 그대로 이어져요.
            이미 가입한 이메일이면 그 계정으로 로그인해요.
          </Note>

          <div className="flex flex-col gap-2 my-2">
            <TextInput type="email" placeholder="이메일" value={email} autoComplete="email"
                       disabled={offline} onChange={e => setEmail(e.target.value)} />
            <TextInput type="password" placeholder="비밀번호 (6자 이상)" value={pw}
                       autoComplete="current-password" disabled={offline}
                       onChange={e => setPw(e.target.value)} />
          </div>

          <Button variant="primary" onClick={proceed} disabled={busy || offline}>이메일로 계속하기</Button>
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy || offline}>비밀번호를 잊었어요</Button>
          </div>
        </>
      )}

      <SectionTitle>닉네임</SectionTitle>
      <div className="pf-frame divide-y divide-line mb-2 text-xs">
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
      </div>
      <Note>한글 1~8자·영문 2~16자(가중치) — 나중에 랭킹에 표시될 이름이에요.</Note>

      {/* 내 정보 — **문의 대응용이다.** 게스트는 이메일조차 없어 uid 말고는 식별할 방법이 없다.
          화면은 가운데를 가리지만 복사는 전체 값이라, 버튼이 없으면 문의 대응이 불가능해진다. */}
      <SectionTitle>내 정보</SectionTitle>
      <div className="pf-frame divide-y divide-line mb-2 text-xs">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="text-text-dim shrink-0">ID</span>
          <span className="pf-accent text-2xs truncate select-text">{uid ? maskUid(uid) : '연결 중…'}</span>
          <Button size="sm" className="ml-auto shrink-0" disabled={!uid}
                  onClick={() => copyId(uid)}>복사</Button>
        </div>
      </div>
      <Note>문의하실 때 이 <b>ID</b>를 함께 알려주시면 빠르게 해결할 수 있어요.<br/>
        가운데는 가려 두었지만 <b>복사</b>를 누르면 전체가 복사돼요.</Note>

      <div className="flex gap-2 mt-3">
        <Button variant="ghost" className="w-full" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
