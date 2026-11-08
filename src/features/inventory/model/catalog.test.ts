import { describe, expect, it } from 'vitest';
import { FISH, newState, saleBonusOf, sellSelected } from '../../../game/rules/logic';
import type { FishInstance } from '../../../game/rules/logic';
import { selectBagCatalog, selectSalePreview } from './catalog';

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
    expect(preview.total.value).toBeGreaterThan(0);
    expect(preview.rows.find(row => row.key === fish.id)).toMatchObject({
      selectedCount: 0, allSelected: false, selectedSubtotal: { base: 0, mods: [], value: 0 },
    });
  });

  it('길드 판매가 보너스는 판매 총액에 한 번 반올림해 더하고 서버 판매 결과와 같다', () => {
    const [fish, other] = FISH;
    const bag = [instance('a', fish.id), instance('b', other.id)];
    const state = { ...newState(), gold: 0, bag };

    const none = selectSalePreview(bag, new Set());
    expect(none.total).toEqual({ base: none.total.base, mods: [], value: none.total.base });

    const bonus = 0.06;
    const preview = selectSalePreview(bag, new Set(), bonus);
    expect(preview.total.base).toBe(none.total.base);
    expect(preview.total.mods).toEqual([{ id: 'guild-sell', label: '판매가 보너스', delta: saleBonusOf(none.total.base, bonus) }]);
    expect(preview.total.value).toBe(sellSelected(state, preview.soldUids, bonus).gold);
    for (const row of preview.rows) {
      expect(row.selectedSubtotal.value).toBe(row.selectedSubtotal.base + saleBonusOf(row.selectedSubtotal.base, bonus));
    }
  });
});
