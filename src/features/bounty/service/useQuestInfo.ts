import { useState } from 'react';
import type { GameState } from '../../../game/rules/logic';
import { selectQuestInfo } from '../model/questInfo';
import type { QuestInfoData } from '../model/questInfo';
import { useBounty } from './useBounty';

/** 불러오는 중, 오프라인(스냅샷 없음), 읽음 */
export type QuestInfoStatus = 'loading' | 'offline' | 'ready';

// 현재 의뢰 정보 - 수배판 스냅샷(서버가 진실)에서 수주 중인 의뢰를 모아 창에 준다.
// 흔적 남은 시간용 시계는 창을 연 순간(마운트)에 한 번 찍는다. 창이 열려 있는 동안 남은 분은 갱신하지 않는다.
export function useQuestInfo(game: GameState): QuestInfoData & { status: QuestInfoStatus } {
  const { snap, loaded } = useBounty();
  const [nowMs] = useState(() => Date.now());
  const status: QuestInfoStatus = !loaded ? 'loading' : snap === null ? 'offline' : 'ready';
  return { ...selectQuestInfo({ game, snapshot: snap, nowMs }), status };
}
