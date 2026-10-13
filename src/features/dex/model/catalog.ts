import { BOUNTIES } from '../../../game/content/bounties';
import type { BountyQuest } from '../../../game/content/bounties';
import { namedById, namedFishOf } from '../../../game/content/named';
import { rarityRank } from '../../../game/content/rarity';
import { ZONE_IDS, subtreeSpots, topZoneOfSpot } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { FISH, dexRecord, formDiscovered, formName, priceOf, sizeParams, sizePercentile } from '../../../game/rules/logic';
import type { Fish, FormId, GameState } from '../../../game/rules/logic';

export interface DexFishEntry {
  fish: Fish;
  discovered: boolean;
  count: number;
  name: string;
  price: number;
}

export interface DexSpotEntry {
  spot: ReturnType<typeof subtreeSpots>[number];
  fishes: DexFishEntry[];
}

export interface DexZoneEntry {
  id: ZoneId;
  fishCount: number;
  foundCount: number;
}

export interface DexGridData {
  foundCount: number;
  fishCount: number;
  zones: DexZoneEntry[];
  spots: DexSpotEntry[];
}

/** 일반·변이 도감 화면이 공유하는 발견 집계와 존·수역별 어종 데이터를 만든다. */
export function selectDexGrid(game: GameState, zone: ZoneId, form: FormId): DexGridData {
  const discovered = (fish: Fish): boolean => formDiscovered(game, fish.id, form);
  const zones = ZONE_IDS.map(id => {
    const zoneFish = FISH.filter(fish => topZoneOfSpot(fish.spot) === id);
    return { id, fishCount: zoneFish.length, foundCount: zoneFish.filter(discovered).length };
  });
  const spots = subtreeSpots(zone).map(spot => ({
    spot,
    fishes: FISH.filter(fish => fish.spot === spot.id)
      .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))
      .map(fish => ({
        fish,
        discovered: discovered(fish),
        count: dexRecord(game, fish.id, form)?.count ?? 0,
        name: formName(fish, form),
        price: priceOf(fish, form),
      })),
  }));

  return {
    foundCount: FISH.filter(discovered).length,
    fishCount: FISH.length,
    zones,
    spots,
  };
}

export interface NamedDexEntry {
  quest: BountyQuest;
  found: boolean;
  fish: Fish | null;
  displayName: string | null;
}

export interface NamedDexData {
  foundCount: number;
  totalCount: number;
  zones: Array<{ id: ZoneId; foundCount: number; totalCount: number }>;
  quests: NamedDexEntry[];
}

export interface DexDetailEntry {
  form: FormId;
  name: string;
  lore: string;
  discovered: boolean;
  count: number;
  maxSize: number;
  firstCaught: string | undefined;
  price: number;
  sizePercentile: number;
}

/** 상세 도감의 폼별 기록·가격·크기 데이터를 만든다. */
export function selectDexDetailData(game: GameState, fish: Fish): DexDetailEntry[] {
  return (['normal', 'variant'] as const).map(form => {
    const record = dexRecord(game, fish.id, form);
    const maxSize = record?.maxSize ?? sizeParams(fish).mean;
    return {
      form,
      name: formName(fish, form),
      lore: form === 'variant' ? fish.variant.lore : fish.lore,
      discovered: (record?.count ?? 0) > 0,
      count: record?.count ?? 0,
      maxSize,
      firstCaught: record?.first ?? undefined,
      price: priceOf(fish, form),
      sizePercentile: sizePercentile(fish, maxSize),
    };
  });
}

/** 지명 수배 도감의 발견·해역별 집계와 공개 여부를 만든다. */
export function selectNamedDex(game: GameState, zone: ZoneId): NamedDexData {
  const namedQuests = BOUNTIES.filter(quest => quest.difficulty === 'named');
  const found = (quest: BountyQuest): boolean =>
    quest.targetFish !== null && formDiscovered(game, quest.targetFish, 'normal');
  const quests = namedQuests.filter(quest => quest.zone === zone).map(quest => {
    const named = quest.targetFish ? namedById(quest.targetFish) : undefined;
    const isFound = found(quest);
    return {
      quest,
      found: isFound,
      fish: named ? namedFishOf(named) : null,
      displayName: isFound ? named?.name ?? quest.targetFish : null,
    };
  });

  return {
    foundCount: namedQuests.filter(found).length,
    totalCount: namedQuests.length,
    zones: ZONE_IDS.map(id => {
      const zoneQuests = namedQuests.filter(quest => quest.zone === id);
      return { id, totalCount: zoneQuests.length, foundCount: zoneQuests.filter(found).length };
    }),
    quests,
  };
}
