// 개발 도구 시간 표시 헬퍼 — 표현 계층이 game/rules/time 값 심볼을 직접 import하지 않게 중계한다.
import {
  DAY_START_MIN,
  NIGHT_START_MIN,
  dayPhase,
  formatGameClock,
} from '../../../game/rules/time';
import type { DayPhase } from '../../../game/rules/time';

export const TIME_CYCLE = {
  dayStartMin: DAY_START_MIN,
  nightStartMin: NIGHT_START_MIN,
} as const;

export const timePhaseOf = (iso: string): DayPhase => dayPhase(iso);
export const timeClockOf = (iso: string): string => formatGameClock(iso);
