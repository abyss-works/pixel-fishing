import { useQuery } from '@tanstack/react-query';
import { adminKeys } from './queryKeys';
import { adminSignInRequired, readAdminAccess } from './queries';
import type { AdminAuth } from './accessContext';

const LOCAL: AdminAuth = { access: 'local', uid: null };

// 접근 판정 — 관리자 앱이 마운트 때 한 번만 해석한다(탭은 context만 소비한다).
// 로컬 모드는 조회 없이 바로 local이다. 판정 전에는 checking, 왕복 실패는 uid 없는 denied로 수렴한다.
export function useAdminAccess(): AdminAuth {
  const q = useQuery({ queryKey: adminKeys.access, queryFn: readAdminAccess, enabled: adminSignInRequired });
  if (!adminSignInRequired) return LOCAL;
  if (q.data) return { access: q.data.kind, uid: q.data.uid };
  return q.error ? { access: 'denied', uid: null } : { access: 'checking', uid: null };
}
