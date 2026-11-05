// 관리자 해시 경로 — 정식 해시의 왕복과 잘못된 해시의 수렴을 고정한다.
import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, ADMIN_TABS, adminHash, adminRouteOf, parseAdminHash } from './routes';

describe('관리자 해시 경로', () => {
  it('정식 해시는 그대로 되돌아온다', () => {
    const canonical = [
      '#/admin/overview', '#/admin/live', '#/admin/balance', '#/admin/ops',
      ...ADMIN_SECTIONS.players.map(s => `#/admin/players/${s.key}`),
      ...ADMIN_SECTIONS.comms.map(s => `#/admin/comms/${s.key}`),
      ...ADMIN_SECTIONS.analysis.map(s => `#/admin/analysis/${s.key}`),
    ];
    for (const hash of canonical) expect(adminHash(parseAdminHash(hash))).toBe(hash);
  });

  it('구역이 없거나 틀린 해시는 그 탭의 기본 구역으로 모인다', () => {
    expect(adminHash(parseAdminHash('#/admin/players'))).toBe('#/admin/players/roster');
    expect(adminHash(parseAdminHash('#/admin/players/nope'))).toBe('#/admin/players/roster');
    expect(adminHash(parseAdminHash('#/admin/players/mail'))).toBe('#/admin/players/roster');
    expect(adminHash(parseAdminHash('#/admin/comms'))).toBe('#/admin/comms/letters');
    expect(adminHash(parseAdminHash('#/admin/analysis/'))).toBe('#/admin/analysis/economy');
  });

  it('모르는 해시와 관리자 밖 해시는 개요가 된다', () => {
    for (const hash of ['', '#', '#/admin', '#/admin/', '#/admin/nope', '#/admin/users', '#/admin/fish', '#/other/live']) {
      expect(adminHash(parseAdminHash(hash))).toBe('#/admin/overview');
    }
  });

  it('탭을 누르면 그 탭의 기본 화면으로 간다', () => {
    expect(ADMIN_TABS.map(t => adminHash(adminRouteOf(t.key)))).toEqual([
      '#/admin/overview', '#/admin/live', '#/admin/players/roster', '#/admin/comms/letters',
      '#/admin/analysis/economy', '#/admin/balance', '#/admin/ops',
    ]);
  });

  it('탭은 일곱 개이고 이름이 정해져 있다', () => {
    expect(ADMIN_TABS.map(t => t.label)).toEqual(['개요', '실시간', '플레이어', '소통', '경제·진행', '밸런스', '운영']);
  });
});
