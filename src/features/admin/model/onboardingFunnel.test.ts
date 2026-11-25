import { describe, expect, it } from 'vitest';
import type { AdminOnboardingFunnel } from './types';
import {
  formatDurationMinutes,
  formatRatioPct,
  selectOnboardingFunnelView,
} from './onboardingFunnel';

const sample = (over: Partial<AdminOnboardingFunnel> = {}): AdminOnboardingFunnel => ({
  eventsWindowDays: 7,
  conversion: {
    totalUsers: 100,
    guestUsers: 60,
    googleLinkedUsers: 40,
    conversionRate: 0.4,
    medianMinutes: 25,
    p90Minutes: 180,
    buckets: [
      { bucket: 'under_10m', count: 10, pct: 25 },
      { bucket: '10m_to_1h', count: 12, pct: 30 },
      { bucket: '1h_to_24h', count: 8, pct: 20 },
      { bucket: '1d_to_7d', count: 6, pct: 15 },
      { bucket: 'over_7d', count: 4, pct: 10 },
    ],
  },
  tutorials: {
    totalUsers: 100,
    totalWithSave: 92,
    stages: [
      { id: 'village', completed: 80, rate: 0.8, dropOffFromPrev: 0, stepRate: null },
      { id: 'sea', completed: 60, rate: 0.6, dropOffFromPrev: 20, stepRate: 0.75 },
      { id: 'bounty-quests', completed: 45, rate: 0.45, dropOffFromPrev: 15, stepRate: 0.75 },
      { id: 'bounty-named', completed: 30, rate: 0.3, dropOffFromPrev: 15, stepRate: 0.6667 },
    ],
  },
  steps: [
    { id: 'first_visit', users: 100, rate: 1, stepRate: null, basis: 'lifetime' },
    { id: 'tutorial_complete', users: 30, rate: 0.3, stepRate: 0.3, basis: 'lifetime' },
    { id: 'first_catch', users: 75, rate: 0.75, stepRate: 2.5, basis: 'lifetime' },
    { id: 'first_sell', users: 50, rate: 0.5, stepRate: 0.6667, basis: 'hybrid_7d' },
    { id: 'first_harbor', users: 40, rate: 0.4, stepRate: 0.8, basis: 'lifetime' },
    { id: 'first_upgrade', users: 25, rate: 0.25, stepRate: 0.625, basis: 'lifetime' },
  ],
  ...over,
});

describe('onboardingFunnel 모델', () => {
  it('비율(0~1)과 소요 시간(분)을 사람용 문자열로 바꾼다', () => {
    expect(formatRatioPct(0.4)).toBe('40%');
    expect(formatRatioPct(0.6667)).toBe('66.7%');
    expect(formatRatioPct(null)).toBe('—');

    expect(formatDurationMinutes(null)).toBe('—');
    expect(formatDurationMinutes(25)).toBe('25분');
    expect(formatDurationMinutes(180)).toBe('3시간');
    expect(formatDurationMinutes(2160)).toBe('1.5일');
  });

  it('게스트→구글 전환, 튜토리얼 4단계, 초반 6단계 퍼널과 hybrid_7d 안내를 계산한다', () => {
    const view = selectOnboardingFunnelView(sample());
    expect(view.eventsWindowDays).toBe(7);
    expect(view.conversion.conversionRateText).toBe('40%');
    expect(view.conversion.medianText).toBe('25분');
    expect(view.conversion.p90Text).toBe('3시간');
    expect(view.conversion.buckets.map(b => b.label)).toEqual([
      '10분 미만', '10분~1시간', '1~24시간', '1~7일', '7일 초과',
    ]);

    expect(view.tutorials.stages[0]).toMatchObject({ label: '마을', rateText: '80%', stepRateText: '—' });
    expect(view.tutorials.stages[1]).toMatchObject({ label: '바다', rateText: '60%', stepRateText: '75%', dropOffFromPrev: 20 });

    const sell = view.steps.find(s => s.id === 'first_sell')!;
    expect(sell.label).toBe('첫 판매');
    expect(sell.basis).toBe('hybrid_7d');
    expect(sell.basisLabel).toBe('누적 + 최근 7일 이벤트');
    expect(view.hasHybridSteps).toBe(true);
  });

  it('데이터가 null이면 빈 기본값을 돌려준다', () => {
    const view = selectOnboardingFunnelView(null);
    expect(view.eventsWindowDays).toBe(7);
    expect(view.conversion.conversionRateText).toBe('—');
    expect(view.tutorials.stages).toEqual([]);
    expect(view.steps).toEqual([]);
    expect(view.hasHybridSteps).toBe(false);
  });
});
