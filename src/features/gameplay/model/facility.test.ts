import { describe, expect, it } from 'vitest';
import { BOATS, MAX_BOAT, WALK_BAG_CAP, newState, rodStats } from '../../../game/rules/logic';
import { upgradeCost } from '../../../game/rules/balance';
import { powerOfLevel } from '../../../game/rules/stats';
import {
  selectBoatLadder, selectBoatPurchasePreview, selectBoatPurchaseResult, selectRodLadder, selectRodUpgradePreview,
} from './facility';

describe('정비 화면 데이터', () => {
  it('낚싯대 강화의 현재·다음 스탯과 비용을 계산한다', () => {
    const game = newState();
    const preview = selectRodUpgradePreview(game);
    expect(preview.current).toEqual(rodStats(game.rod));
    expect(preview.next).toEqual(rodStats(game.rod + 1));
    expect(preview.power).toEqual({ current: powerOfLevel(game.rod), next: powerOfLevel(game.rod + 1) });
    expect(preview.power.next).toBeGreaterThan(preview.power.current);
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

  it('가방 상한보다 많이 든 상태면 현재 가방은 든 수(래칫)로 보인다', () => {
    const game = { ...newState(), boat: 3, bag: Array.from({ length: 550 }, () => ({}) as never) };
    const preview = selectBoatPurchasePreview(game);
    expect(preview.kind === 'available' && preview.currentBagCap).toBe(550);
  });

  it('배 사다리 — 가진 배는 done, 현재는 current, 바로 다음은 next, 나머지는 locked', () => {
    const game = newState();
    expect(selectBoatLadder(game).map(r => r.state)).toEqual(['next', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked']);
    game.boat = 2;
    expect(selectBoatLadder(game).map(r => r.state)).toEqual(['done', 'current', 'next', 'locked', 'locked', 'locked', 'locked', 'locked']);
    game.boat = MAX_BOAT;
    expect(selectBoatLadder(game).at(-1)?.state).toBe('current');
  });

  it('낚싯대 목록 — 현재 앞 2단계부터 7행, 1레벨 아래로는 내려가지 않고 비용은 그 레벨로 올리는 값', () => {
    const game = newState(); // rod 1
    const rows = selectRodLadder(game);
    expect(rows.map(r => r.level)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.map(r => r.state)).toEqual(['current', 'next', 'locked', 'locked', 'locked', 'locked', 'locked']);
    expect(rows[1].cost).toBe(upgradeCost(1));
    expect(rows.map(r => r.power)).toEqual(rows.map(r => powerOfLevel(r.level)));
    game.rod = 12;
    const later = selectRodLadder(game);
    expect(later.map(r => r.level)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(later.map(r => r.state)).toEqual(['done', 'done', 'current', 'next', 'locked', 'locked', 'locked']);
  });

  it('배 구매 미리보기는 지금 탄 배 이름을 함께 준다 — 맨발이면 null', () => {
    const game = newState();
    const none = selectBoatPurchasePreview(game);
    expect(none.kind === 'available' && none.currentName).toBeNull();
    game.boat = 2;
    const sail = selectBoatPurchasePreview(game);
    expect(sail.kind === 'available' && sail.currentName).toBe(BOATS[1].name);
  });
});
