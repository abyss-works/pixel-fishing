import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { BalanceLive } from '../../../../features/admin/model/types';

const state = vi.hoisted(() => ({ data: null as unknown, loading: false }));
vi.mock('../../../../features/admin/service/useBalanceLive', () => ({
  BALANCE_LIVE_DAYS: 7,
  useBalanceLive: () => ({ data: state.data, loading: state.loading, error: null, refresh: () => {} }),
}));

import BalanceLiveSection from './BalanceLiveSection';

const sample: BalanceLive = {
  judgment: [{ judgment: 'auto', catches: 1200, pct: 99.2 }],
  spots: [{ spot: 'sea', catches: 900, users: 3 }, { spot: null, catches: 4, users: 1 }],
  dexBuckets: [{ fromSpecies: 30, users: 2 }],
  boats: [{ boat: 0, users: 5 }, { boat: 6, users: 2 }],
  rodBuckets: [{ fromLevel: 16, users: 2 }],
  gold: { p25: 0, p50: 120, p75: 1209, p90: 980553, max: 6061422 },
  goldFlow: { sellGold: 6165488, couponGold: 0, rodCost: 5873757, boatCost: 300300, baitCost: 0 },
  dau: [{ day: '2026-10-18', dau: 13 }],
  churn: [{ boat: 6, users: 1, avgFame: 202708, avgRod: 19 }],
  bountyFunnel: { namedAccepts: 2, tickets: 1, duelsWon: 1, duelsLost: 0, generalAccepts: 6, delivered: 1 },
  anomalies: { fastGaps: 1, fastUsers: 1, perfectPct: null },
  fameGateStuck: [{ nextBoat: 5, users: 2 }],
};

afterEach(() => { cleanup(); state.data = null; state.loading = false; });

describe('밸런스 라이브 지표 구역', () => {
  it('조회 결과를 해역·배 이름과 함께 표로 옮긴다', () => {
    state.data = sample;
    render(<BalanceLiveSection granted />);
    expect(screen.getByText('태평양')).toBeInTheDocument();
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
    expect(screen.getByText('6,165,488G')).toBeInTheDocument();
    expect(screen.getByText('—', { selector: 'span' })).toBeInTheDocument(); // PERFECT 비율 빈 값
  });

  it('관리자 세션이 아니면 연결 안내를 보인다', () => {
    render(<BalanceLiveSection granted={false} />);
    expect(screen.getByText('운영 DB에 연결하면 실측 지표가 채워져요.')).toBeInTheDocument();
  });
});
