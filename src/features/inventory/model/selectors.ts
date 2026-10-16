// 게임 상태 셀렉터 — 파생 표시값의 단일 출처.
// useGame이 통째 game을 내려주는 동안은 호출부가 이 함수들로 파생값을 읽고,
// 나중에 외부 스토어로 옮기면 같은 함수가 구독 셀렉터가 된다.
// 게임 규칙 함수는 여기서 조합만 하고, 규칙 자체는 도메인 계층에서 관리한다.
import { autoLockPlan, bagCapacity, sellableValue } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { BAITS } from '../../../game/content/baits';
import { ARTIFACTS } from '../../../game/content/artifacts';
import type { Artifact } from '../../../game/content/artifacts';

export interface BagStatus { count: number; cap: number; full: boolean }

/** 가방 현황 — count/cap/full을 한 번에. 래칫 상한은 bagCapacity가 정한다. */
export function selectBagStatus(game: GameState): BagStatus {
  const count = game.bag.length;
  const cap = bagCapacity(game.boat, game.bag);
  return { count, cap, full: count >= cap };
}

export interface BagOverview extends BagStatus {
  sellableValue: number;
  /** 자동 잠금 계획 — 어종×폼별 최대만 잠그고 나머지 잠금은 푼다 */
  autoLock: { lock: string[]; unlock: string[] };
}

/** 가방 탭의 수량·판매 가치·자동 잠금 계획을 한 번에 제공한다. */
export function selectBagOverview(game: GameState): BagOverview {
  return {
    ...selectBagStatus(game),
    sellableValue: sellableValue(game),
    autoLock: autoLockPlan(game.bag),
  };
}

/** 아이템 탭의 미끼 목록과 보유량을 레지스트리 순서로 만든다. */
export function selectBaitInventory(items: Readonly<Record<string, number>>) {
  return BAITS.map(bait => ({ bait, count: items[bait.id] ?? 0 }));
}

/** 보유 유물 — 레지스트리(ARTIFACTS) 순서. 세이브의 소유 목록 순서는 획득 순이라 표시 기준으로 쓰지 않는다 */
export function selectOwnedArtifacts(game: Pick<GameState, 'artifacts'>): Artifact[] {
  const owned = new Set(game.artifacts);
  return ARTIFACTS.filter(a => owned.has(a.id));
}
