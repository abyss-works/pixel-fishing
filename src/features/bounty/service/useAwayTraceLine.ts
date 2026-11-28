import { useState } from 'react';
import { useNow } from '../../gameplay/service/useGameTime';
import { selectAwayTraceLine } from '../model/trace';
import { useBounty } from './useBounty';

/** 방치 결과 카드의 흔적 줄 — 남은 시간은 카드를 띄운 시각(마운트 시점의 게임 시계)에 고정한다 */
export function useAwayTraceLine(atSea: boolean): { leftMins: number } | null {
  const { snap } = useBounty();
  const [shownAtMs] = useState(Date.parse(useNow()));
  return selectAwayTraceLine(snap, atSea, shownAtMs);
}
