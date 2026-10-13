import { describe, expect, it } from 'vitest';
import type {
  AdminEconomyRow, AdminEventRow, AdminImportLogRow,
  AdminDexMismatchRow, AdminSpamFlagRow, AdminUserRow,
} from './types';
import {
  adminNumber, filterAdminUsers, selectAdminUserDetail, selectAntiAbuseRows,
  selectEconomyMetrics, selectLiveDashboard, selectOverviewMetrics,
  selectProgressionDashboard,
} from './adminViews';

const user = (overrides: Partial<AdminUserRow> = {}): AdminUserRow => ({
  user_id: 'user-1', email: null, is_anonymous: true, signed_up_at: null,
  last_sign_in_at: null, gold: 10, fame: 0, boat: 0, rod: 1,
  location_kind: null, location_id: null, visited: [], restricted: false,
  save_version: 8, last_action_at: null, ...overrides,
});

describe('관리자 화면 파생 데이터', () => {
  it('개요 합계와 위험 수치를 계산한다', () => {
    const metrics = selectOverviewMetrics(
      [user({ gold: '12', fame: 4, restricted: true }), user({ user_id: 'user-2', gold: 8 })],
      [{ user_id: 'user-1', catches_7d: 20, fast_gap_7d: 2, perfect_pct: null, perfect_pct_global: null }],
      [{ id: 1, user_id: 'user-2', created_at: '', gold: 0, fame: 0 }],
      Array.from({ length: 8 }, (_, index) => ({
        day: `d${index}`, catches: index + 1, perfect: 0, with_bait: 0, avg_size: null,
      })),
    );

    expect(metrics).toMatchObject({
      restrictedCount: 1, spamUsers: 1, riskTotal: 3, goldTotal: 20, fameTotal: 4, catch7d: 28,
    });
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

  it('접속 신선도와 위치 분포를 계산한다', () => {
    const now = Date.parse('2026-10-13T00:10:00.000Z');
    const data = selectLiveDashboard([
      user({ last_action_at: '2026-10-13T00:05:00.000Z', location_kind: 'base', location_id: 'harbor' }),
      user({ user_id: 'user-2', last_action_at: 'invalid' }),
    ], now);

    expect(data.buckets.online.map(row => row.user_id)).toEqual(['user-1']);
    expect(data.buckets.recent1h).toHaveLength(1);
    expect(data.whereHist.values.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(data.regionLabel(user({ location_kind: 'base', location_id: 'harbor' }))).toBeTruthy();
  });

  it('이상탐지 목록과 경제 요약을 만든다', () => {
    const flags: AdminSpamFlagRow[] = [
      { user_id: 'user-1', catches_7d: 30, fast_gap_7d: 3, perfect_pct: 80, perfect_pct_global: 10 },
      { user_id: 'user-2', catches_7d: 10, fast_gap_7d: 0, perfect_pct: 95, perfect_pct_global: 10 },
    ];
    const mismatch: AdminDexMismatchRow[] = [
      { user_id: 'user-1', fish_id: 'a', form: 'normal', dex_count: 3, event_count: 1, missing_events: 2 },
      { user_id: 'user-1', fish_id: 'b', form: 'normal', dex_count: 4, event_count: 1, missing_events: 3 },
    ];
    const economy: AdminEconomyRow[] = [{
      day: '2026-10-13', sells: 1, sell_gold: 100, coupon_gold: 10,
      rod_cost: 20, boat_cost: 30, bait_cost: 5,
    }];
    const abuse = selectAntiAbuseRows([user({ restricted: true })], flags, mismatch);
    const metrics = selectEconomyMetrics([user({ gold: 80 }), user({ user_id: 'user-2', gold: '20' })], economy);

    expect(abuse.spamUsers.map(row => row.user_id)).toEqual(['user-1']);
    expect(abuse.perfectOutliers.map(row => row.user_id)).toEqual(['user-1']);
    expect(abuse.topMismatch[0].missing_events).toBe(3);
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
    const mismatch: AdminDexMismatchRow[] = [
      { user_id: 'user-1', fish_id: 'a', form: 'normal', dex_count: 2, event_count: 1, missing_events: 1 },
      { user_id: 'user-2', fish_id: 'b', form: 'normal', dex_count: 2, event_count: 1, missing_events: 1 },
    ];
    const imports: AdminImportLogRow[] = [
      { id: 1, user_id: 'user-1', created_at: '', gold: 1, fame: 2 },
      { id: 2, user_id: 'user-2', created_at: '', gold: 1, fame: 2 },
    ];

    expect(filterAdminUsers(users, 'ANGLER')).toEqual([users[0]]);
    const detail = selectAdminUserDetail('user-1', events, mismatch, [], imports);
    expect(detail.byType).toEqual([['catch', 2], ['sell', 1]]);
    expect([...detail.fastGaps]).toEqual([2]);
    expect(detail.mismatch).toEqual([mismatch[0]]);
    expect(detail.imports).toEqual([imports[0]]);
    expect(adminNumber(null)).toBeNaN();
  });
});
