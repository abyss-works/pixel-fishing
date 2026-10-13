// 관리자 접근 컨텍스트 — 판정 상태와 소비용 훅만 산다(컴포넌트 없음).
// Provider·게이트 UI는 access.tsx가 담당한다 — fast refresh 규약상 컴포넌트와 비컴포넌트
// export를 한 파일에 섞지 않는다(oxlint only-export-components).
import { createContext, useContext } from 'react';

export type AdminAccess =
  | 'checking'   // 판정 중
  | 'local'      // 클라우드 미설정 — 권한 실패가 아니라 판정 자체가 불가능한 모드
  | 'denied'     // DB까지 도달했으나 admins에 없음
  | 'granted';

export interface AdminAuth {
  access: AdminAccess;
  /** 현재 세션 uid — denied일 때 "이 uid를 등록하라" 안내에 쓴다 */
  uid: string | null;
}

export const AdminAuthCtx = createContext<AdminAuth>({ access: 'checking', uid: null });

export function useAdminAuth(): AdminAuth {
  return useContext(AdminAuthCtx);
}
