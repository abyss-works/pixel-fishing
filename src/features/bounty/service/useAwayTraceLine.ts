import { useState } from 'react';
import { useTimeOverride } from '../../gameplay/service/timeOverride';
import { selectAwayTraceLine } from '../model/trace';
import { useBounty } from './useBounty';

/** 방치 결과 카드의 흔적 줄 — 남은 시간은 카드를 띄운 시각(마운트 시점의 게임 시계)에 고정한다 */
export function useAwayTraceLine(atSea: boolean): { leftMins: number } | null {
  const { snap } = useBounty();
  const override = useTimeOverride();
  // 시각 재정의(개발용)가 없으면 실제 시계. 구독 없이 첫 값만 쓴다
  const [shownAtMs] = useState(() => Date.parse(override ?? new Date().toISOString()));
  return selectAwayTraceLine(snap, atSea, shownAtMs);
}
