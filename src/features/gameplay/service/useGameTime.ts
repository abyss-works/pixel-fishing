import { useEffect, useState } from 'react';
import { usePhaseOverride, useTimeOverride } from './timeOverride';
import { dayPhase, formatGameClock, darkness } from '../../../game/rules/time';

// 게임 시간 훅 — UI가 "지금 몇 시·낮밤·어두움"을 아는 단일 출처.
//
// 운영(서버 권위)은 catch 판정이 서버 시각이라 클라도 실제 벽시계를 보여준다.
// 로컬 dev는 분 단위 시간 재정의(timeOverride)가, 프리뷰·로컬 dev는 낮/밤 강제 전환(phaseOverride)이
// catch 판정과 화면 연출을 함께 바꾼다. 없으면 실제 시계로 폴백.

/** 지금 게임 시각 ISO — 표시용. 오버라이드/실제 시계. */
export function useNow(): string {
  const override = useTimeOverride();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (override) return; // 고정 모드 — 갱신 불필요
    const id = setInterval(() => setTick(t => t + 1), 5_000);
    return () => clearInterval(id);
  }, [override]);
  return override ?? new Date().toISOString();
}

/** UI 표시 묶음 — 시계·낮밤·어둠(0~1). */
export function useGameTime(): {
  clock: string; phase: 'day' | 'night'; dark: number;
} {
  const now = useNow();
  const phaseOverride = usePhaseOverride();
  const phase = phaseOverride ?? dayPhase(now);
  const dark = phaseOverride === 'night' ? 1 : phaseOverride === 'day' ? 0 : darkness(now);
  return {
    clock: formatGameClock(now),
    phase,
    dark,
  };
}
