// 관리자 접근 컨텍스트 — 판정 상태와 소비용 훅만 산다(컴포넌트 없음).
// Provider·게이트 UI는 화면 컴포넌트가 담당한다 — fast refresh 규약상 컴포넌트와 비컴포넌트
// export를 한 파일에 섞지 않는다(oxlint only-export-components).
import { createContext, useContext } from 'react';
import type { AdminRole } from '../model/types';

export type AdminAccess =
  | 'checking'   // 판정 중
  | 'local'      // 클라우드 미설정 — 권한 실패가 아니라 판정 자체가 불가능한 모드
  | 'signedOut'  // 관리자 세션 없음 — 대시보드 로그인이 필요하다
  | 'denied'     // DB까지 도달했으나 admins에 없음
  | 'granted';

export interface AdminAuth {
  access: AdminAccess;
  /** 관리자 세션 uid — denied일 때 권한 없음 안내에 보인다 */
  uid: string | null;
  role: AdminRole;
  /** 직접 개인정보(이메일 원문·가입/로그인 메타) 열람 가능 여부 */
  canViewEmail: boolean;
  showStaffBadge: boolean;
  setStaffBadge: (show: boolean) => Promise<void>;
}

const NOOP_SET_STAFF_BADGE = async () => {};

export const AdminAuthCtx = createContext<AdminAuth>({
  access: 'checking',
  uid: null,
  role: 'admin',
  canViewEmail: true,
  showStaffBadge: false,
  setStaffBadge: NOOP_SET_STAFF_BADGE,
});

export function useAdminAuth(): AdminAuth {
  return useContext(AdminAuthCtx);
}
