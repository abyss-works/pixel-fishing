// 옛 관리자 주소 이동 — 해시 경로를 유지하고, 개발 도구 게이트(?admin)만 있는 주소는 옮기지 않는다.
import { describe, expect, it } from 'vitest';
import { legacyAdminTarget } from './gate';

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
