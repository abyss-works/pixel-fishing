import { formName, saleBonusOf, speciesDiscovered } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import { FISH, SPOTS } from '../../../game/rules/logic';
import { rarityRank } from '../../../game/content/rarity';
import type { Stat } from '../../../game/rules/stats';
import { GUILD_BONUS_NAME } from '../../guild/model/guild';
import { shownFormOf } from '../../dex/model/shownForm';
import type { ShownForm } from '../../dex/model/shownForm';
import { FORTUNE_SOURCE_LABEL } from '../../fortune/model/fortune';
import type { BagRow } from './bagRows';
import { groupInstances, sumPrice } from './bagRows';

export interface BagCatalogEntry {
  fish: (typeof FISH)[number];
  name: string;
  /** 카드에 대표로 보일 폼 — 이름·스프라이트·상세 창 시작 폼의 기준 */
  shown: ShownForm;
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
    const shown = shownFormOf(game, fish.id);
    return {
      fish,
      name: formName(fish, shown.form),
      shown,
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
  /** 선택한 개체의 기본가 합 - 길드 보너스는 총액에서 한 번 더하므로 행에는 반영하지 않는다 */
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
  total: Stat;
}

export interface SellLuckSources {
  fortuneBonus: number;
  potions: readonly { id: string; name: string; bonus: number }[];
}

/** 기본 판매액에 길드·업적 판매가 보너스를 더한 내역 — 서버 판매와 같은 증가분 규칙(saleBonusOf)을 쓴다.
 *  luck은 운 배율(재물운·비약 독립 곱연산) — 보너스를 다 적용한 합계에 마지막으로 곱하고, 반올림은 곱 뒤 한 번이다(sellSelected와 같은 순서). */
export function saleProceeds(
  base: number,
  sellBonus: number,
  achSellBonus = 0,
  luck = 1,
  luckSources?: SellLuckSources,
): Stat {
  const totalBonus = Math.round((sellBonus + achSellBonus) * 1e9) / 1e9;
  const totalDelta = saleBonusOf(base, totalBonus);
  const mods: Stat['mods'] = [];
  if (sellBonus > 0) {
    const d = saleBonusOf(base, sellBonus);
    if (d > 0) mods.push({ id: 'guild-sell', label: GUILD_BONUS_NAME.sell, delta: d, source: { kind: 'guild', bonus: 'sell' } });
  }
  if (achSellBonus > 0) {
    const d = saleBonusOf(base, achSellBonus);
    if (d > 0) mods.push({ id: 'achievement-sellBonus', label: '업적 누적', delta: d, source: { kind: 'achievement', id: 'sellBonus' } });
  }
  if (mods.length > 0) {
    const rest = mods.slice(0, -1).reduce((sum, mod) => sum + mod.delta, 0);
    mods[mods.length - 1].delta = totalDelta - rest;
  }
  const preLuck = base + totalDelta;
  const value = Math.round(preLuck * luck);
  const luckDelta = value - preLuck;
  if (luckDelta !== 0) {
    if (!luckSources) {
      mods.push({ id: 'fortune-sell', label: FORTUNE_SOURCE_LABEL, delta: luckDelta, source: { kind: 'fortune' } });
    } else {
      const luckMods: Stat['mods'] = [];
      let running = preLuck;
      if (luckSources.fortuneBonus > 0) {
        const d = Math.round(running * luckSources.fortuneBonus);
        luckMods.push({ id: 'fortune-sell', label: FORTUNE_SOURCE_LABEL, delta: d, source: { kind: 'fortune' } });
        running += d;
      }
      for (const potion of luckSources.potions) {
        if (potion.bonus > 0) {
          const d = Math.round(running * potion.bonus);
          luckMods.push({ id: `potion-${potion.id}`, label: potion.name, delta: d, source: { kind: 'potion', id: potion.id } });
          running += d;
        }
      }
      if (luckMods.length > 0) {
        const rest = luckMods.slice(0, -1).reduce((sum, mod) => sum + mod.delta, 0);
        luckMods[luckMods.length - 1].delta = luckDelta - rest;
        mods.push(...luckMods);
      } else {
        mods.push({ id: 'fortune-sell', label: FORTUNE_SOURCE_LABEL, delta: luckDelta, source: { kind: 'fortune' } });
      }
    }
  }
  return {
    base,
    mods,
    value,
  };
}

/** 가방의 잠금·선택 제외 상태를 반영한 판매 대상과 합계를 만든다. sellBonus는 길드 판매가 보너스 비율이고,
 *  luck은 운 배율(재물운·비약 독립 곱연산)이다 — 미리보기 합계가 실제 수령액과 같아야 하므로 넘긴다. */
export function selectSalePreview(
  bag: readonly FishInstance[], excluded: ReadonlySet<string>, sellBonus: number, achSellBonus = 0, luck = 1,
  luckSources?: SellLuckSources,
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
    total: saleProceeds(
      rows.reduce((total, row) => total + row.selectedSubtotal, 0),
      sellBonus,
      achSellBonus,
      luck,
      luckSources,
    ),
  };
}
