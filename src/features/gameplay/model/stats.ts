import { SPOTS } from '../../../game/content/spots';
import type { RegionId } from '../../../game/content/places';
import { boatNameOf } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import {
  autoBoostForSpot, effectiveBite, manualBonusForSpot, minLevelOfPower,
  moveSpeed, powerZones, rodAxes, rodPower,
} from '../../../game/rules/stats';
import type { Movement } from '../../../game/rules/stats';

/** 스탯 화면 캐루셀의 초기 수역 인덱스. 해당 지역에서 요구 파워가 가장 높은 곳을 고른다. */
export function selectInitialStatsSpotIndex(region: RegionId): number {
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
