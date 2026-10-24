import { SPOTS } from '../../../game/content/spots';
import type { Spot, SpotId } from '../../../game/content/spots';
import type { RegionId } from '../../../game/content/places';
import { ARTIFACTS } from '../../../game/content/artifacts';
import type { Artifact, ArtifactEffects } from '../../../game/content/artifacts';
import { baitById } from '../../../game/content/baits';
import type { Bait } from '../../../game/content/baits';
import { ZONE_IDS, topZoneOfSpot, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { FISH, boatNameOf, formDiscovered } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import {
  autoBoostForSpot, effectiveBite, manualBonusForSpot, minLevelOfPower,
  moveSpeed, powerZones, rodAxes, rodPower,
} from '../../../game/rules/stats';
import type { Movement } from '../../../game/rules/stats';
import { selectBagStatus } from '../../inventory/model/selectors';
import type { BagStatus } from '../../inventory/model/selectors';

/** 스탯 화면의 처음 수역 인덱스. 사거리 안의 어군 수역이 있으면 그 수역이고, 없으면 지역에서 요구 파워가 가장 높은 곳이다. */
export function selectInitialStatsSpotIndex(region: RegionId, current: SpotId | null = null): number {
  const here = current ? SPOTS.findIndex(spot => spot.id === current) : -1;
  if (here >= 0) return here;
  let best = 0;
  SPOTS.forEach((spot, index) => {
    const inRegion = region === 'world' ? spot.region !== 'village' : spot.region === region;
    if (inRegion && (spot.powerReq ?? 0) >= (SPOTS[best].powerReq ?? 0)) best = index;
  });
  return best;
}

/** 선택 수역과 현재 세이브 상태에서 스탯 화면이 표시할 값을 조립한다. */
export function selectStatsModalData(
  game: GameState, movement: Movement, spotIndex: number,
) {
  const spot = SPOTS[spotIndex];
  const requirement = spot.powerReq ?? 0;
  const currentPower = rodPower(game);
  return {
    speed: moveSpeed(game, movement),
    axes: rodAxes(game),
    boatName: boatNameOf(game.boat),
    spot,
    requirement,
    requirementLevel: minLevelOfPower(requirement),
    effectiveBite: effectiveBite(game, spot.id),
    autoBoost: autoBoostForSpot(game, spot.id),
    manualBonus: manualBonusForSpot(game, spot.id),
    powerZones: powerZones(game, spot.id),
    currentPower,
    underpowered: currentPower < requirement,
  };
}

/** 해역에서 낚을 수 있는가 — 배가 먼저고, 배가 되면 파워를 본다 */
export type SpotFit = 'ok' | 'power' | 'boat';

export interface StatsSpotRow {
  spotIndex: number;
  spot: Spot;
  /** 해역이 속한 최상위 지역 */
  zone: ZoneId;
  fit: SpotFit;
  data: ReturnType<typeof selectStatsModalData>;
}

const zoneOf = (spot: Spot): ZoneId => topZoneOfSpot(spot.id) ?? 'village';

/** 모든 해역의 적합도와 그 해역 기준 스탯 */
export function selectStatsSpotRows(game: GameState, movement: Movement): StatsSpotRow[] {
  return SPOTS.map((spot, spotIndex) => {
    const data = selectStatsModalData(game, movement, spotIndex);
    const fit: SpotFit = spot.boatTier > game.boat ? 'boat' : data.underpowered ? 'power' : 'ok';
    return { spotIndex, spot, zone: zoneOf(spot), fit, data };
  });
}

export interface StatsZoneTab { zone: ZoneId; name: string; ok: number; total: number }

/** 낚싯대 화면의 지역 탭 — 바다 지역마다 충족한 해역 수를 센다. 마을은 지금 마을에 있을 때만 넣는다 */
export function selectStatsZoneTabs(rows: readonly StatsSpotRow[], currentZone: ZoneId): StatsZoneTab[] {
  return ZONE_IDS
    .filter(zone => zone !== 'village' || currentZone === 'village')
    .map(zone => {
      const inZone = rows.filter(row => row.zone === zone);
      return { zone, name: zoneById(zone)?.name ?? zone, ok: inZone.filter(row => row.fit === 'ok').length, total: inZone.length };
    })
    .filter(tab => tab.total > 0);
}

export interface ReachableZone {
  zone: ZoneId;
  name: string;
  /** 지금 배로 갈 수 있는 해역 수 */
  open: number;
  total: number;
  /** 하나도 못 갈 때 가장 먼저 필요한 배 단계. 하나라도 갈 수 있으면 null */
  needBoat: number | null;
}

/** 지역마다 지금 배로 갈 수 있는 해역 수 */
export function selectReachableZones(game: GameState): ReachableZone[] {
  return ZONE_IDS.map(zone => {
    const spots = SPOTS.filter(spot => zoneOf(spot) === zone);
    const open = spots.filter(spot => spot.boatTier <= game.boat).length;
    const needBoat = open > 0 ? null : Math.min(...spots.map(spot => spot.boatTier));
    return { zone, name: zoneById(zone)?.name ?? zone, open, total: spots.length, needBoat };
  }).filter(zone => zone.total > 0);
}

export interface StatsSummary {
  /** 일반 폼으로 한 번이라도 낚은 어종 수 — 랭킹의 도감 완성도와 같은 기준 */
  dexFound: number;
  dexTotal: number;
  bag: BagStatus;
}

export function selectStatsSummary(game: GameState): StatsSummary {
  return {
    dexFound: FISH.filter(fish => formDiscovered(game, fish.id, 'normal')).length,
    dexTotal: FISH.length,
    bag: selectBagStatus(game),
  };
}

/** 보너스 갈래 — 화면에 놓이는 순서다 */
export type BonusCategory = 'move' | 'fish' | 'duel' | 'shop';
export const BONUS_CATEGORIES: readonly BonusCategory[] = ['move', 'fish', 'duel', 'shop'];

const EFFECT_CATEGORY: Record<keyof ArtifactEffects, BonusCategory> = {
  sail: 'move', mutationWeight: 'fish', duelSpeedupCut: 'duel', baitDiscount: 'shop',
};

export type BonusSource =
  | { kind: 'relic'; artifact: Artifact; effect: keyof ArtifactEffects }
  | { kind: 'bait'; bait: Bait };

export interface BonusRow {
  category: BonusCategory;
  source: BonusSource;
  /** 직접 낚을 때만 붙는 효과 — 방치 낚시에는 쓰이지 않는다 */
  manualOnly: boolean;
}

/**
 * 지금 받는 보너스 — 가진 유물의 효과(효과마다 한 줄)와 켜 둔 미끼.
 * 낚싯대 파워에서 오는 효과(수동 보정·GOOD·PERFECT)는 해역마다 달라 낚싯대 탭의 해역 표가 맡는다.
 */
export function selectActiveBonuses(game: GameState): BonusRow[] {
  const out: BonusRow[] = [];
  const owned = new Set(game.artifacts);
  for (const artifact of ARTIFACTS) {
    if (!owned.has(artifact.id)) continue;
    for (const effect of Object.keys(artifact.effects) as (keyof ArtifactEffects)[]) {
      if (artifact.effects[effect] === undefined) continue;
      out.push({ category: EFFECT_CATEGORY[effect], source: { kind: 'relic', artifact, effect }, manualOnly: false });
    }
  }
  const bait = baitById(game.activeBait);
  if (bait) out.push({ category: 'fish', source: { kind: 'bait', bait }, manualOnly: true });
  return out;
}
