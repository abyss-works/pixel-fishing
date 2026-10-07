// 게임 상태 셀렉터 — 파생 표시값의 단일 출처.
// useGame이 통째 game을 내려주는 동안은 호출부가 이 함수들로 파생값을 읽고,
// 나중에 외부 스토어로 옮기면 같은 함수가 구독 셀렉터가 된다.
// game/의 규칙 함수는 여기서 조합만 한다 — 규칙 자체는 game/에 둔다.
import { bagCapacity } from '../game/logic';
import type { GameState } from '../game/logic';

export interface BagStatus { count: number; cap: number; full: boolean }

/** 가방 현황 — count/cap/full을 한 번에. 래칫 상한은 bagCapacity가 정한다. */
export function selectBagStatus(game: GameState): BagStatus {
  const count = game.bag.length;
  const cap = bagCapacity(game.boat, game.bag);
  return { count, cap, full: count >= cap };
}
