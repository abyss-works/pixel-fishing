import { describe, expect, it } from 'vitest';
import {
  ADMIN_READ_POLICY,
  ADMIN_RESOURCE_POLICY,
  ADMIN_WRITE_POLICY,
  canAccessResource,
  canReadQuery,
  canWriteAction,
  capabilitiesFor,
} from './adminPolicy.js';

describe('adminPolicy 선언적 RBAC 레지스트리', () => {
  it('등록된 모든 읽기 조회·쓰기 액션·REST 리소스는 admin과 maintainer 모두 허용한다', () => {
    const expectedReads = [
      'access', 'overview', 'users', 'userSearch', 'userState', 'userEvents',
      'letters', 'mails', 'notices', 'coupons', 'events', 'eventDraws',
      'integrityStages', 'integrityEvents', 'integrityMetrics',
      'economy', 'bountyFunnel', 'onboardingFunnel', 'httpMetrics',
      'opsHealth', 'clientMetrics', 'balanceLive', 'changelog',
      'chatReports', 'spamFlags', 'recentEvents',
    ];
    const expectedResources = [
      '/api/admin/live', '/api/admin/stats/daily', '/api/admin/retention', '/api/admin/sessions',
    ];
    const expectedWrites = [
      'mail', 'restrict', 'letterHandled', 'revokeSessions',
      'notices', 'coupons', 'events', 'staffBadge', 'integrityRelease',
    ];

    expect(Object.keys(ADMIN_READ_POLICY).sort()).toEqual(expectedReads.sort());
    expect(Object.keys(ADMIN_RESOURCE_POLICY).sort()).toEqual(expectedResources.sort());
    expect(Object.keys(ADMIN_WRITE_POLICY).sort()).toEqual(expectedWrites.sort());

    for (const role of ['admin', 'maintainer'] as const) {
      for (const q of expectedReads) expect(canReadQuery(role, q), `read ${q}`).toBe(true);
      for (const path of expectedResources) expect(canAccessResource(role, path), `resource ${path}`).toBe(true);
      for (const action of expectedWrites) expect(canWriteAction(role, action), `write ${action}`).toBe(true);
    }
  });

  it('미등록 조회·쓰기·리소스와 프로토타입 키는 fail-closed(false)다', () => {
    for (const role of ['admin', 'maintainer'] as const) {
      for (const bad of ['', 'unknown', 'constructor', '__proto__', 'toString', 'dailyActive', 'resetLink']) {
        expect(canReadQuery(role, bad)).toBe(false);
        expect(canWriteAction(role, bad)).toBe(false);
        expect(canAccessResource(role, bad)).toBe(false);
      }
      expect(canAccessResource(role, '/api/admin/nope')).toBe(false);
    }
  });

  it('capabilitiesFor는 admin에게만 canViewEmail=true를 주고 허용된 reads·writes 목록을 반환한다', () => {
    const adminCaps = capabilitiesFor('admin');
    const maintCaps = capabilitiesFor('maintainer');

    expect(adminCaps.canViewEmail).toBe(true);
    expect(maintCaps.canViewEmail).toBe(false);
    expect(adminCaps.reads).toContain('userSearch');
    expect(adminCaps.reads).toContain('/api/admin/sessions');
    expect(maintCaps.reads).toContain('userSearch');
    expect(maintCaps.reads).toContain('/api/admin/sessions');
    expect(adminCaps.writes).toContain('mail');
    expect(maintCaps.writes).toContain('mail');
    expect(maintCaps.writes).toContain('integrityRelease');
  });
});
