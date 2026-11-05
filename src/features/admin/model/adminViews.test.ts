import { describe, expect, it } from 'vitest';
import type {
  AdminEconomyRow, AdminEventRow, AdminSpamFlagRow, AdminUserRow,
} from './types';
import {
  adminIdentityLookup, adminNumber, isDormantGuest, splitDormantGuests, adminUserLabel, filterAdminUsers, shortUid, selectAdminUserDetail, selectAntiAbuseRows,
  selectEconomyMetrics, selectRiskSignals,
  selectProgressionDashboard,
} from './adminViews';

const user = (overrides: Partial<AdminUserRow> = {}): AdminUserRow => ({
  user_id: 'user-1', email: null, nickname: null, is_anonymous: true, signed_up_at: null,
  last_sign_in_at: null, gold: 10, fame: 0, boat: 0, rod: 1,
  location_kind: null, location_id: null, visited: [], restricted: false,
  save_version: 8, last_action_at: null, last_session_at: null, total_session_sec: 0, ...overrides,
});

describe('관리자 화면 파생 데이터', () => {
  it('위험 신호 수를 센다', () => {
    const metrics = selectRiskSignals(
      [user({ restricted: true }), user({ user_id: 'user-2' })],
      [{ user_id: 'user-1', catches_7d: 20, fast_gap_7d: 2, perfect_pct: null, perfect_pct_global: null },
       { user_id: 'user-2', catches_7d: 20, fast_gap_7d: 0, perfect_pct: null, perfect_pct_global: null }],
    );
    expect(metrics).toEqual({ restrictedCount: 1, spamUsers: 1, riskTotal: 2 });
  });

  it('진행 대시보드에서 분포·방문·다음 배 명성 부족을 만든다', () => {
    const data = selectProgressionDashboard([
      user({ boat: 0, fame: 0, visited: ['village'] }),
      user({ user_id: 'user-2', boat: 1, fame: 100, rod: 3, visited: ['world'] }),
    ]);

    expect(data.boatHist.values[0]).toBe(1);
    expect(data.boatHist.values[1]).toBe(1);
    expect(data.rodHist).toMatchObject({ values: [1, 0, 1], labels: ['1', '2', '3'], min: 1 });
    expect(data.regionReach.find(row => row.id === 'village')?.users).toBe(1);
    expect(data.regionReach.find(row => row.id === 'village')?.sharePercent).toBe(50);
    expect(data.stalled[0]).toMatchObject({ user: expect.objectContaining({ user_id: 'user-2' }) });
  });

  it('이상탐지 목록과 경제 요약을 만든다', () => {
    const flags: AdminSpamFlagRow[] = [
      { user_id: 'user-1', catches_7d: 30, fast_gap_7d: 3, perfect_pct: 80, perfect_pct_global: 10 },
      { user_id: 'user-2', catches_7d: 10, fast_gap_7d: 0, perfect_pct: 95, perfect_pct_global: 10 },
    ];
    const economy: AdminEconomyRow[] = [{
      day: '2026-10-13', sells: 1, sell_gold: 100, coupon_gold: 10, mail_gold: 0,
      rod_cost: 20, boat_cost: 30, bait_cost: 5,
    }];
    const abuse = selectAntiAbuseRows([user({ restricted: true })], flags);
    const metrics = selectEconomyMetrics([user({ gold: 80 }), user({ user_id: 'user-2', gold: '20' })], economy);

    expect(abuse.spamUsers.map(row => row.user_id)).toEqual(['user-1']);
    expect(abuse.perfectOutliers.map(row => row.user_id)).toEqual(['user-1']);
    expect(abuse.restricted).toHaveLength(1);
    expect(metrics).toMatchObject({ goldSum: 100, inflowTotal: 110, outflowTotal: 55 });
  });

  it('검색과 사용자 감사 자료를 데이터 함수로 만든다', () => {
    const users = [user({ email: 'angler@example.test' }), user({ user_id: 'user-2', email: null })];
    const events: AdminEventRow[] = [
      { id: 1, user_id: 'user-1', type: 'catch', payload: {}, created_at: '2026-10-13T00:00:00.000Z' },
      { id: 2, user_id: 'user-1', type: 'sell', payload: {}, created_at: '2026-10-13T00:00:00.500Z' },
      { id: 3, user_id: 'user-1', type: 'catch', payload: {}, created_at: '2026-10-13T00:00:01.000Z' },
    ];
    const flags: AdminSpamFlagRow[] = [
      { user_id: 'user-2', catches_7d: 1, fast_gap_7d: 0, perfect_pct: 0, perfect_pct_global: 0 },
      { user_id: 'user-1', catches_7d: 2, fast_gap_7d: 1, perfect_pct: 50, perfect_pct_global: 0 },
    ];

    expect(filterAdminUsers(users, 'ANGLER')).toEqual([users[0]]);
    const named = [...users, user({ user_id: 'user-3', nickname: '바다낚시꾼' })];
    expect(filterAdminUsers(named, '낚시').map(row => row.user_id)).toEqual(['user-3']);
    expect(filterAdminUsers(users, 'user-2')).toEqual([users[1]]);
    const detail = selectAdminUserDetail('user-1', events, flags);
    expect(detail.byType).toEqual([['catch', 2], ['sell', 1]]);
    expect([...detail.fastGaps]).toEqual([2]);
    expect(detail.flag).toEqual(flags[1]);
    expect(adminNumber(null)).toBeNaN();
  });
});

describe('계정 식별 표기', () => {
  it('닉네임(이메일)으로 적는다. 게스트는 이메일 대신 게스트, 닉네임이 없으면 이름 없음이다', () => {
    expect(adminUserLabel(user({ nickname: '갈치', email: 'galchi@example.com', is_anonymous: false }))).toBe('갈치(galchi@example.com)');
    expect(adminUserLabel(user({ nickname: '갈치', is_anonymous: true }))).toBe('갈치(게스트)');
    expect(adminUserLabel(user({ email: 'galchi@example.com', is_anonymous: false }))).toBe('이름 없음(galchi@example.com)');
    expect(adminUserLabel(user({ is_anonymous: null }))).toBe('이름 없음(—)');
  });

  it('짧은 uid는 앞 8자리다', () => {
    expect(shortUid('abcdef01-2345-4678-9abc-def012345678')).toBe('abcdef01');
  });

  it('명부에서 uid의 식별 정보를 대소문자 구분 없이 찾고, 명부에 없으면 uid만 가진 식별 정보를 준다', () => {
    const known = user({ user_id: 'ABCDEF01-0000', nickname: '갈치', email: 'galchi@example.com', is_anonymous: false });
    const lookup = adminIdentityLookup([known]);
    expect(lookup('abcdef01-0000')).toBe(known);
    expect(lookup('ffff0000-0000')).toEqual({ user_id: 'ffff0000-0000', nickname: null, email: null, is_anonymous: null });
  });
});

describe('휴면 게스트', () => {
  it('진행이 없는 게스트만 휴면이다: 저장이 없거나 골드와 명성이 모두 0', () => {
    expect(isDormantGuest(user({ gold: null, fame: null, save_version: null }))).toBe(true);
    expect(isDormantGuest(user({ gold: 0, fame: 0 }))).toBe(true);
    expect(isDormantGuest(user({ gold: '0', fame: '0' }))).toBe(true);
    expect(isDormantGuest(user({ gold: 10, fame: 0 }))).toBe(false);
    expect(isDormantGuest(user({ gold: 0, fame: 3 }))).toBe(false);
  });

  it('계정 유저와 제재된 게스트는 진행이 없어도 휴면이 아니다', () => {
    expect(isDormantGuest(user({ is_anonymous: false, gold: 0, fame: 0 }))).toBe(false);
    expect(isDormantGuest(user({ gold: 0, fame: 0, restricted: true }))).toBe(false);
  });

  it('명부를 활동 계정과 휴면 게스트로 나누고 순서를 지킨다', () => {
    const rows = [
      user({ user_id: 'a' }),
      user({ user_id: 'b', gold: 0, fame: 0 }),
      user({ user_id: 'c', is_anonymous: false, gold: 0, fame: 0 }),
      user({ user_id: 'd', gold: null, fame: null, save_version: null }),
    ];
    const { active, dormant } = splitDormantGuests(rows);
    expect(active.map(r => r.user_id)).toEqual(['a', 'c']);
    expect(dormant.map(r => r.user_id)).toEqual(['b', 'd']);
  });
});
