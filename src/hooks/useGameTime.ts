import { useEffect, useState } from 'react';
import { useTimeOverride } from '../admin/timeOverride';
import { dayPhase, formatGameClock, darkness } from '../game/time';

// 게임 시간 훅 — UI가 "지금 몇 시·낮밤·어두움"을 아는 단일 출처.
//
// 운영(서버 권위)은 catch 판정이 서버 시각이라 클라도 **실제 벽시계**를 보여준다.
// 로컬 dev는 관리자 콘솔 시간대 설정(timeOverride)이 catch 판정을 바꾸므로, UI도 그 값을
// 따라야 [밤으로] 눌렀을 때 화면이 어두워진다. 없으면 실제 시계로 폴백.
//
// timeOverride는 useTimeOverride(useSyncExternalStore)로 구독 — 콘솔 클릭 즉시 반영.
// 실제 시계 모드에선 10초 주기로 게임시가 흐른다(표시 갱신, 판정과 무관).

/** 지금 게임 시각 ISO — 표시용. 오버라이드/실제 시계. */
export function useNow(): string {
  const override = useTimeOverride();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (override) return; // 고정 모드 — 갱신 불필요
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, [override]);
  return override ?? new Date().toISOString();
}

/** UI 표시 묶음 — 시계·낮밤·어둠(0~1). */
export function useGameTime(): {
  clock: string; phase: 'day' | 'night'; dark: number;
} {
  const now = useNow();
  return {
    clock: formatGameClock(now),
    phase: dayPhase(now),
    dark: darkness(now),
  };
}
