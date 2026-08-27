// 관리자 접근 판정의 단일 근원 — AdminApp가 마운트 때 **한 번만** 해석하고, 모든 탭은
// context를 소비할 뿐 각자 판정하지 않는다.
// UI 정책(사용자 결정): 게이트는 내용을 **교체하지 않는다** — 페이지 위에 배너 한 장을 얹고,
// 탭은 골격(KPI '—'·빈 표·안내)을 항상 그린다. 데이터 탭은 granted일 때만 조회한다(api 계층).
// 판정 자체도 api 계층을 경유한다(api.admin.access) — supabase/뷰 전송 상세는 여기 모른다.
//
// 게이트 밖 탭(의도된 것): 어종 시뮬 = 번들 데이터만 쓰는 순수 클라 시뮬레이터,
// 운영 = 지금 세션이 왜 막혔는지 진단해야 하는 화면이라 밖에 둔다.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { AdminAuthCtx, useAdminAuth } from './accessContext';
import type { AdminAuth } from './accessContext';

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AdminAuth>({ access: 'checking', uid: null });
  useEffect(() => {
    let alive = true;
    api.admin.access()
      .then(r => {
        if (alive) setAuth({ access: r.kind === 'granted' ? 'granted' : r.kind, uid: r.uid });
      })
      .catch(() => { /* 판정 실패 → denied 취급. 오류 메시지는 HttpAdmin이 이미 조립한다 */ if (alive) setAuth({ access: 'denied', uid: null }); });
    return () => { alive = false; };
  }, []);
  return <AdminAuthCtx.Provider value={auth}>{children}</AdminAuthCtx.Provider>;
}

/**
 * 게이트 배너 — 데이터 탭들 상단에 한 번만 얹는다. granted면 아무것도 안 그린다.
 * local과 denied는 **다른 문구**: local은 "설정 문제", denied는 "DB admins 등록 문제"로
 * 해법이 다르기 때문. denied일 때는 해제 절차(SQL Editor INSERT)까지 바로 준다.
 */
export function AdminGateBanner() {
  const { access, uid } = useAdminAuth();
  if (access === 'granted') return null;
  if (access === 'checking') {
    return (
      <div className="border border-line bg-surface rounded-sm px-3 py-2 mb-3">
        <p className="text-xs text-text-dim">접근 권한 확인 중…</p>
      </div>
    );
  }
  if (access === 'local') {
    return (
      <div className="border border-line bg-surface rounded-sm px-3 py-2 mb-3">
        <p className="text-sm">로컬 모드 — 클라우드가 설정되어 있지 않다.</p>
        <p className="text-xs text-text-dim mt-1 leading-relaxed">
          화면 골격은 그대로 보여준다. 운영·스테이징 Supabase 연결(VITE_SUPABASE_URL)을 붙이면
          아래 탭들이 실제 데이터로 채워진다. <span className="pf-accent text-gold">어종 시뮬레이션</span>처럼
          번들 데이터만 쓰는 탭은 지금도 온전히 동작한다.
        </p>
      </div>
    );
  }
  return (
    <div className="border border-danger/40 bg-surface rounded-sm px-3 py-2 mb-3">
      <p className="text-sm text-danger">
        운영자 세션이 아니다 — 읽기 권한은 UI가 아니라 DB 정책(public.admins)이 결정한다.
        화면 골격은 보인다.
      </p>
      {uid && (
        <p className="text-xs text-text-dim mt-1 leading-relaxed select-text">
          이 세션 uid: <code className="pf-accent text-gold">{uid}</code>
          　해제: 해당 프로젝트 SQL Editor에서{' '}
          <code>insert into public.admins (user_id) values ('{uid}');</code>
        </p>
      )}
      {!uid && (
        <p className="text-xs text-text-dim mt-1">
          세션이 없다 — 게임으로 돌아가 계정을 만들거나 로그인한 뒤 다시 열어라.
        </p>
      )}
    </div>
  );
}
