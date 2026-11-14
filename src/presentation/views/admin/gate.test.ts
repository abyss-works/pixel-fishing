// 관리자 주소 판정 — 옛 주소 이동(해시 경로 유지, 개발 도구 게이트만 있는 주소는 이동 안 함)과 개발 도구 패널 노출 조건.
import { describe, expect, it } from 'vitest';
import { canSeeDevTools, legacyAdminTarget } from './gate';

describe('옛 관리자 주소', () => {
  it('?admin과 관리자 해시가 함께 있으면 해시를 유지해 /admin/으로 옮긴다', () => {
    expect(legacyAdminTarget('?admin=1', '#/admin/players/abuse')).toBe('/admin/#/admin/players/abuse');
    expect(legacyAdminTarget('?admin', '#/admin')).toBe('/admin/#/admin');
  });

  it('개발 도구 게이트만 있거나 관리자 해시만 있으면 옮기지 않는다', () => {
    expect(legacyAdminTarget('?admin=1', '')).toBeNull();
    expect(legacyAdminTarget('', '#/admin/overview')).toBeNull();
  });
});

describe('개발 도구 패널 노출', () => {
  const where = (adminUrl: boolean, localOrigin: boolean) => ({ adminUrl, localOrigin });

  it('서버 판정이 참이면 ?admin 주소에서 열린다', () => {
    expect(canSeeDevTools(true, where(true, false))).toBe(true);
  });

  it('서버 판정이 거짓이거나 없으면 닫힌다', () => {
    expect(canSeeDevTools(false, where(true, false))).toBe(false);
    expect(canSeeDevTools(undefined, where(true, false))).toBe(false);
  });

  it('?admin이 없으면 서버 판정이 참이어도 닫힌다', () => {
    expect(canSeeDevTools(true, where(false, false))).toBe(false);
  });

  it('로컬 오리진은 서버 판정과 무관하게 ?admin에서 열린다', () => {
    expect(canSeeDevTools(false, where(true, true))).toBe(true);
    expect(canSeeDevTools(undefined, where(false, true))).toBe(false);
  });
});
