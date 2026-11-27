// PiP 미니 모니터가 구독하는 인메모리 실시간 포획·낚시 단계 저장소.
import type { ActionResult } from '../../../game/rules/actions';
import type { FishingPhase } from '../../../game/rules/fishing';
import {
  appendPipCatchBuffer,
  buildPipCatchItem,
  type PipCatchItem,
} from '../model/pipMonitor';

export interface PipLiveState {
  fishingPhase: FishingPhase;
  recentCatches: PipCatchItem[];
}

let state: PipLiveState = {
  fishingPhase: 'idle',
  recentCatches: [],
};

const listeners = new Set<() => void>();

function emit(next: PipLiveState): void {
  state = next;
  for (const fn of listeners) fn();
}

export function subscribePipLiveState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getPipLiveState(): PipLiveState {
  return state;
}

/** 게임 액션의 성공 포획 결과를 실시간 PiP 버퍼에 적재한다 */
export function recordPipCatch(
  result: Extract<ActionResult, { type: 'catch' }>,
  caughtAtMs: number = Date.now(),
): void {
  const item = buildPipCatchItem(result, caughtAtMs);
  if (!item) return;
  const nextCatches = appendPipCatchBuffer(state.recentCatches, item);
  if (nextCatches === state.recentCatches) return;
  emit({ ...state, recentCatches: nextCatches });
}

/** 현재 필드의 낚시 단계를 실시간으로 갱신한다 */
export function setPipFishingPhase(phase: FishingPhase): void {
  if (state.fishingPhase === phase) return;
  emit({ ...state, fishingPhase: phase });
}

/** 계정 교체·초기화·테스트 격리 시 실시간 PiP 상태를 비운다 */
export function resetPipLiveState(): void {
  emit({ fishingPhase: 'idle', recentCatches: [] });
}
