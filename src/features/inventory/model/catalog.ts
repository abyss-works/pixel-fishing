import { formName, speciesDiscovered } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import { FISH, SPOTS } from '../../../game/rules/logic';
import { rarityRank } from '../../../game/content/rarity';
import type { BagRow } from './bagRows';
import { groupInstances, sumPrice } from './bagRows';

export interface BagCatalogEntry {
  fish: (typeof FISH)[number];
  name: string;
  normalCount: number;
  variantCount: number;
  discovered: boolean;
}

interface HeldCount { normal: number; variant: number }

const spotRank = (spot: string): number => {
  const index = SPOTS.findIndex(candidate => candidate.id === spot);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
};

const DEX_ORDER = new Map(
  FISH.map((fish, index) => ({ fish, index }))
    .sort((a, b) => spotRank(a.fish.spot) - spotRank(b.fish.spot)
      || rarityRank(a.fish.rarity) - rarityRank(b.fish.rarity)
      || a.index - b.index)
    .map(({ fish }, index) => [fish.id, index] as const),
);

/** 가방 카드에 표시할 전체 어종, 폼별 보유량, 발견 여부를 보유·등급·가격 순으로 만든다. */
export function selectBagCatalog(
  bag: readonly FishInstance[], game: GameState,
): BagCatalogEntry[] {
  const held = new Map<string, HeldCount>();
  for (const instance of bag) {
    const count = held.get(instance.fishId) ?? { normal: 0, variant: 0 };
    if (instance.form === 'variant') count.variant++;
    else count.normal++;
    held.set(instance.fishId, count);
  }

  return FISH.map(fish => {
    const count = held.get(fish.id) ?? { normal: 0, variant: 0 };
    return {
      fish,
      name: formName(fish, 'normal'),
      normalCount: count.normal,
      variantCount: count.variant,
      discovered: speciesDiscovered(game, fish.id),
    };
  }).sort((a, b) => {
    const aGroup = held.has(a.fish.id) ? 0 : a.discovered ? 1 : 2;
    const bGroup = held.has(b.fish.id) ? 0 : b.discovered ? 1 : 2;
    return aGroup - bGroup
      || rarityRank(b.fish.rarity) - rarityRank(a.fish.rarity)
      || b.fish.price - a.fish.price
      || (DEX_ORDER.get(a.fish.id) ?? Number.MAX_SAFE_INTEGER)
        - (DEX_ORDER.get(b.fish.id) ?? Number.MAX_SAFE_INTEGER);
  });
}

export interface SaleRow extends BagRow {
  sellable: FishInstance[];
  selected: FishInstance[];
  selectedCount: number;
  allSelected: boolean;
  selectedSubtotal: number;
  unsized: Array<BagRow['unsized'][number] & {
    free: FishInstance[];
    selectedCount: number;
    allSelected: boolean;
  }>;
}

export interface SalePreview {
  rows: SaleRow[];
  soldUids: string[];
  total: number;
  lockedCount: number;
}

/** 가방의 잠금·선택 제외 상태를 반영한 판매 대상과 합계를 만든다. */
export function selectSalePreview(
  bag: readonly FishInstance[], excluded: ReadonlySet<string>,
): SalePreview {
  const rows = groupInstances(bag).map((row): SaleRow => {
    const sellable = row.items.filter(instance => !instance.locked);
    const selected = sellable.filter(instance => !excluded.has(instance.uid));
    const unsized = row.unsized.map(group => {
      const free = group.items.filter(instance => !instance.locked);
      const selectedCount = free.filter(instance => !excluded.has(instance.uid)).length;
      return {
        ...group,
        free,
        selectedCount,
        allSelected: free.length > 0 && selectedCount === free.length,
      };
    });
    return {
      ...row,
      sellable,
      selected,
      selectedCount: selected.length,
      allSelected: sellable.length > 0 && selected.length === sellable.length,
      selectedSubtotal: sumPrice(selected),
      unsized,
    };
  });
  const soldUids = rows.flatMap(row => row.selected.map(instance => instance.uid));
  return {
    rows,
    soldUids,
    total: rows.reduce((total, row) => total + row.selectedSubtotal, 0),
    lockedCount: bag.filter(instance => instance.locked).length,
  };
}
