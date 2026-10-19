// 관리자 접근 판정의 단일 근원 — AdminApp가 마운트 때 **한 번만** 해석하고, 모든 탭은
// context를 소비할 뿐 각자 판정하지 않는다.
// UI 정책(사용자 결정): 게이트는 내용을 **교체하지 않는다** — 페이지 위에 배너 한 장을 얹고,
// 탭은 골격(지표 '—'·빈 표·안내)을 항상 그린다. 데이터 탭은 granted일 때만 조회한다.
// 접근 판정 조회는 기능 계층이 맡고, 전송 상세는 여기서 다루지 않는다.
//
// 게이트 밖 탭(의도된 것): 밸런스 = 번들 데이터만 쓰는 순수 클라 시뮬레이터,
// 운영 = 지금 세션이 왜 막혔는지 진단해야 하는 화면이라 밖에 둔다.
import type { ReactNode } from 'react';
import Inset from '../../ui/Inset';
import Note from '../../ui/Note';
import { useAdminAccess } from '../../../features/admin/service/useAdminAccess';
import { AdminAuthCtx, useAdminAuth } from '../../../features/admin/service/accessContext';

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const auth = useAdminAccess();
  return <AdminAuthCtx.Provider value={auth}>{children}</AdminAuthCtx.Provider>;
}

/**
 * 게이트 배너 — 데이터 탭들 상단에 한 번만 얹는다. granted면 아무것도 안 그린다.
 * local과 denied는 **다른 문구**: local은 "설정 문제", denied는 "DB admins 등록 문제"로
 * 해법이 다르기 때문. denied일 때는 해제 절차(SQL Editor INSERT)까지 바로 준다.
 * 배너는 표면을 파낸 오목한 칸으로 그린다 — 패널을 겹치지 않는다.
 */
export function AdminGateBanner() {
  const { access, uid } = useAdminAuth();
  if (access === 'granted') return null;
  if (access === 'checking') {
    return (
      <Inset tone="deep" className="px-4 py-3">
        <Note size="xs" className="my-0">접근 권한을 확인하는 중…</Note>
      </Inset>
    );
  }
  if (access === 'local') {
    return (
      <Inset tone="deep" className="flex flex-col gap-1 px-4 py-3">
        <p className="text-sm">로컬 모드예요. 클라우드가 설정되어 있지 않아요.</p>
        <Note size="xs" className="my-0 leading-relaxed">
          화면 골격은 그대로 보여 줘요. 운영·스테이징 Supabase 연결(VITE_SUPABASE_URL)을 붙이면
          아래 탭이 실제 데이터로 채워져요. <span className="pf-accent text-gold">밸런스</span>처럼
          번들 데이터만 쓰는 탭은 지금도 온전히 동작해요.
        </Note>
      </Inset>
    );
  }
  return (
    <Inset tone="deep" className="flex flex-col gap-1 px-4 py-3">
      <Note tone="warn" className="my-0">
        운영자 세션이 아니에요. 읽기 권한은 UI가 아니라 서버가 admins 명부(public.admins)로 정해요.
        화면 골격은 보여 줘요.
      </Note>
      {uid && (
        <>
          <Note size="xs" className="my-0 leading-relaxed select-text">
            이 세션의 uid는 <code className="pf-accent text-gold">{uid}</code>예요.
          </Note>
          <Note size="xs" className="my-0 leading-relaxed select-text">
            해제하려면 해당 프로젝트의 SQL Editor에서{' '}
            <code>insert into public.admins (user_id) values (&apos;{uid}&apos;);</code>를 실행해 주세요.
          </Note>
        </>
      )}
      {!uid && (
        <Note size="xs" className="my-0">
          세션이 없어요. 게임으로 돌아가 계정을 만들거나 로그인한 뒤 다시 열어 주세요.
        </Note>
      )}
    </Inset>
  );
}
