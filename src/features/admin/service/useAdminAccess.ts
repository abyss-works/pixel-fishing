import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminAccessResult } from '../../../platform/api';
import { adminKeys } from './queryKeys';
import { adminSignInRequired, readAdminAccess, writeAdminStaffBadge } from './queries';
import type { AdminAuth } from './accessContext';

const NOOP_SET_STAFF_BADGE = async () => {};
const LOCAL: AdminAuth = {
  access: 'local',
  uid: null,
  role: 'admin',
  canViewEmail: true,
  showStaffBadge: false,
  setStaffBadge: NOOP_SET_STAFF_BADGE,
};

// 접근 판정 — 관리자 앱이 마운트 때 한 번만 해석한다(탭은 context만 소비한다).
// 로컬 모드는 조회 없이 바로 local이다. 판정 전에는 checking, 왕복 실패는 uid 없는 denied로 수렴한다.
export function useAdminAccess(): AdminAuth {
  const client = useQueryClient();
  const q = useQuery({ queryKey: adminKeys.access, queryFn: readAdminAccess, enabled: adminSignInRequired });
  const setStaffBadge = useCallback(async (show: boolean) => {
    const res = await writeAdminStaffBadge(show);
    client.setQueryData<AdminAccessResult>(adminKeys.access, prev =>
      prev?.kind === 'granted' ? { ...prev, showStaffBadge: res.showStaffBadge } : prev,
    );
  }, [client]);

  if (!adminSignInRequired) return LOCAL;
  if (q.data) {
    if (q.data.kind === 'granted') {
      const role = q.data.role ?? 'admin';
      return {
        access: 'granted',
        uid: q.data.uid,
        role,
        canViewEmail: q.data.capabilities?.canViewEmail ?? role === 'admin',
        showStaffBadge: q.data.showStaffBadge ?? false,
        setStaffBadge,
      };
    }
    return {
      access: q.data.kind,
      uid: q.data.uid,
      role: 'admin',
      canViewEmail: false,
      showStaffBadge: false,
      setStaffBadge: NOOP_SET_STAFF_BADGE,
    };
  }
  return q.error
    ? { access: 'denied', uid: null, role: 'admin', canViewEmail: false, showStaffBadge: false, setStaffBadge: NOOP_SET_STAFF_BADGE }
    : { access: 'checking', uid: null, role: 'admin', canViewEmail: false, showStaffBadge: false, setStaffBadge: NOOP_SET_STAFF_BADGE };
}
