import { SPOTS } from '../../../game/content/spots';
import type { Spot, SpotId } from '../../../game/content/spots';
import type { RegionId } from '../../../game/content/places';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { COOK_EFFECT_KEYS } from '../../../game/content/cooking';
import type { CookEffects } from '../../../game/content/cooking';
import type { Artifact, ArtifactEffects } from '../../../game/content/artifacts';
import { ZONE_IDS, topZoneOfSpot, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { commonWeightMultiplier } from '../../../game/rules/actions';
import { artifactEffectsAt, artifactExtraCookChanceAt, artifactLevelOf } from '../../../game/rules/artifactLevel';
import { FISH, boatNameOf, formDiscovered } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { GUILD_BONUS_IDS } from '../../../game/rules/guild';
import type { GuildBonusId, GuildEffects } from '../../../game/rules/guild';
import {
  effectiveBite, minLevelOfPower,
  moveSpeed, powerZones, rodAxes, rodPower,
} from '../../../game/rules/stats';
import type { Movement } from '../../../game/rules/stats';
import { selectBagStatus } from '../../inventory/model/selectors';
import type { BagStatus } from '../../inventory/model/selectors';
import { recipeEffectLines } from '../../kitchen/model/recipes';
import type { RecipeEffectLine } from '../../kitchen/model/recipes';
import { SLOT_ORDER, activeSlot } from '../../kitchen/model/slots';
import type { SlotKey } from '../../kitchen/model/slots';

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
  const zones = powerZones(game, spot.id);
  // 방치 낚시 배수: 표시값(applied)은 추첨이 실제로 곱하는 값 그대로다. required는 요구 파워에서의 배수.
  const now = commonWeightMultiplier('auto', currentPower, spot.id, zones.mult);
  return {
    speed: moveSpeed(game, movement),
    axes: rodAxes(game),
    boatName: boatNameOf(game.boat),
    spot,
    requirement,
    requirementLevel: minLevelOfPower(requirement),
    effectiveBite: effectiveBite(game, spot.id),
    idle: {
      required: commonWeightMultiplier('auto', requirement, spot.id, 1).idle,
      current: now.idle,
      penalty: now.penalty,
      applied: now.total,
    },
    powerZones: zones,
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
  /** 아직 못 가는 해역을 하나 더 여는 가장 낮은 배 단계. 모두 갈 수 있으면 null */
  nextBoat: number | null;
}

/** 지역마다 지금 배로 갈 수 있는 해역 수와 다음에 필요한 배 */
export function selectReachableZones(game: GameState): ReachableZone[] {
  return ZONE_IDS.map(zone => {
    const spots = SPOTS.filter(spot => zoneOf(spot) === zone);
    const closed = spots.filter(spot => spot.boatTier > game.boat);
    const nextBoat = closed.length > 0 ? Math.min(...closed.map(spot => spot.boatTier)) : null;
    return { zone, name: zoneById(zone)?.name ?? zone, open: spots.length - closed.length, total: spots.length, nextBoat };
  }).filter(zone => zone.total > 0);
}

export interface StatsSummary {
  /** 일반 폼으로 한 번이라도 낚은 어종 수 — 랭킹의 도감 완성도와 같은 기준 */
  dexFound: number;
  dexTotal: number;
  bag: BagStatus;
}

/** bagBonus는 서버가 알려 준 길드 가방 용량 보너스다(표시용) */
export function selectStatsSummary(game: GameState, bagBonus = 0): StatsSummary {
  return {
    dexFound: FISH.filter(fish => formDiscovered(game, fish.id, 'normal')).length,
    dexTotal: FISH.length,
    bag: selectBagStatus(game, bagBonus),
  };
}

/** 보너스 갈래 — 화면에 놓이는 순서다 */
export type BonusCategory = 'move' | 'fish' | 'duel' | 'shop';
export const BONUS_CATEGORIES: readonly BonusCategory[] = ['move', 'fish', 'duel', 'shop'];

/** 유물 효과의 종류 - 효과 표와 보너스 줄이 함께 쓴다. 요리 효과(추가 완성 확률)는 유물의 요리 필드에서 온다 */
export type ArtifactEffectKey = keyof ArtifactEffects | 'extraCookChance';

// 요리 추가 완성은 도시락과 미끼 요리가 낚시를 돕는 효과를 늘리므로 낚시 갈래에 둔다
const EFFECT_CATEGORY: Record<ArtifactEffectKey, BonusCategory> = {
  sail: 'move', mutationWeight: 'fish', duelSpeedupCut: 'duel', biteWaitCut: 'fish', extraCookChance: 'fish',
};

/** 길드 보너스의 갈래 — 판매가는 상점, 네임드 조우는 결투, 나머지는 낚시 */
const GUILD_CATEGORY: Record<GuildBonusId, BonusCategory> = {
  sell: 'shop', bag: 'fish', named: 'duel', rare: 'fish', mutation: 'fish',
};

/** 슬롯 효과의 갈래 - 네임드 조우는 결투, 나머지는 낚시 */
const COOK_EFFECT_CATEGORY: Record<keyof CookEffects, BonusCategory> = {
  biteWaitCut: 'fish', rarityWeight: 'fish', mutationWeight: 'fish', namedWeight: 'duel', judgeWidth: 'fish',
};

export type BonusSource =
  /** 유물 보너스 - level은 보유 레벨이고, 효과 문장은 그 레벨의 수치로 쓴다 */
  | { kind: 'relic'; artifact: Artifact; effect: ArtifactEffectKey; level: number }
  /** 길드 보너스 — value는 서버가 알려 준 효과 값이다 */
  | { kind: 'guild'; level: number; bonus: GuildBonusId; value: number }
  /** 슬롯 효과 - 효과가 든 슬롯의 요리 이름이 출처이고, 효과 줄은 부엌 창과 같은 문장이다 */
  | { kind: 'slot'; slot: SlotKey; label: string; effect: RecipeEffectLine };

export interface BonusRow {
  category: BonusCategory;
  source: BonusSource;
  /** 직접 낚을 때만 붙는 효과 — 방치 낚시에는 쓰이지 않는다 */
  manualOnly: boolean;
  /** 방치 낚시에만 붙는 효과 - 직접 낚을 때는 쓰이지 않는다 */
  autoOnly?: boolean;
}

/**
 * 지금 받는 보너스 — 가진 유물의 효과(효과마다 한 줄), 길드 보너스(1단계 이상), 효과가 든 슬롯의 요리 효과(now 기준).
 * 길드 보너스는 서버가 알려 준 레벨과 효과를 보이기만 한다(적용은 서버 액션 경로가 한다).
 * 낚싯대 파워에서 오는 효과(GOOD·PERFECT·방치 배수)는 해역마다 달라 낚싯대 탭의 해역 표가 맡는다.
 */
export function selectActiveBonuses(
  game: GameState,
  guild: { level: number; effects: GuildEffects } | null = null,
  now: string = new Date().toISOString(),
): BonusRow[] {
  const out: BonusRow[] = [];
  for (const artifact of ARTIFACTS) {
    const level = artifactLevelOf(game, artifact.id);
    if (level === 0) continue;
    const effects = artifactEffectsAt(artifact, level);
    for (const effect of Object.keys(effects) as (keyof ArtifactEffects)[]) {
      if (effects[effect] === undefined) continue;
      out.push({ category: EFFECT_CATEGORY[effect], source: { kind: 'relic', artifact, effect, level }, manualOnly: false });
    }
    if (artifactExtraCookChanceAt(artifact, level) > 0) {
      out.push({ category: EFFECT_CATEGORY.extraCookChance, source: { kind: 'relic', artifact, effect: 'extraCookChance', level }, manualOnly: false });
    }
  }
  if (guild) {
    for (const bonus of GUILD_BONUS_IDS) {
      const value = guild.effects[bonus];
      if (value > 0) out.push({ category: GUILD_CATEGORY[bonus], source: { kind: 'guild', level: guild.level, bonus, value }, manualOnly: false });
    }
  }
  for (const key of SLOT_ORDER) {
    const slot = activeSlot(game, key, now);
    if (slot === null) continue;
    for (const effectKey of COOK_EFFECT_KEYS) {
      // 판정 칸(미끼)이 영역 폭을 넓히는 값이 0이면 효과가 없어 줄을 내지 않는다
      if (!slot.recipe.effects[effectKey]) continue;
      const lines = recipeEffectLines({ ...slot.recipe, effects: { [effectKey]: slot.recipe.effects[effectKey] } });
      for (const effect of lines) {
        out.push({
          category: COOK_EFFECT_CATEGORY[effectKey], source: { kind: 'slot', slot: key, label: slot.label, effect },
          manualOnly: key === 'bait', autoOnly: key === 'lunch',
        });
      }
    }
  }
  return out;
}
