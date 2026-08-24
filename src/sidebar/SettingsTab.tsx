import { useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import { when } from '../backend/types';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { saveCode, supabase, signOutAccount } from '../backend/auth';
import { REJECT_TEXT } from '../game/logic';
import { APP_VERSION } from '../version';
import { BUILD_LABEL } from '../buildId';
import { cx } from '../ui/cx';
import Button from '../ui/Button';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';
import AdminPanel from './AdminPanel';
import PatchNotesPanel from './PatchNotesPanel';
import AccountModal from './AccountModal';
import { maskUid } from './shared';
import LetterModal from './LetterModal';
import PixelIcon from '../ui/PixelIcon';
import type { GlyphId } from '../ui/PixelIcon';

// 설정 탭 버튼은 전부 **아이콘 + 가운데 정렬**이다. 목록형이라 왼쪽 정렬이었는데, 글자 길이가
// 제각각(3~9자)이라 줄마다 시작점은 같고 끝점이 달라 들쭉날쭉했다. 아이콘이 붙으면서
// 가운데로 모으는 편이 덩어리로 읽힌다.
function IconButton({ glyph, label, ...rest }: {
  glyph: GlyphId; label: string;
} & React.ComponentProps<typeof Button>) {
  return (
    <Button {...rest} className="text-sm flex items-center justify-center gap-1.5">
      <PixelIcon glyph={glyph} size={12} />{label}
    </Button>
  );
}

// ---------- 계정 (v0.4.0) — 설정 탭엔 상태+버튼만, 폼은 오버레이 모달 ----------
// 가입 = 익명 계정 승격(진행 유지) / 로그인 = 다른 계정으로 교체(현재 게스트 진행 소멸 — 경고+백업)

function AccountSection({ game, setToast, account, onAuthChanged }: {
  game: GameState; setToast: (m: string) => void;
  account: string | null; onAuthChanged: () => Promise<void>;
  }) {
  const [open, setOpen] = useState(false);
  // 로컬(supabase 없음)에서도 화면은 보여준다 — UI 확인이 목적이라 숨기면 볼 수가 없다.
  // 대신 버튼은 막는다: 눌러도 되는 일이 없는데 눌리면 그게 더 헷갈린다.
  const offline = !supabase;

  const signOut = async () => {
    if (!window.confirm('로그아웃할까요? 이 기기는 새 게스트로 다시 시작해요.')) return;
    await signOutAccount();
    window.location.reload(); // 재부팅 = 새 익명 세션으로 깔끔하게 시작
  };

  return (
    <>
      <SectionTitle>계정</SectionTitle>
      {offline && <Note>로컬 개발 모드 — 계정 기능은 동작하지 않아요(화면 확인용).</Note>}
      {account ? (
        <>
          <Note><b className="text-gold">{account}</b>로 로그인됨 — 진행이 이 계정에 저장돼요.</Note>
          <div className="flex flex-col gap-2 mb-2">
            <IconButton glyph="exit" label="로그아웃" disabled={offline} onClick={signOut} />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 mb-2">
          <IconButton glyph="key" label="계정 연동" variant="primary"
                    disabled={offline} onClick={() => setOpen(true)} />
        </div>
      )}
      {open && (
        <AccountModal game={game} setToast={setToast}
                      onAuthChanged={onAuthChanged} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export default function SettingsTab({ game, dispatch, setToast, syncLabel, syncState, account, uid, onAuthChanged }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
  syncLabel: string | null; syncState: string;
  account: string | null; uid: string | null; onAuthChanged: () => Promise<void>;
  }) {
  const [letter, setLetter] = useState(false);

  // 이사 코드 내보내기와 같은 처리 — 클립보드가 막히면 프롬프트로 폴백한다.
  // **복사는 언제나 전체 값**이다 — 화면만 가린다(아래 maskUid).
  const copyId = async (value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setToast('내 ID를 복사했어요. 문의하실 때 함께 보내주세요.');
    } catch {
      window.prompt('복사가 막혀 있어요. 아래 값을 직접 복사하세요.', value);
    }
  };

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
        setToast(REJECT_TEXT[r.error]);
      }
    });
  };

  return (
    <div className="flex flex-col flex-1">
      {syncLabel && (
        <div className={cx('text-xs', syncState === 'error' ? 'text-danger' : 'text-text-dim')}>
          {syncLabel}
        </div>
      )}

      <AccountSection game={game} setToast={setToast}
                      account={account} onAuthChanged={onAuthChanged} />

      {/* 내 정보 — **문의 대응용이다.** 문제를 알려온 사람의 세이브를 DB에서 찾으려면 uid가
          있어야 하는데, 게스트는 이메일조차 없어 uid 말고는 식별할 방법이 없다.
          "개발자 도구 → 애플리케이션 탭"을 안내하는 것보다 여기서 눌러 복사하는 게 빠르다.
          body에 user-select:none이 걸려 있어 드래그 복사가 안 된다 — 그래서 버튼이 필수다. */}
      <SectionTitle>내 정보</SectionTitle>
      <div className="pf-frame divide-y divide-line mb-2 text-xs">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="text-text-dim shrink-0">계정</span>
          <span className="truncate">{account ?? '게스트 (이메일 없음)'}</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="text-text-dim shrink-0">ID</span>
          <span className="pf-accent text-2xs truncate select-text">{uid ? maskUid(uid) : '연결 중…'}</span>
          <Button size="sm" className="ml-auto shrink-0" disabled={!uid}
                  onClick={() => copyId(uid)}>복사</Button>
        </div>
      </div>
      <Note>문의하실 때 이 <b>ID</b>를 함께 알려주시면 빠르게 해결할 수 있어요.
        가운데는 가려 두었지만 <b>복사</b>를 누르면 전체가 복사돼요.</Note>

      <SectionTitle>데이터 관리</SectionTitle>
      <div className="flex flex-col gap-2 mb-2">
        <IconButton glyph="download" label="이사 코드 내보내기" onClick={exportSave} />
        <IconButton glyph="upload" label="이사 코드 불러오기" onClick={importSave} />
        <IconButton glyph="ticket" label="쿠폰 입력" onClick={enterCoupon} />
      </div>

      {/* 개발자 창구 — **로그인한 계정만.** 게스트는 답장 받을 방법이 없다 */}
      {account && (
        <>
          <SectionTitle>개발자에게</SectionTitle>
          <div className="flex flex-col gap-2 mb-2">
            <IconButton glyph="letter" label="편지 쓰기" onClick={() => setLetter(true)} />
          </div>
        </>
      )}

      <AdminPanel />
      <PatchNotesPanel />

      {letter && (
        <LetterModal dispatch={dispatch} setToast={setToast} onClose={() => setLetter(false)} />
      )}

      {/* 버전(사람이 붙이는 이름)과 배포 식별자(커밋 SHA)를 같이 건다.
          업데이트가 나갔는지 확인할 때 봐야 하는 건 **뒤쪽**이다 — 버전은 릴리즈 때만 올라가서
          dev 배포 사이에서는 안 바뀐다. 두 탭의 이 값이 다르면 한쪽이 낡은 화면이다. */}
      <div className="text-2xs text-text-dim opacity-70 mt-auto pt-2">
        v{APP_VERSION} · <span className="pf-accent" title="배포 식별자 (커밋 SHA)">{BUILD_LABEL}</span>
      </div>
    </div>
  );
}
