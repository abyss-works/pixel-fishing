// 대시보드 순수 유틸 — 날짜 축·포맷·통계 변환의 계약. 이 값들이 어긋나면 모든 탭 차트가
// 같은 방식으로 어긋난다 — 그래서 뷰(Row) 없이 검증할 수 있는 순수 함수로만 구성했다.
import { describe, it, expect, vi } from 'vitest';
import {
  todayKST, lastNDays, fmtNum, fmtPct, fmtDT,
  fillSeries, percentile, sumLast, eventSummary,
} from './metrics';

describe('날짜 축', () => {
  it('todayKST — UTC 자정 직후에도 KST 오늘을 가리킨다', () => {
    // 2026-08-27T15:00Z = KST 2026-08-28 00:00 — 경계에서 하루가 바뀌는 것이 핵심
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T15:00:00.000Z'));
    try { expect(todayKST()).toBe('2026-08-28'); } finally { vi.useRealTimers(); }
  });

  it('lastNDays(7) — 오름차순, 마지막이 오늘', () => {
    const days = lastNDays(7);
    expect(days).toHaveLength(7);
    expect(days[0] < days[6]).toBe(true);
    expect(days[6]).toBe(todayKST());
  });
});

describe('포맷', () => {
  it('fmtNum — 억/만 축약과 정수 콤마', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(950)).toBe('950');
    expect(fmtNum(12_340)).toBe('1.2만');
    expect(fmtNum(100_000_000)).toBe('1억');
    expect(fmtNum(234_500_000)).toBe('2.3억');
    expect(fmtNum(NaN)).toBe('—');
  });

  it('fmtPct / fmtDT', () => {
    expect(fmtPct(33.333)).toBe('33.3%');
    expect(fmtPct(null)).toBe('—');
    expect(fmtDT(null)).toBe('—');
    expect(fmtDT('not-a-date')).toBe('—');
    expect(fmtDT('2026-08-27T15:30:00.000Z')).toMatch(/^08-28 00:30$/); // KST 변환
  });
});

describe('시계열 정렬', () => {
  it('fillSeries — 없는 날은 0으로, 있는 날은 값으로 채운다', () => {
    const days = lastNDays(3);
    const rows = [{ day: days[0], dau: 2 }, { day: days[2], dau: 5 }];
    expect(fillSeries(rows, days, r => r.day, r => r.dau)).toEqual([2, 0, 5]);
  });

  it('sumLast — 최근 n일만 합산한다', () => {
    expect(sumLast([1, 2, 3, 4, 5], 2)).toBe(9);
    expect(sumLast([], 3)).toBe(0);
  });
});

describe('통계', () => {
  it('percentile — "하위 p% 지점의 값" (선형 보간 아님, 상한 칸 채택)', () => {
    const sorted = [10, 20, 30, 40];
    expect(percentile(sorted, 25)).toBe(10);   // ceil(0.25*4)-1 = 0
    expect(percentile(sorted, 50)).toBe(20);   // ceil(2)-1 = 1
    expect(percentile(sorted, 75)).toBe(30);
    expect(percentile(sorted, 100)).toBe(40);  // 최댓값 그 자체
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });
});

describe('eventSummary — 리듀서 payload를 사람 문장으로', () => {
  it('catch — 어종·판정·크기·수역·미끼·NEW 순서 고정', () => {
    expect(eventSummary('catch', {
      fishId: 'carp', form: 'variant', judgment: 'perfect',
      size: 21.5, spot: 'pond', bait: 'bait-rare', isNew: true,
    })).toBe('carp(변이) · PERFECT · 21.5cm · @pond · 미끼:bait-rare · NEW');
  });

  it('경제 액션 — 유입은 +, 지출은 −로 읽힌다', () => {
    expect(eventSummary('sell', { gold: 1200, count: 3 })).toBe('3마리 +1,200G');
    expect(eventSummary('upgradeRod', { toLevel: 5, cost: 850 })).toBe('Lv5 −850G');
    expect(eventSummary('buyBait', { bait: 'bait-rare', count: 10, cost: 500 }))
      .toBe('bait-rare ×10 −500G');
    expect(eventSummary('import', { gold: 2_340_000_000, fame: 100_000_000 }))
      .toBe('골드 23.4억 · 명성 1억');
  });

  it('알 수 없는 타입은 빈 요약 — 무음이 아니라 타입명은 피드에 이미 보인다', () => {
    expect(eventSummary('futureThing', null)).toBe('');
  });
});
