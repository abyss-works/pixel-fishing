import { describe, expect, it } from 'vitest';
import { BAITS } from '../../../game/content/baits';
import { BOATS, MAX_BOAT, WALK_BAG_CAP, baitCost, newState, rodStats } from '../../../game/rules/logic';
import { upgradeCost } from '../../../game/rules/balance';
import {
  createBaitQuantities, normalizeBaitQuantity, selectBaitShopRows, selectBoatLadder,
  selectBoatPurchasePreview, selectBoatPurchaseResult, selectRodLadder, selectRodUpgradePreview,
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

  it('배 사다리 — 가진 배는 done, 현재는 current, 바로 다음은 next, 나머지는 locked', () => {
    const game = newState();
    expect(selectBoatLadder(game).map(r => r.state)).toEqual(['next', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked']);
    game.boat = 2;
    expect(selectBoatLadder(game).map(r => r.state)).toEqual(['done', 'current', 'next', 'locked', 'locked', 'locked', 'locked']);
    game.boat = MAX_BOAT;
    expect(selectBoatLadder(game).at(-1)?.state).toBe('current');
  });

  it('낚싯대 사다리 — 현재 ±2단계, 1레벨 아래로는 내려가지 않고 비용은 그 레벨로 올리는 값', () => {
    const game = newState(); // rod 1
    const rows = selectRodLadder(game);
    expect(rows.map(r => r.level)).toEqual([1, 2, 3]);
    expect(rows.map(r => r.state)).toEqual(['current', 'next', 'locked']);
    expect(rows[1].cost).toBe(upgradeCost(1));
    game.rod = 5;
    expect(selectRodLadder(game).map(r => r.level)).toEqual([3, 4, 5, 6, 7]);
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
    expect(row).toMatchObject({ listTotal: bait.price * 3, unitPrice: bait.price, discountRate: 0 });
  });

  it('할인 유물이 있으면 정가와 할인가를 함께 준다 — 총액은 실제 차감액(baitCost)과 같다', () => {
    const game = { ...newState(), gold: 100_000, artifacts: ['varuna-scale'] };
    const quantities = createBaitQuantities();
    const bait = BAITS[1];
    quantities[bait.id] = 4;
    const row = selectBaitShopRows(game, quantities, false)[1];
    expect(row.discountRate).toBe(0.25);
    expect(row.listTotal).toBe(bait.price * 4);
    expect(row.total).toBe(baitCost(game, bait.price, 4));
    expect(row.total).toBeLessThan(row.listTotal);
    expect(row.unitPrice).toBe(baitCost(game, bait.price, 1));
  });

  it('미끼 수량 입력을 정수 1개 이상, 액션 상한 이하로 제한한다', () => {
    expect(normalizeBaitQuantity(2.8)).toBe(2);
    expect(normalizeBaitQuantity(0)).toBe(1);
    expect(normalizeBaitQuantity(Number.NaN)).toBe(1);
    expect(normalizeBaitQuantity(10_000)).toBe(50);
  });
});
