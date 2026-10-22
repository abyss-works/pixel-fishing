import { BAITS } from '../../../game/content/baits';
import type { Bait } from '../../../game/content/baits';
import { BOATS } from '../../../game/content/boats';
import type { Boat } from '../../../game/content/boats';
import { SPOTS } from '../../../game/content/spots';
import type { Spot } from '../../../game/content/spots';
import { MAX_BOAT, bagCapacity, baitCost, baitDiscount, canBuyBoat, canUpgradeRod, rodStats } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { BAIT_BUY_MAX, upgradeCost } from '../../../game/rules/balance';

/** 낚싯대 강화 전후 수치와 구매 가능 판정을 계산한다. */
export function selectRodUpgradePreview(game: GameState) {
  return {
    cost: upgradeCost(game.rod),
    current: rodStats(game.rod),
    next: rodStats(game.rod + 1),
    canUpgrade: canUpgradeRod(game),
  };
}

export type BoatPurchasePreview =
  | { kind: 'max'; boatName: string }
  | {
    kind: 'available';
    next: Boat;
    openedSpot: Spot | undefined;
    currentSpeed: number | null;
    /** 현재 배(맨발이면 도보 상한)와 다음 배의 가방 상한 — 구매 비교 표의 두 번째 축 */
    currentBagCap: number;
    check: ReturnType<typeof canBuyBoat>;
  };

/** 다음 배 또는 최고 배 상태와 구매 표시에 필요한 조건을 계산한다. */
export function selectBoatPurchasePreview(game: GameState): BoatPurchasePreview {
  if (game.boat >= MAX_BOAT) {
    return { kind: 'max', boatName: BOATS[MAX_BOAT - 1].name };
  }
  const next = BOATS[game.boat];
  return {
    kind: 'available',
    next,
    openedSpot: SPOTS.find(spot => spot.boatTier === next.tier),
    currentSpeed: game.boat === 0 ? null : BOATS[game.boat - 1].speed,
    currentBagCap: bagCapacity(game.boat, game.bag),
    check: canBuyBoat(game),
  };
}

export type LadderState = 'done' | 'current' | 'next' | 'locked';

export interface BoatLadderRow { boat: Boat; state: LadderState; openedSpot: Spot | undefined }

/** 배 6단계 사다리 — 가진 배는 done, 현재 배는 current, 바로 다음은 next, 그 뒤는 locked.
 *  맨발(0)은 사다리에 없다 — 첫 행이 next가 된다. */
export function selectBoatLadder(game: GameState): BoatLadderRow[] {
  return BOATS.map(boat => ({
    boat,
    openedSpot: SPOTS.find(spot => spot.boatTier === boat.tier),
    state: boat.tier < game.boat ? 'done'
      : boat.tier === game.boat ? 'current'
      : boat.tier === game.boat + 1 ? 'next' : 'locked',
  }));
}

export interface RodLadderRow { level: number; stats: ReturnType<typeof rodStats>; cost: number; state: LadderState }

/** 낚싯대 사다리 — 상한이 없어 현재 ±2단계만 자른다. 각 행의 cost는 그 레벨로 올리는 비용 */
export function selectRodLadder(game: GameState, span = 2): RodLadderRow[] {
  const rows: RodLadderRow[] = [];
  for (let level = Math.max(1, game.rod - span); level <= game.rod + span; level++) {
    rows.push({
      level, stats: rodStats(level), cost: level > 1 ? upgradeCost(level - 1) : 0,
      state: level < game.rod ? 'done' : level === game.rod ? 'current' : level === game.rod + 1 ? 'next' : 'locked',
    });
  }
  return rows;
}

/** 배 구매 완료 토스트에 쓸 이름과 새로 열린 수역을 반환한다. */
export function selectBoatPurchaseResult(tier: number): {
  boatName: string;
  openedSpots: Spot[];
} {
  return {
    boatName: BOATS[tier - 1].name,
    openedSpots: SPOTS.filter(spot => spot.boatTier === tier),
  };
}

/** 미끼별 초기 수량을 준비한다. */
export function createBaitQuantities(): Record<string, number> {
  return Object.fromEntries(BAITS.map(bait => [bait.id, 1]));
}

/** 상점 입력 수량을 액션 규칙의 요청 상한 안으로 정규화한다. */
export function normalizeBaitQuantity(value: number): number {
  return Math.min(BAIT_BUY_MAX, Math.max(1, Math.floor(value) || 1));
}

export interface BaitShopRow {
  bait: Bait;
  owned: number;
  count: number;
  /** 실제 차감액(할인 적용) — 리듀서와 같은 baitCost */
  total: number;
  /** 정가 합계 — 할인이 있으면 취소선으로 함께 보인다 */
  listTotal: number;
  /** 1개 할인가 */
  unitPrice: number;
  /** 할인율(0이면 할인 없음) */
  discountRate: number;
  canAfford: boolean;
}

/** 미끼 상점의 재고·수량·비용·구매 가능 여부를 만든다. */
export function selectBaitShopRows(
  game: GameState, quantities: Readonly<Record<string, number>>, busy: boolean,
): BaitShopRow[] {
  return BAITS.map(bait => {
    const count = quantities[bait.id] ?? 1;
    const total = baitCost(game, bait.price, count);
    return {
      bait,
      owned: game.items[bait.id] ?? 0,
      count,
      total,
      listTotal: bait.price * count,
      unitPrice: baitCost(game, bait.price, 1),
      discountRate: baitDiscount(game),
      canAfford: game.gold >= total && !busy,
    };
  });
}
