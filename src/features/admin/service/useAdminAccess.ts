import { useQuery } from '@tanstack/react-query';
import { adminKeys } from './queryKeys';
import { readAdminAccess } from './queries';
import type { AdminAuth } from './accessContext';

// 접근 판정 — 관리자 앱이 마운트 때 한 번만 해석한다(탭은 context만 소비한다).
// 판정 전에는 checking, 왕복 실패는 denied로 수렴한다 — 수동 조회 시절과 같은 계약.
export function useAdminAccess(): AdminAuth {
  const q = useQuery({ queryKey: adminKeys.access, queryFn: readAdminAccess });
  if (q.data) return { access: q.data.kind, uid: q.data.uid };
  return q.error ? { access: 'denied', uid: null } : { access: 'checking', uid: null };
}
