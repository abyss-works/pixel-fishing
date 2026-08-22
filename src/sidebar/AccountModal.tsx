import { useState } from 'react';
import type { GameState } from '../game/logic';
import { saveCode, requestPasswordReset, signInWithEmail, signUpWithEmail } from '../backend/auth';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Note from '../ui/Note';
import TextInput from '../ui/TextInput';

// 통합 계정 폼 (v0.4.2) — 가입/로그인 탭을 없애고 "이메일로 계속하기" 하나로.
// 신규/기존 판별은 유저가 아니라 서버가 한다: 승격(updateUser) 먼저 시도하고,
// email_exists면 "기존 계정 로그인" 확인 후 signInWithPassword로 전환.
// 알려진 트레이드오프: 기존 유저가 이메일을 오타 내면 오타 주소로 새 계정이 생긴다
// (진행 유실은 없음, 유령 계정 1개) — 친구 규모에서 수용
export default function AccountModal({ game, setToast, onAuthChanged, onClose }: {
  game: GameState; setToast: (m: string) => void;
  onAuthChanged: () => Promise<void>; onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const proceed = () => run(async () => {
    if (!email.trim() || pw.length < 6) { setToast('이메일과 6자 이상 비밀번호를 입력하세요.'); return; }

    // ① 승격 시도 — 처음 보는 이메일이면 여기서 끝 (익명 uid 유지, 진행 그대로)
    const r = await signUpWithEmail(email.trim(), pw);
    if (r.ok) {
      await onAuthChanged();
      setToast('계정이 만들어졌다! 이제 어느 기기에서든 이 진행을 이어갈 수 있다.');
      onClose();
      return;
    }

    // ② 이미 가입된 이메일 → 기존 계정 로그인으로 전환 (계정 교체 = 게스트 진행 소멸: 경고+백업)
    if (r.code === 'email_exists' || r.code === 'user_already_exists') {
      if (!window.confirm('이미 가입된 이메일이에요 — 이 계정으로 로그인할까요?\n로그인하면 지금 게스트 진행은 사라져요.\n(만약을 위해 이사 코드를 클립보드에 복사해 둘게요)')) return;
      try { await navigator.clipboard.writeText(saveCode(game)); } catch { /* 백업 실패해도 진행 */ }
      const r2 = await signInWithEmail(email.trim(), pw);
      if (!r2.ok) { setToast(`로그인 실패: ${r2.msg}`); return; }
      await onAuthChanged();
      onClose();
      return;
    }

    setToast(`실패: ${r.msg}`);
  });

  const reset = () => run(async () => {
    if (!email.trim()) { setToast('비밀번호를 재설정할 이메일을 입력하세요.'); return; }
    const r = await requestPasswordReset(email.trim());
    setToast(r.ok ? '재설정 메일을 보냈다. 받은편지함을 확인하세요.' : `실패: ${r.msg}`);
  });

  return (
    <Modal onClose={onClose}>
      <Note className="mt-0">
        이메일과 비밀번호를 입력하세요. 처음이면 계정이 만들어지고 지금 진행이 그대로 이어져요.
        이미 가입한 이메일이면 그 계정으로 로그인해요.
      </Note>

      <div className="flex flex-col gap-2 my-2">
        <TextInput type="email" placeholder="이메일" value={email} autoComplete="email"
                   onChange={e => setEmail(e.target.value)} />
        <TextInput type="password" placeholder="비밀번호 (6자 이상)" value={pw}
                   autoComplete="current-password"
                   onChange={e => setPw(e.target.value)} />
      </div>

      <Button variant="primary" onClick={proceed} disabled={busy}>이메일로 계속하기</Button>
      <div className="flex gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>비밀번호를 잊었어요</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
