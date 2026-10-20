import { canFishSpot, drawRows, FISH, globalRarityShare, rarityShareOf, speciesDiscovered } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import type { Point, School } from '../../../game/world/types';
import type { RegionId } from '../../../game/world';
import { BOATS } from '../../../game/content/boats';
import type { Boat } from '../../../game/content/boats';
import { powerZones } from '../../../game/rules/stats';
import { defaultZoneOfRegion, spotsOfRegion, subtreeSpots, topZoneOf, zoneById, zoneGroup } from '../../../game/content/zones';
import type { Zone, ZoneId } from '../../../game/content/zones';
import { spotById } from '../../../game/content/spots';
import type { Spot, SpotId } from '../../../game/content/spots';
import { RARITY_ORDER, rarityRank } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';

export interface NearbySpot {
  spot: Spot;
  distancePx: number;
}
/** 플레이어와 어군별 최단 학교 거리로 지역 어군을 정렬한다. 좌표가 없으면 원래 순서를 쓴다. */
export function rankNearbySpots(
  spots: readonly Spot[], schools: readonly School[], pos: Point | null, limit = 3,
): NearbySpot[] {
  const distanceTo = (spot: Spot): number => {
    if (!pos) return Infinity;
    let best = Infinity;
    for (const school of schools) {
      if (school.spot !== spot.id) continue;
      const distance = Math.hypot(school.x - pos.x, school.y - pos.y);
      if (distance < best) best = distance;
    }
    return best;
  };
  return spots.map(spot => ({ spot, distancePx: distanceTo(spot) }))
    .sort((a, b) => a.distancePx - b.distancePx)
    .slice(0, limit);
}

export interface RegionViewData {
  spots: Spot[];
  focused: Spot | undefined;
  contextZone: ZoneId;
  zone: Zone;
  tableZone: Zone;
  tableSpots: Array<{
    spot: Spot;
    fishable: boolean;
    grades: Record<RarityId, GradeLevel>;
  }>;
  /** 하위 존이면 상위 구역, 최상위 존이면 null */
  parentZone: Zone | null;
  nearby: Array<NearbySpot & { status: SpotStatus }>;
  focusedFishes: ReturnType<typeof selectFishAtSpot>;
  focusedStatus: SpotStatus | null;
  focusedDex: { caught: number; total: number } | null;
  tendency: SpotTendency | null;
  /** 지금 배의 다음 단계. 마지막 배를 가졌으면 null */
  nextBoat: Boat | null;
}

export type SpotStatus =
  | { kind: 'ok' }
  | { kind: 'boat'; boatName: string }
  | { kind: 'power'; power: number; req: number };

/** 해역 낚시 상태 — 배 단계가 먼저, 그다음 낚싯대 파워가 요구치에 닿는지 본다. */
export function selectSpotStatus(game: GameState, spot: SpotId): SpotStatus {
  if (!canFishSpot(game, spot)) {
    return { kind: 'boat', boatName: BOATS[spotById(spot)!.boatTier - 1]?.name ?? '' };
  }
  const { power, req } = powerZones(game, spot);
  return power < req ? { kind: 'power', power, req } : { kind: 'ok' };
}

/** 지역·현재 위치 상태에서 지역 화면이 표시할 존, 주목 어군, 가까운 어군을 고른다.
 *  schools = 이 지역의 현재 어군(세션 배치 날짜 기준) — 가까운 어군 거리의 근거. */
export function selectRegionViewData(
  game: GameState, region: RegionId, schools: readonly School[], storeZone: ZoneId | null,
  currentSpot: SpotId | null, pos: Point | null,
): RegionViewData {
  const spots = spotsOfRegion(region);
  const focused = currentSpot && spots.some(spot => spot.id === currentSpot)
    ? spotById(currentSpot) : undefined;
  const contextZone: ZoneId = (storeZone && zoneGroup(storeZone) === region)
    ? storeZone : defaultZoneOfRegion(region);
  const zone = zoneById(contextZone)!;
  const tableZone = zoneById(topZoneOf(contextZone))!;
  const tableSpots = subtreeSpots(tableZone.id).map(spot => ({
    spot,
    fishable: canFishSpot(game, spot.id),
    grades: Object.fromEntries(RARITY_ORDER.map(rarity => [
      rarity, selectGradeLevel(spot.id, rarity),
    ])) as Record<RarityId, GradeLevel>,
  }));
  const parentZone = zone.parent ? zoneById(zone.parent) ?? null : null;
  const nearby = rankNearbySpots(spots, schools, pos)
    .map(row => ({ ...row, status: selectSpotStatus(game, row.spot.id) }));
  const focusedFishes = focused ? selectFishAtSpot(focused.id, game) : [];
  const focusedStatus = focused ? selectSpotStatus(game, focused.id) : null;
  const focusedDex = focused
    ? { caught: focusedFishes.filter(row => row.discovered).length, total: focusedFishes.length }
    : null;
  const tendency = focused ? selectSpotTendency(focused.id) : null;
  const nextBoat = BOATS[game.boat] ?? null;
  return {
    spots, focused, contextZone, zone, parentZone, tableZone, tableSpots, nearby,
    focusedFishes, focusedStatus, focusedDex, tendency, nextBoat,
  };
}

/** 지역 상세 카드에 표시할 수역 어종을 등급 순으로 반환한다. */
export function selectFishAtSpot(spot: SpotId, game: GameState) {
  return FISH.filter(fish => fish.spot === spot)
    .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))
    .map(fish => ({ fish, discovered: speciesDiscovered(game, fish.id) }));
}

export type SpotTendency = 'legendary' | 'high' | 'ordinary';

/** 추첨 비중을 지역 화면 서술에 필요한 세 단계 데이터로 분류한다. */
export function selectSpotTendency(spot: SpotId): SpotTendency {
  const rows = drawRows(spot);
  const grade = new Map(rows.map(row => [row.fish.rarity, row.gradePct] as const));
  const legendary = grade.get('legendary') ?? 0;
  const epic = grade.get('epic') ?? 0;
  const rare = grade.get('rare') ?? 0;
  if (legendary >= 2.5) {
    return 'legendary';
  }
  if (epic >= 7 || rare >= 25) {
    return 'high';
  }
  return 'ordinary';
}

export type GradeLevel = 'high' | 'mid' | 'low' | 'none';

/** 해역의 등급 확률을 전역 기본 확률과 비교해 지역 화면의 정성 등급을 만든다.
 *  해역마다 가중치 합(분모)이 달라 가중치 절대치끼리는 비교하지 않는다. */
export function selectGradeLevel(spot: SpotId, rarity: RarityId): GradeLevel {
  const share = rarityShareOf(spot, rarity);
  if (share === 0) return 'none';
  const base = globalRarityShare(rarity);
  const EPS = 1e-9;
  return share > base + EPS ? 'high' : share < base - EPS ? 'low' : 'mid';
}
