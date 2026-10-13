import { describe, expect, it } from 'vitest';
import { FISH, newState } from '../../../game/rules/logic';
import type { FishInstance } from '../../../game/rules/logic';
import { selectBagCatalog, selectInventoryItemCount, selectSalePreview } from './catalog';

const instance = (uid: string, fishId: string, form: FishInstance['form'] = 'normal', locked = false): FishInstance => ({
  uid, fishId, form, size: 20, caughtAt: null, spot: null, judgment: null, locked,
});

describe('가방 파생 데이터', () => {
  it('보유·발견·미발견 순으로 종을 정렬하고 폼별 보유량을 만든다', () => {
    const game = newState();
    const [heldFish, foundFish, unseenFish] = FISH;
    game.dex[foundFish.id] = { normal: { count: 1, maxSize: 20, first: null } };

    const catalog = selectBagCatalog([
      instance('normal', heldFish.id),
      instance('variant', heldFish.id, 'variant'),
    ], game);

    expect(catalog[0]).toMatchObject({
      fish: heldFish, normalCount: 1, variantCount: 1, discovered: false,
    });
    expect(catalog.find(row => row.fish.id === foundFish.id)?.discovered).toBe(true);
    expect(catalog.find(row => row.fish.id === unseenFish.id)?.discovered).toBe(false);
  });

  it('판매 미리보기에 잠금·선택 제외·합계를 반영한다', () => {
    const [fish, other] = FISH;
    const bag = [
      instance('keep', fish.id),
      instance('locked', fish.id, 'variant', true),
      instance('sell', other.id),
    ];

    const preview = selectSalePreview(bag, new Set(['keep']));

    expect(preview.soldUids).toEqual(['sell']);
    expect(preview.lockedCount).toBe(1);
    expect(preview.total).toBeGreaterThan(0);
    expect(preview.rows.find(row => row.key === fish.id)).toMatchObject({
      selectedCount: 0, allSelected: false, selectedSubtotal: 0,
    });
  });

  it('아이템 스택의 보유량을 합산한다', () => {
    expect(selectInventoryItemCount({ bait: 3, ticket: 2 })).toBe(5);
  });
});
