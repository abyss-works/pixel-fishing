import { describe, expect, it } from 'vitest';
import { BAITS } from '../../../game/content/baits';
import { BOATS, MAX_BOAT, WALK_BAG_CAP, newState, rodStats } from '../../../game/rules/logic';
import {
  createBaitQuantities, normalizeBaitQuantity, selectBaitShopRows,
  selectBoatPurchasePreview, selectBoatPurchaseResult, selectRodUpgradePreview,
} from './facility';

describe('정비 화면 데이터', () => {
  it('낚싯대 강화의 현재·다음 스탯과 비용을 계산한다', () => {
    const game = newState();
    const preview = selectRodUpgradePreview(game);
    expect(preview.current).toEqual(rodStats(game.rod));
    expect(preview.next).toEqual(rodStats(game.rod + 1));
    expect(preview.cost).toBeGreaterThan(0);
    expect(typeof preview.canUpgrade.ok).toBe('boolean');
  });

  it('최고 배와 다음 배 구매 조건을 구분한다', () => {
    const game = newState();
    const available = selectBoatPurchasePreview(game);
    expect(available.kind).toBe('available');
    // 맨발은 도보 상한, 배가 있으면 그 배의 가방 상한이 "현재"다
    if (available.kind === 'available') expect(available.currentBagCap).toBe(WALK_BAG_CAP);
    game.boat = 1;
    const second = selectBoatPurchasePreview(game);
    if (second.kind === 'available') expect(second.currentBagCap).toBe(BOATS[0].bagCap);
    game.boat = MAX_BOAT;
    expect(selectBoatPurchasePreview(game)).toMatchObject({ kind: 'max' });
    expect(selectBoatPurchaseResult(1).boatName).toBeTruthy();
  });

  it('미끼 상점의 수량·보유량·총액·구매 가능 여부를 구성한다', () => {
    const game = newState();
    const quantities = createBaitQuantities();
    const bait = BAITS[0];
    quantities[bait.id] = 3;
    game.items[bait.id] = 2;
    game.gold = 100_000;

    const row = selectBaitShopRows(game, quantities, false)[0];
    expect(row).toMatchObject({ bait, count: 3, owned: 2, canAfford: true });
    expect(row.total).toBeGreaterThan(bait.price);
  });

  it('미끼 수량 입력을 정수 1개 이상, 액션 상한 이하로 제한한다', () => {
    expect(normalizeBaitQuantity(2.8)).toBe(2);
    expect(normalizeBaitQuantity(0)).toBe(1);
    expect(normalizeBaitQuantity(Number.NaN)).toBe(1);
    expect(normalizeBaitQuantity(10_000)).toBe(50);
  });
});
