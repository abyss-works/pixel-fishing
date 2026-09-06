// 낮/밤 시간대 — 순수 파생 검증
// 모델: 하루 60분(게임 24시). 낮 = 게임 4~20시(분 10~50) · 밤 = 게임 20시~다음 4시(분 50~60 ∪ 0~10).
import { describe, it, expect } from 'vitest';
import {
  isNight, dayPhase, DAY_START_MIN, NIGHT_START_MIN, gameHour, formatGameClock, darkness,
} from './time';

const iso = (min: number): string => {
  const mm = String(min).padStart(2, '0');
  return `2026-09-06T00:${mm}:00.000Z`;
};

describe('dayPhase — 낮 4~20시, 밤 20시~다음 4시 (밤이 자정을 감싼다)', () => {
  it('밤 = [NIGHT_START_MIN,60) ∪ [0,DAY_START_MIN) — 20시~4시', () => {
    // 자정~새벽 4시
    for (let m = 0; m < DAY_START_MIN; m++) {
      expect(isNight(iso(m)), `분 ${m}`).toBe(true);
      expect(dayPhase(iso(m))).toBe('night');
    }
    // 저녁 20시~자정 직전
    for (let m = NIGHT_START_MIN; m < 60; m++) {
      expect(isNight(iso(m)), `분 ${m}`).toBe(true);
      expect(dayPhase(iso(m))).toBe('night');
    }
  });
  it('낮 = [DAY_START_MIN, NIGHT_START_MIN) — 4시~20시', () => {
    for (let m = DAY_START_MIN; m < NIGHT_START_MIN; m++) {
      expect(isNight(iso(m)), `분 ${m}`).toBe(false);
      expect(dayPhase(iso(m))).toBe('day');
    }
  });
  it('경계: 분9=밤·10=낮(해 뜸), 분49=낮·50=밤(해 짐)', () => {
    expect(dayPhase(iso(DAY_START_MIN - 1))).toBe('night');
    expect(dayPhase(iso(DAY_START_MIN))).toBe('day');
    expect(dayPhase(iso(NIGHT_START_MIN - 1))).toBe('day');
    expect(dayPhase(iso(NIGHT_START_MIN))).toBe('night');
  });
  it('시·일·타임존 무관 — 분만 본다 (UTC=로컬 분)', () => {
    expect(dayPhase('2026-01-01T13:05:00Z')).toBe('night');  // 분 5 < 10 = 밤(새벽)
    expect(dayPhase('2026-12-31T23:40:00Z')).toBe('day');    // 분 40 ∈ [10,50) = 낮
    expect(dayPhase('2026-12-31T23:55:00Z')).toBe('night');  // 분 55 ≥ 50 = 밤(저녁)
  });
  it('손상 시각은 낮으로 — 캐치를 막지 않는다', () => {
    expect(isNight('not-a-date')).toBe(false);
    expect(dayPhase('')).toBe('day');
  });
});

describe('UI 파생 — 게임 시각·어둠 강도', () => {
  it('1실제분 = 0.4게임시 — 분10=게임4시, 분50=게임20시', () => {
    expect(gameHour(iso(0))).toBeCloseTo(0);   // 정각 = 자정
    expect(gameHour(iso(DAY_START_MIN))).toBeCloseTo(4);    // 해 뜸
    expect(gameHour(iso(NIGHT_START_MIN))).toBeCloseTo(20); // 해 짐
    expect(gameHour(iso(59))).toBeCloseTo(23.6);
  });

  it('formatGameClock — HH:MM', () => {
    expect(formatGameClock(iso(0))).toBe('00:00');
    expect(formatGameClock(iso(10))).toBe('04:00');  // 낮 시작
    expect(formatGameClock(iso(50))).toBe('20:00');  // 밤 시작
    expect(formatGameClock(iso(59))).toBe('23:36');
    expect(formatGameClock('bad')).toBe('--:--');
  });

  it('어둠 — 낮 0, 해 질 무렵부터 서서히 어두워지고 해 뜰 무렵 밝아진다', () => {
    // 낮(4~20시): 항상 0
    expect(darkness(iso(20))).toBe(0);
    expect(darkness(iso(40))).toBe(0);
    // 저녁(20시~자정): 0 → 자정 직전 ~0.9
    expect(darkness(iso(NIGHT_START_MIN))).toBe(0);
    expect(darkness(iso(55))).toBe(0.5);
    expect(darkness(iso(59))).toBeCloseTo(0.9);
    // 자정~새벽 4시: 0.9 → 해 뜸 0 (점프 없이 연속)
    expect(darkness(iso(0))).toBe(1);   // 자정 = 최대
    expect(darkness(iso(5))).toBeCloseTo(0.5);
    expect(darkness(iso(DAY_START_MIN - 1))).toBeCloseTo(1 / DAY_START_MIN);
    expect(darkness(iso(DAY_START_MIN))).toBe(0);
    expect(darkness('bad')).toBe(0);
  });
});
