import { BAITS } from '../../../game/content/baits';
import type { Bait } from '../../../game/content/baits';
import { BOATS } from '../../../game/content/boats';
import type { Boat } from '../../../game/content/boats';
import { SPOTS } from '../../../game/content/spots';
import type { Spot } from '../../../game/content/spots';
import { MAX_BOAT, baitCost, canBuyBoat, canUpgradeRod, rodStats } from '../../../game/rules/logic';
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
    check: canBuyBoat(game),
  };
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
  total: number;
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
      canAfford: game.gold >= total && !busy,
    };
  });
}
