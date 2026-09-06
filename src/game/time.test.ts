// 낮/밤 시간대 — 순수 파생 검증
import { describe, it, expect } from 'vitest';
import { isNight, dayPhase, NIGHT_MIN, DAY_START_MIN } from './time';

const iso = (min: number): string => {
  // 분(min)만 바꾼 ISO — 2026-09-06T00:{min}:00Z
  const mm = String(min).padStart(2, '0');
  return `2026-09-06T00:${mm}:00.000Z`;
};

describe('dayPhase — 하루 1시간, 정각=자정, 밤 20분', () => {
  it('밤은 [0, NIGHT_MIN) — 정각부터 20분', () => {
    for (let m = 0; m < NIGHT_MIN; m++) {
      expect(isNight(iso(m)), `분 ${m}`).toBe(true);
      expect(dayPhase(iso(m))).toBe('night');
    }
  });
  it('낮은 [NIGHT_MIN, 60) — 20분부터 다음 정각 직전', () => {
    for (let m = DAY_START_MIN; m < 60; m++) {
      expect(isNight(iso(m)), `분 ${m}`).toBe(false);
      expect(dayPhase(iso(m))).toBe('day');
    }
  });
  it('경계: 19분=밤, 20분=낮 (전환 지점)', () => {
    expect(dayPhase(iso(NIGHT_MIN - 1))).toBe('night');
    expect(dayPhase(iso(DAY_START_MIN))).toBe('day');
  });
  it('시·일·타임존 무관 — 분만 본다 (UTC=로컬 분)', () => {
    expect(dayPhase('2026-01-01T13:05:00Z')).toBe('night');
    expect(dayPhase('2026-12-31T23:40:00Z')).toBe('day');
  });
  it('손상 시각은 낮으로 — 캐치를 막지 않는다', () => {
    expect(isNight('not-a-date')).toBe(false);
    expect(dayPhase('')).toBe('day');
  });
});
