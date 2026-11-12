// 관리자 접근 판정의 단일 근원 — AdminApp가 마운트 때 **한 번만** 해석하고, 모든 탭은
// context를 소비할 뿐 각자 판정하지 않는다. 접근 판정 조회는 기능 계층이 맡는다.
//
// UI 정책: 운영·스테이징은 가드가 대시보드 전체를 덮는다. 관리자로 확인되기 전에는
// 탭 골격을 그리지 않고 상태별 화면 하나(확인 중 · 로그인 · 권한 없음)만 보인다. 대시보드가 마운트되지 않으므로
// 탭의 데이터 조회도 시작되지 않는다. 로컬 모드(클라우드 미설정)는 골격과 로컬 안내 배너를 그대로 보인다.
import { useState } from 'react';
import type { ReactNode } from 'react';
import Button from '../../ui/Button';
import GoogleButton from '../../ui/GoogleButton';
import Inset from '../../ui/Inset';
import Note from '../../ui/Note';
import { GOOGLE_BUTTON_LABEL } from '../../../features/account/model/googleFlow';
import { useAdminAccess } from '../../../features/admin/service/useAdminAccess';
import { useAdminSession } from '../../../features/admin/service/useAdminSession';
import { useAdminSignInReturn } from '../../../features/admin/service/useAdminSignInReturn';
import { AdminAuthCtx, useAdminAuth } from '../../../features/admin/service/accessContext';

const SIGN_IN_GUIDE = '게임에서 관리자 계정에 연결한 구글 계정으로 로그인해요.\n게임의 로그인 상태와는 따로 유지돼요.';

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const auth = useAdminAccess();
  // 구글 로그인에서 돌아온 주소는 어느 결과든 마운트 때 한 번 읽어 지운다. 로그인 화면은 같은 읽기를 캐시에서 받는다
  useAdminSignInReturn();
  return <AdminAuthCtx.Provider value={auth}>{children}</AdminAuthCtx.Provider>;
}

/** 관리자 가드 — 관리자이거나 로컬 모드일 때만 children(대시보드)을 그린다 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { access, uid } = useAdminAuth();
  if (access === 'granted' || access === 'local') return children;
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface p-4 text-text">
      <Inset tone="deep" className="flex w-full max-w-sm flex-col gap-3 px-5 py-5">
        <span className="pf-accent text-lg text-gold">관리자 대시보드</span>
        {access === 'checking' && <Note size="xs" className="my-0">접근 권한을 확인하고 있어요.</Note>}
        {access === 'signedOut' && <AdminSignIn />}
        {access === 'denied' && <AdminDenied uid={uid} />}
      </Inset>
    </div>
  );
}

/** 관리자 로그인 — 게임에서 관리자 계정에 연결한 구글 계정으로 관리자 세션을 연다 */
function AdminSignIn() {
  const { signIn } = useAdminSession();
  const returned = useAdminSignInReturn();
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setStartError(null);
    const result = await signIn();
    // 성공하면 구글 인증 화면으로 넘어가므로 버튼은 그대로 잠근다
    if (!result.ok) {
      setBusy(false);
      setStartError(result.msg);
    }
  };
  const notice = startError ? { tone: 'warn' as const, text: startError } : returned;
  return (
    <>
      <Note size="xs" className="my-0 leading-relaxed">{SIGN_IN_GUIDE}</Note>
      {notice && <Note size="xs" tone={notice.tone} className="my-0 leading-relaxed">{notice.text}</Note>}
      <div className="flex justify-center [&>button]:w-auto">
        <GoogleButton disabled={busy} onClick={() => void start()}>{GOOGLE_BUTTON_LABEL}</GoogleButton>
      </div>
    </>
  );
}

/** 권한 없음 — 관리자 명부에 없는 계정이거나 판정 왕복이 실패했다. 로그아웃만 할 수 있다 */
function AdminDenied({ uid }: { uid: string | null }) {
  const { signOut } = useAdminSession();
  return (
    <>
      {uid ? (
        <>
          <Note tone="warn" className="my-0">운영자로 등록되지 않은 계정이에요.</Note>
          <Note size="xs" className="my-0 leading-relaxed select-text">
            이 계정의 uid는 <code className="pf-accent text-gold">{uid}</code>예요.
          </Note>
        </>
      ) : (
        <Note tone="warn" className="my-0">접근 권한을 확인하지 못했어요. 잠시 후 새로고침해 주세요.</Note>
      )}
      <Button full onClick={() => void signOut()}>로그아웃</Button>
    </>
  );
}

/** 로컬 모드 안내 — 데이터 탭들 상단에 한 번만 얹는다. 클라우드 빌드에서는 아무것도 그리지 않는다 */
export function AdminGateBanner() {
  const { access } = useAdminAuth();
  if (access !== 'local') return null;
  return (
    <Inset tone="deep" className="flex flex-col gap-1 px-4 py-3">
      <p className="text-sm">로컬 모드예요. 클라우드가 설정되어 있지 않아요.</p>
      <Note size="xs" className="my-0 leading-relaxed">
        화면 골격은 그대로 보여 줘요. 클라우드 빌드(VITE_CLOUD=1)로 운영·스테이징 서버에 붙으면
        아래 탭이 실제 데이터로 채워져요. <span className="pf-accent text-gold">밸런스</span>처럼
        번들 데이터만 쓰는 탭은 지금도 온전히 동작해요.
      </Note>
    </Inset>
  );
}

/** 대시보드 머리의 로그아웃 — 관리자 세션일 때만 보인다 */
export function AdminSignOutButton() {
  const { access } = useAdminAuth();
  const { signOut } = useAdminSession();
  if (access !== 'granted') return null;
  return <Button variant="ghost" size="sm" onClick={() => void signOut()}>로그아웃</Button>;
}
