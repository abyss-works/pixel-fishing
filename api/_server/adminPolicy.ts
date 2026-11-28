// 관리자 대시보드 선언적 RBAC 권한표(fail-closed).
// 모든 읽기 조회(?q=), 쓰기 액션(POST ?q=), REST 리소스(/api/admin/*)의 허용 역할을 한 곳에서 선언한다.
// 미등록 항목은 기본 거부(false)다.
import type { AdminRole } from '../_data/admin.js';

export interface AdminCapabilities {
  canViewEmail: boolean;
  reads: readonly string[];
  writes: readonly string[];
}

const ALL_STAFF: readonly AdminRole[] = ['admin', 'maintainer'];

/** GET /api/admin?q=<name> 읽기 조회 권한표 */
export const ADMIN_READ_POLICY: Record<string, readonly AdminRole[]> = {
  access: ALL_STAFF,
  overview: ALL_STAFF,
  users: ALL_STAFF,
  userSearch: ALL_STAFF,
  userState: ALL_STAFF,
  userEvents: ALL_STAFF,
  letters: ALL_STAFF,
  mails: ALL_STAFF,
  notices: ALL_STAFF,
  coupons: ALL_STAFF,
  events: ALL_STAFF,
  eventDraws: ALL_STAFF,
  integrityStages: ALL_STAFF,
  integrityEvents: ALL_STAFF,
  integrityMetrics: ALL_STAFF,
  economy: ALL_STAFF,
  bountyFunnel: ALL_STAFF,
  onboardingFunnel: ALL_STAFF,
  httpMetrics: ALL_STAFF,
  opsHealth: ALL_STAFF,
  clientMetrics: ALL_STAFF,
  balanceLive: ALL_STAFF,
  changelog: ALL_STAFF,
  chatReports: ALL_STAFF,
  spamFlags: ALL_STAFF,
  recentEvents: ALL_STAFF,
};

/** GET /api/admin/<resource> REST 리소스 권한표 */
export const ADMIN_RESOURCE_POLICY: Record<string, readonly AdminRole[]> = {
  '/api/admin/live': ALL_STAFF,
  '/api/admin/stats/daily': ALL_STAFF,
  '/api/admin/retention': ALL_STAFF,
  '/api/admin/sessions': ALL_STAFF,
};

/** POST /api/admin?q=<action> 쓰기 액션 권한표 */
export const ADMIN_WRITE_POLICY: Record<string, readonly AdminRole[]> = {
  mail: ALL_STAFF,
  restrict: ALL_STAFF,
  letterHandled: ALL_STAFF,
  revokeSessions: ALL_STAFF,
  notices: ALL_STAFF,
  coupons: ALL_STAFF,
  events: ALL_STAFF,
  staffBadge: ALL_STAFF,
  integrityRelease: ALL_STAFF,
};

function allows(policy: Record<string, readonly AdminRole[]>, key: string, role: AdminRole): boolean {
  if (!Object.hasOwn(policy, key)) return false;
  return policy[key].includes(role);
}

export function canReadQuery(role: AdminRole, q: string): boolean {
  return allows(ADMIN_READ_POLICY, q, role);
}

export function canAccessResource(role: AdminRole, path: string): boolean {
  return allows(ADMIN_RESOURCE_POLICY, path, role);
}

export function canWriteAction(role: AdminRole, action: string): boolean {
  return allows(ADMIN_WRITE_POLICY, action, role);
}

export function capabilitiesFor(role: AdminRole): AdminCapabilities {
  const reads = [
    ...Object.entries(ADMIN_READ_POLICY).filter(([, roles]) => roles.includes(role)).map(([k]) => k),
    ...Object.entries(ADMIN_RESOURCE_POLICY).filter(([, roles]) => roles.includes(role)).map(([k]) => k),
  ];
  const writes = Object.entries(ADMIN_WRITE_POLICY)
    .filter(([, roles]) => roles.includes(role))
    .map(([k]) => k);
  return {
    canViewEmail: role === 'admin',
    reads,
    writes,
  };
}
