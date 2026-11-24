// 개발 도구 시간 표시 헬퍼 — 표현 계층이 game/rules/time 값 심볼을 직접 import하지 않게 중계한다.
import {
  CLOCK_STEP_SEC,
  DAY_CYCLE_MIN,
  DAY_CYCLE_SEC,
  DAY_START_MIN,
  NIGHT_START_MIN,
  cycleStep,
  dayPhase,
  formatGameClock,
} from '../../../game/rules/time';
import type { DayPhase } from '../../../game/rules/time';

export const TIME_CYCLE = {
  cycleMin: DAY_CYCLE_MIN,
  cycleSec: DAY_CYCLE_SEC,
  stepSec: CLOCK_STEP_SEC,
  totalSteps: DAY_CYCLE_SEC / CLOCK_STEP_SEC,
  dayStartMin: DAY_START_MIN,
  nightStartMin: NIGHT_START_MIN,
} as const;

export const timeStepOf = (iso: string): number => cycleStep(iso) ?? 0;
export const timePhaseOf = (iso: string): DayPhase => dayPhase(iso);
export const timeClockOf = (iso: string): string => formatGameClock(iso);
