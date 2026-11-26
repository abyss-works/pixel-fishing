// 낮/밤 시간대 — 순수 파생 검증
// 모델: 하루 60분(게임 24시), 25초 = 10게임분(시간당 144스텝).
// 낮 = 게임 06:00~22:00(실제 매시 15분~55분 미만, 스텝 36~131)
// 밤 = 게임 22:00~다음 06:00(실제 매시 55분~다음 시 15분 미만, 스텝 132~143 ∪ 0~35)
import { describe, it, expect } from 'vitest';
import {
  DAY_CYCLE_MIN, DAY_CYCLE_SEC, CLOCK_STEP_SEC, DAY_START_MIN, NIGHT_START_MIN,
  NIGHT_PEAK_MIN, NIGHT_HALF_STEPS, NIGHT_TOTAL_STEPS,
  cycleStep, cycleMinute, isNight, dayPhase, gameHour, formatGameClock,
  nightDepthOfStep, nightDepth, darkness,
  gameDayOf, gameDayStartISO,
  gameWeekStartDay, gameWeekStartISO, nextGameWeekResetISO,
} from './time';

const iso = (min: number, sec = 0): string => {
  const mm = String(min).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return `2026-09-06T00:${mm}:${ss}.000Z`;
};

const stepIso = (step: number, offsetSec = 0): string => {
  const totalSec = step * CLOCK_STEP_SEC + offsetSec;
  return iso(Math.floor(totalSec / 60), totalSec % 60);
};

describe('주기 상수 및 144스텝 파생', () => {
  it('상수는 60분/3600초, 25초 스텝, 15분~55분 낮, 05분(02:00) 정점을 갖는다', () => {
    expect(DAY_CYCLE_MIN).toBe(60);
    expect(DAY_CYCLE_SEC).toBe(3600);
    expect(CLOCK_STEP_SEC).toBe(25);
    expect(DAY_START_MIN).toBe(15);
    expect(NIGHT_START_MIN).toBe(55);
    expect(NIGHT_PEAK_MIN).toBe(5);
    expect(NIGHT_HALF_STEPS).toBe(24);
    expect(NIGHT_TOTAL_STEPS).toBe(48);
  });

  it('cycleStep과 cycleMinute는 0..143 스텝과 분 환산값을 돌려주고 손상 시각은 null이다', () => {
    for (let step = 0; step < 144; step++) {
      expect(cycleStep(stepIso(step, 0)), `step ${step} start`).toBe(step);
      expect(cycleStep(stepIso(step, CLOCK_STEP_SEC - 1)), `step ${step} end`).toBe(step);
      expect(cycleMinute(stepIso(step))).toBeCloseTo((step * CLOCK_STEP_SEC) / 60, 12);
    }
    expect(cycleStep('not-a-date')).toBeNull();
    expect(cycleMinute('not-a-date')).toBeNull();
  });
});

describe('dayPhase — 낮 06~22시(15~55분), 밤 22시~다음 06시(55분~15분)', () => {
  it('밤 = 스텝 [132,144) ∪ [0,36) — 22:00~06:00', () => {
    for (let step = 0; step < 36; step++) {
      expect(isNight(stepIso(step)), `스텝 ${step}`).toBe(true);
      expect(dayPhase(stepIso(step))).toBe('night');
    }
    for (let step = 132; step < 144; step++) {
      expect(isNight(stepIso(step)), `스텝 ${step}`).toBe(true);
      expect(dayPhase(stepIso(step))).toBe('night');
    }
  });
  it('낮 = 스텝 [36, 132) — 06:00~22:00', () => {
    for (let step = 36; step < 132; step++) {
      expect(isNight(stepIso(step)), `스텝 ${step}`).toBe(false);
      expect(dayPhase(stepIso(step))).toBe('day');
    }
  });
  it('초 단위 경계: 14:59=밤 · 15:00=낮(해 뜸), 54:59=낮 · 55:00=밤(해 짐)', () => {
    expect(dayPhase(iso(14, 35))).toBe('night');
    expect(dayPhase(iso(14, 59))).toBe('night');
    expect(dayPhase(iso(15, 0))).toBe('day');
    expect(dayPhase(iso(54, 35))).toBe('day');
    expect(dayPhase(iso(54, 59))).toBe('day');
    expect(dayPhase(iso(55, 0))).toBe('night');
  });
  it('시·일·타임존 무관 — UTC 분·초만 본다', () => {
    expect(dayPhase('2026-01-01T13:10:00Z')).toBe('night');  // 분 10 < 15 = 밤(새벽)
    expect(dayPhase('2026-12-31T23:40:00Z')).toBe('day');    // 분 40 ∈ [15,55) = 낮
    expect(dayPhase('2026-12-31T23:55:00Z')).toBe('night');  // 분 55 ≥ 55 = 밤(저녁)
  });
  it('손상 시각은 낮으로 — 캐치를 막지 않는다', () => {
    expect(isNight('not-a-date')).toBe(false);
    expect(dayPhase('')).toBe('day');
  });
});

describe('UI 파생 — 게임 시각·nightDepth·어둠 강도', () => {
  it('gameHour — 25초당 10게임분(144스텝)', () => {
    expect(gameHour(iso(0))).toBeCloseTo(0);                 // 정각 = 00:00
    expect(gameHour(iso(NIGHT_PEAK_MIN))).toBeCloseTo(2);    // 분 5 = 02:00(정점)
    expect(gameHour(iso(DAY_START_MIN))).toBeCloseTo(6);     // 분 15 = 06:00(해 뜸)
    expect(gameHour(iso(NIGHT_START_MIN))).toBeCloseTo(22);  // 분 55 = 22:00(해 짐)
    expect(gameHour(stepIso(143))).toBeCloseTo(143 * 10 / 60, 12);
    expect(gameHour('bad')).toBeNull();
  });

  it('formatGameClock — 144스텝 전체에서 10분 단위 HH:MM이 부동소수점 오차 없이 맞는다', () => {
    for (let step = 0; step < 144; step++) {
      const totalMin = step * 10;
      const expected = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
      expect(formatGameClock(stepIso(step)), `step ${step}`).toBe(expected);
      expect(formatGameClock(stepIso(step, 24)), `step ${step} +24s`).toBe(expected);
    }
    expect(formatGameClock('bad')).toBe('--:--');
  });

  it('nightDepthOfStep — 0..47 대칭 삼각파이고 범위 밖은 0으로 방어한다', () => {
    expect(nightDepthOfStep(0)).toBe(0);
    expect(nightDepthOfStep(12)).toBe(0.5);
    expect(nightDepthOfStep(24)).toBe(1);
    expect(nightDepthOfStep(36)).toBe(0.5);
    expect(nightDepthOfStep(47)).toBeCloseTo(1 / 24, 12);
    for (let k = 1; k < 24; k++) {
      expect(nightDepthOfStep(k)).toBeCloseTo(nightDepthOfStep(48 - k), 12);
    }
    expect(nightDepthOfStep(-1)).toBe(0);
    expect(nightDepthOfStep(48)).toBe(0);
    expect(nightDepthOfStep(99)).toBe(0);
    expect(nightDepthOfStep(Number.NaN)).toBe(0);
  });

  it('nightDepth와 darkness — 낮 0, 22:00(0) → 00:00(0.5) → 02:00(1.0) → 04:00(0.5) → 05:50(1/24)', () => {
    expect(nightDepth(iso(15))).toBe(0);
    expect(nightDepth(iso(35))).toBe(0);
    expect(nightDepth(iso(54, 59))).toBe(0);
    expect(nightDepth(iso(55, 0))).toBe(0);              // 22:00
    expect(nightDepth(iso(0, 0))).toBe(0.5);             // 00:00
    expect(nightDepth(iso(5, 0))).toBe(1);               // 02:00 (최대)
    expect(nightDepth(iso(10, 0))).toBe(0.5);            // 04:00
    expect(nightDepth(iso(14, 35))).toBeCloseTo(1 / 24, 12); // 05:50
    expect(nightDepth('bad')).toBe(0);

    for (let step = 0; step < 144; step++) {
      expect(darkness(stepIso(step)), `step ${step}`).toBe(nightDepth(stepIso(step)));
    }
    expect(darkness('bad')).toBe(0);
  });
});

describe('gameDayOf — KST 04:00 경계의 게임 날짜', () => {
  it('KST 04:00 이전은 전날로 센다', () => {
    // 2026-10-19 03:59:59.999 KST = 2026-10-18T18:59:59.999Z
    expect(gameDayOf('2026-10-18T18:59:59.999Z')).toBe('2026-10-18');
    // 2026-10-19 00:00 KST(자정 직후)도 아직 전날이다
    expect(gameDayOf('2026-10-18T15:00:00.000Z')).toBe('2026-10-18');
  });
  it('KST 04:00 정각부터 당일이다', () => {
    // 2026-10-19 04:00:00 KST = 2026-10-18T19:00:00Z
    expect(gameDayOf('2026-10-18T19:00:00.000Z')).toBe('2026-10-19');
    // 2026-10-19 12:00 KST
    expect(gameDayOf('2026-10-19T03:00:00.000Z')).toBe('2026-10-19');
  });
  it('UTC 날짜가 아니라 KST 체감 날짜를 돌려준다 — UTC 23시는 KST 다음날 08시', () => {
    expect(gameDayOf('2026-10-18T23:00:00.000Z')).toBe('2026-10-19');
  });
});

describe('gameDayStartISO — 게임 날짜가 시작된 순간(그날의 KST 04:00)', () => {
  it('04:00 직전은 전날의 04:00을 돌려준다', () => {
    // 2026-10-19 03:59:59.999 KST → 시작은 2026-10-18 04:00 KST = 2026-10-17T19:00:00Z
    expect(gameDayStartISO('2026-10-18T18:59:59.999Z')).toBe('2026-10-17T19:00:00.000Z');
  });
  it('04:00 정각은 그날의 04:00, 곧 자기 자신이다', () => {
    expect(gameDayStartISO('2026-10-18T19:00:00.000Z')).toBe('2026-10-18T19:00:00.000Z');
  });
  it('낮 시각은 같은 날의 04:00을 돌려준다', () => {
    // 2026-10-19 12:00 KST
    expect(gameDayStartISO('2026-10-19T03:00:00.000Z')).toBe('2026-10-18T19:00:00.000Z');
  });
  it('시작 순간은 게임 날짜가 바뀌는 지점과 정확히 일치한다', () => {
    for (const now of ['2026-10-18T18:59:59.999Z', '2026-10-18T19:00:00.000Z', '2026-10-19T03:00:00.000Z', '2026-10-19T18:59:59.999Z']) {
      const start = gameDayStartISO(now);
      expect(gameDayOf(start)).toBe(gameDayOf(now));
      expect(gameDayOf(new Date(Date.parse(start) - 1).toISOString())).not.toBe(gameDayOf(now));
    }
  });
});

describe('gameWeekStartDay / gameWeekStartISO / nextGameWeekResetISO — 월요일 KST 04:00 주간 경계', () => {
  it('월요일 KST 03:59:59(일요일 18:59:59Z)는 직전 주간에 속한다', () => {
    const prevWeekEnd = '2026-10-18T18:59:59.000Z';
    expect(gameWeekStartDay(prevWeekEnd)).toBe('2026-10-12');
    expect(gameWeekStartISO(prevWeekEnd)).toBe('2026-10-11T19:00:00.000Z');
    expect(nextGameWeekResetISO(prevWeekEnd)).toBe('2026-10-18T19:00:00.000Z');

    const prevWeekLastMs = '2026-10-18T18:59:59.999Z';
    expect(gameWeekStartDay(prevWeekLastMs)).toBe('2026-10-12');
    expect(gameWeekStartISO(prevWeekLastMs)).toBe('2026-10-11T19:00:00.000Z');
    expect(nextGameWeekResetISO(prevWeekLastMs)).toBe('2026-10-18T19:00:00.000Z');
  });

  it('월요일 KST 04:00:00(일요일 19:00:00Z)부터 새 주간이 시작된다', () => {
    const weekStart = '2026-10-18T19:00:00.000Z';
    expect(gameWeekStartDay(weekStart)).toBe('2026-10-19');
    expect(gameWeekStartISO(weekStart)).toBe('2026-10-18T19:00:00.000Z');
    expect(nextGameWeekResetISO(weekStart)).toBe('2026-10-25T19:00:00.000Z');
  });

  it('일요일 KST 23:59:59(일요일 14:59:59Z)는 직전 월요일 KST 04:00과 같은 주간이다', () => {
    const sundayNightKst = '2026-10-25T14:59:59.000Z';
    expect(gameWeekStartDay(sundayNightKst)).toBe('2026-10-19');
    expect(gameWeekStartISO(sundayNightKst)).toBe('2026-10-18T19:00:00.000Z');
    expect(nextGameWeekResetISO(sundayNightKst)).toBe('2026-10-25T19:00:00.000Z');
  });

  it('연도 경계(2025→2026)와 윤년 경계(2024-02-29)를 넘어도 주간 경계가 정확하다', () => {
    // 2026-01-01(목) 12:00 KST → 주 시작은 2025-12-29(월) 04:00 KST, 다음 리셋은 2026-01-05(월) 04:00 KST
    const newYearDay = '2026-01-01T03:00:00.000Z';
    expect(gameWeekStartDay(newYearDay)).toBe('2025-12-29');
    expect(gameWeekStartISO(newYearDay)).toBe('2025-12-28T19:00:00.000Z');
    expect(nextGameWeekResetISO(newYearDay)).toBe('2026-01-04T19:00:00.000Z');

    // 2024-02-29(목, 윤일) 12:00 KST → 주 시작은 2024-02-26(월) 04:00 KST, 다음 리셋은 2024-03-04(월) 04:00 KST
    const leapDay = '2024-02-29T03:00:00.000Z';
    expect(gameWeekStartDay(leapDay)).toBe('2024-02-26');
    expect(gameWeekStartISO(leapDay)).toBe('2024-02-25T19:00:00.000Z');
    expect(nextGameWeekResetISO(leapDay)).toBe('2024-03-03T19:00:00.000Z');

    // 평년 2월 말(2026-03-01 일요일 23:59:59 KST) → 2026-02-23(월) ~ 2026-03-02(월)
    const nonLeapEnd = '2026-03-01T14:59:59.000Z';
    expect(gameWeekStartDay(nonLeapEnd)).toBe('2026-02-23');
    expect(gameWeekStartISO(nonLeapEnd)).toBe('2026-02-22T19:00:00.000Z');
    expect(nextGameWeekResetISO(nonLeapEnd)).toBe('2026-03-01T19:00:00.000Z');
  });

  it('주간 시작/다음 리셋 불변식을 만족한다', () => {
    const samples = [
      '2025-12-28T18:59:59.999Z',
      '2025-12-28T19:00:00.000Z',
      '2026-01-01T03:00:00.000Z',
      '2024-02-29T03:00:00.000Z',
      '2026-10-18T18:59:59.999Z',
      '2026-10-18T19:00:00.000Z',
      '2026-10-21T12:34:56.789Z',
      '2026-10-25T14:59:59.000Z',
    ];
    for (const now of samples) {
      const startDay = gameWeekStartDay(now);
      const startIso = gameWeekStartISO(now);
      const nextIso = nextGameWeekResetISO(now);
      expect(gameDayOf(startIso)).toBe(startDay);
      expect(gameWeekStartDay(startIso)).toBe(startDay);
      expect(gameWeekStartDay(new Date(Date.parse(startIso) - 1).toISOString())).not.toBe(startDay);
      expect(gameWeekStartDay(nextIso)).not.toBe(startDay);
      expect(gameWeekStartISO(nextIso)).toBe(nextIso);
      expect(Date.parse(nextIso) - Date.parse(startIso)).toBe(7 * 86_400_000);
    }
  });
});
