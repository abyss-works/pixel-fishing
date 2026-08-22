import { useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import { when } from '../backend/types';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { saveCode, supabase, signOutAccount } from '../backend/auth';
import { APP_VERSION } from '../version';
import { cx } from '../ui/cx';
import Button from '../ui/Button';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';
import AdminPanel from './AdminPanel';
import PatchNotesPanel from './PatchNotesPanel';
import AccountModal from './AccountModal';

// ---------- 계정 (v0.4.0) — 설정 탭엔 상태+버튼만, 폼은 오버레이 모달 ----------
// 가입 = 익명 계정 승격(진행 유지) / 로그인 = 다른 계정으로 교체(현재 게스트 진행 소멸 — 경고+백업)

function AccountSection({ game, setToast, account, onAuthChanged }: {
  game: GameState; setToast: (m: string) => void;
  account: string | null; onAuthChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  if (!supabase) return null; // 오프라인(dev) 모드 — 계정 기능 없음

  const signOut = async () => {
    if (!window.confirm('로그아웃할까요? 이 기기는 새 게스트로 다시 시작해요.')) return;
    await signOutAccount();
    window.location.reload(); // 재부팅 = 새 익명 세션으로 깔끔하게 시작
  };

  return (
    <>
      <SectionTitle>계정</SectionTitle>
      {account ? (
        <>
          <Note><b className="text-gold">{account}</b>로 로그인됨 — 진행이 이 계정에 저장돼요.</Note>
          <div className="flex flex-col gap-2 mb-2">
            <Button className="text-left text-xs" onClick={signOut}>로그아웃</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 mb-2">
          <Button variant="primary" className="text-left text-xs" onClick={() => setOpen(true)}>계정 연동</Button>
        </div>
      )}
      {open && (
        <AccountModal game={game} setToast={setToast}
                      onAuthChanged={onAuthChanged} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export default function SettingsTab({ game, dispatch, setToast, syncLabel, syncState, account, onAuthChanged }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
  syncLabel: string | null; syncState: string;
  account: string | null; onAuthChanged: () => Promise<void>;
}) {
  const exportSave = async () => {
    const code = saveCode(game);
    try {
      await navigator.clipboard.writeText(code);
      setToast('이사 코드를 클립보드에 복사했다. 다른 브라우저에서 불러오기.');
    } catch {
      window.prompt('복사해서 보관하세요 (이사 코드):', code);
    }
  };

  // 불러오기 = import 액션 — 서버가 migrate 후 수입하고 events에 흔적을 남긴다 (v0.5.0)
  const importSave = () => {
    const code = window.prompt('이사 코드를 붙여넣으세요:');
    if (!code) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeURIComponent(atob(code.trim())));
    } catch {
      setToast('이사 코드가 올바르지 않다.');
      return;
    }
    when(dispatch({ type: 'import', save: parsed }), r => {
      if (r.status === 'ok') setToast('세이브를 불러왔다!');
    });
  };

  // 쿠폰 판정·동적 쿠폰 조회는 서버 소관 (v0.5.0) — 클라는 코드만 보낸다
  const enterCoupon = () => {
    const code = window.prompt('쿠폰 코드를 입력하세요:');
    if (!code) return;
    when(dispatch({ type: 'redeemCoupon', code }), r => {
      if (r.status === 'ok' && r.result.type === 'coupon') {
        setToast(`쿠폰 사용! +${r.result.gold}G — ${r.result.desc}`);
      } else if (r.status === 'rejected') {
        setToast(r.error === 'coupon:used' ? '이미 사용한 쿠폰이다.' : '없는 쿠폰 코드다.');
      }
    });
  };

  return (
    <div className="flex flex-col flex-1">
      {syncLabel && (
        <div className={cx('text-[11px]', syncState === 'error' ? 'text-danger' : 'text-text-dim')}>
          {syncLabel}
        </div>
      )}

      <AccountSection game={game} setToast={setToast}
                      account={account} onAuthChanged={onAuthChanged} />

      <SectionTitle>데이터 관리</SectionTitle>
      <div className="flex flex-col gap-2 mb-2">
        <Button className="text-left text-xs" onClick={exportSave}>이사 코드 내보내기</Button>
        <Button className="text-left text-xs" onClick={importSave}>이사 코드 불러오기</Button>
        <Button className="text-left text-xs" onClick={enterCoupon}>쿠폰 입력</Button>
      </div>

      <AdminPanel />
      <PatchNotesPanel />

      <div className="text-[10px] text-text-dim opacity-70 mt-auto pt-2">v{APP_VERSION}</div>
    </div>
  );
}
