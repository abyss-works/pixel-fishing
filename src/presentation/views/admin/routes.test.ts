// 관리자 해시 경로 — 5탭 정식 해시 왕복, 구 8탭 호환 리다이렉트, 역할 공통 접근을 고정한다.
import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, ADMIN_TABS, adminHash, adminRouteOf, parseAdminHash, sectionsForRole } from './routes';

describe('관리자 해시 경로', () => {
  it('정식 해시는 그대로 되돌아온다', () => {
    const canonical = [
      ...ADMIN_SECTIONS.overview.map(s => `#/admin/overview/${s.key}`),
      ...ADMIN_SECTIONS.players.map(s => `#/admin/players/${s.key}`),
      ...ADMIN_SECTIONS.comms.map(s => `#/admin/comms/${s.key}`),
      ...ADMIN_SECTIONS.insights.map(s => `#/admin/insights/${s.key}`),
      ...ADMIN_SECTIONS.ops.map(s => `#/admin/ops/${s.key}`),
    ];
    for (const hash of canonical) expect(adminHash(parseAdminHash(hash))).toBe(hash);
  });

  it('구역이 없거나 틀린 해시는 그 탭의 기본 구역으로 모인다', () => {
    expect(adminHash(parseAdminHash('#/admin/overview'))).toBe('#/admin/overview/summary');
    expect(adminHash(parseAdminHash('#/admin/players'))).toBe('#/admin/players/directory');
    expect(adminHash(parseAdminHash('#/admin/players/nope'))).toBe('#/admin/players/directory');
    expect(adminHash(parseAdminHash('#/admin/comms'))).toBe('#/admin/comms/mail');
    expect(adminHash(parseAdminHash('#/admin/comms/notices'))).toBe('#/admin/comms/notices');
    expect(adminHash(parseAdminHash('#/admin/insights'))).toBe('#/admin/insights/economy');
    expect(adminHash(parseAdminHash('#/admin/ops'))).toBe('#/admin/ops/server');
  });

  it('구 8탭 해시는 새 5탭 경로로 호환 리다이렉트된다', () => {
    expect(adminHash(parseAdminHash('#/admin/live'))).toBe('#/admin/overview/live');
    expect(adminHash(parseAdminHash('#/admin/players/roster'))).toBe('#/admin/players/directory');
    expect(adminHash(parseAdminHash('#/admin/players/abuse'))).toBe('#/admin/players/sanctions');
    expect(adminHash(parseAdminHash('#/admin/analysis'))).toBe('#/admin/insights/economy');
    expect(adminHash(parseAdminHash('#/admin/analysis/economy'))).toBe('#/admin/insights/economy');
    expect(adminHash(parseAdminHash('#/admin/analysis/progression'))).toBe('#/admin/insights/economy');
    expect(adminHash(parseAdminHash('#/admin/analysis/activity'))).toBe('#/admin/insights/retention');
    expect(adminHash(parseAdminHash('#/admin/balance'))).toBe('#/admin/insights/sim');
    expect(adminHash(parseAdminHash('#/admin/content'))).toBe('#/admin/ops/catalog');
  });

  it('모르는 해시와 관리자 밖 해시는 현황 요약이 된다', () => {
    for (const hash of ['', '#', '#/admin', '#/admin/', '#/admin/nope', '#/admin/users', '#/admin/fish', '#/other/live']) {
      expect(adminHash(parseAdminHash(hash))).toBe('#/admin/overview/summary');
    }
  });

  it('탭을 누르면 그 탭의 기본 화면으로 간다', () => {
    expect(ADMIN_TABS.map(t => adminHash(adminRouteOf(t.key)))).toEqual([
      '#/admin/overview/summary',
      '#/admin/players/directory',
      '#/admin/comms/mail',
      '#/admin/insights/economy',
      '#/admin/ops/server',
    ]);
  });

  it('탭은 다섯 개이고 이름이 정해져 있다', () => {
    expect(ADMIN_TABS.map(t => t.label)).toEqual(['현황', '플레이어', '소통·지급', '지표·밸런스', '운영·콘텐츠']);
  });

  it('admin과 maintainer 모두 동일한 5탭·하위 구역을 사용한다', () => {
    expect(sectionsForRole('players', 'maintainer').map(s => s.key)).toEqual(['directory', 'sanctions']);
    expect(sectionsForRole('comms', 'maintainer').map(s => s.key)).toEqual(['mail', 'notices', 'coupons', 'letters']);
    expect(adminHash(parseAdminHash('#/admin/players/directory', 'maintainer'))).toBe('#/admin/players/directory');
    expect(adminHash(parseAdminHash('#/admin/comms/mail', 'maintainer'))).toBe('#/admin/comms/mail');
    expect(adminHash(parseAdminHash('#/admin/comms/letters', 'maintainer'))).toBe('#/admin/comms/letters');
  });
});
