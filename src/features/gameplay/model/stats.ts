import { SPOTS } from '../../../game/content/spots';
import type { Spot, SpotId } from '../../../game/content/spots';
import type { RegionId } from '../../../game/content/places';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { COOK_EFFECT_KEYS } from '../../../game/content/cooking';
import type { CookEffects } from '../../../game/content/cooking';
import type { Artifact, ArtifactEffects } from '../../../game/content/artifacts';
import { ZONE_IDS, topZoneOf, topZoneOfSpot, zoneById, zoneGroup } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { commonWeightMultiplier } from '../../../game/rules/actions';
import { achievementBonusContributions, achievementBonusesOf } from '../../../game/rules/achievements';
import { artifactEffectsAt, artifactExtraCookChanceAt, artifactLevelOf } from '../../../game/rules/artifactLevel';
import { MUTATION_WEIGHTS } from '../../../game/rules/balance';
import { biteWaitOf, createPlayerContext, moveSpeedOf } from '../../../game/rules/effects';
import { FISH, RARITY, boatNameOf, formDiscovered } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { GUILD_BONUS_IDS, NO_GUILD_EFFECTS, bonusEffect } from '../../../game/rules/guild';
import type { GuildBonusId, GuildEffects } from '../../../game/rules/guild';
import { activePotionsOf, fortuneOf } from '../../../game/rules/fortune';
import type { DailyFortune, FortuneTarget } from '../../../game/rules/fortune';
import type { Potion } from '../../../game/content/potions';
import type { GuildBonusItem } from '../../../platform/api/types';
import {
  minLevelOfPower, powerZones, rodAxes, rodPower,
} from '../../../game/rules/stats';
import type { Movement } from '../../../game/rules/stats';
import { FORTUNE_KIND } from '../../fortune/model/fortune';
import { GUILD_BONUS_NAME } from '../../guild/model/guild';
import { selectBagStatus } from '../../inventory/model/selectors';
import type { BagStatus } from '../../inventory/model/selectors';
import { NIGHT_UNLOCK_EFFECT_TEXT, recipeEffectLines } from '../../kitchen/model/recipes';
import type { RecipeEffectLine } from '../../kitchen/model/recipes';
import { ALL_SLOT_KEYS, activeSlot } from '../../kitchen/model/slots';
import type { SlotKey } from '../../kitchen/model/slots';

/** 스탯 화면의 처음 수역 인덱스. 사거리 안의 어군 수역이 있으면 그 수역이고, 없으면 현재 구역(또는 지역)에서 현재 파워와 배로 진입 가능한 수역 중 요구 파워가 가장 높은 곳을 고른다. 진입 가능한 곳이 없으면 범위 내 최저 요구 파워 수역으로 폴백한다. */
export function selectInitialStatsSpotIndex(
  region: RegionId,
  current: SpotId | null = null,
  currentZone: ZoneId | null = null,
  power = 0,
  boat = 0,
): number {
  const here = current ? SPOTS.findIndex(spot => spot.id === current) : -1;
  if (here >= 0) return here;
  const targetTopZone = region === 'world' && currentZone && zoneById(currentZone) && zoneGroup(currentZone) === 'world'
    ? topZoneOf(currentZone)
    : null;
  let bestReachable = -1;
  let lowestFallback = -1;
  SPOTS.forEach((spot, index) => {
    const inScope = targetTopZone
      ? topZoneOfSpot(spot.id) === targetTopZone
      : region === 'world' ? spot.region !== 'village' : spot.region === region;
    if (!inScope) return;
    const req = spot.powerReq ?? 0;
    if (lowestFallback < 0 || req < (SPOTS[lowestFallback].powerReq ?? 0)) lowestFallback = index;
    if (power >= req && boat >= spot.boatTier) {
      if (bestReachable < 0 || req >= (SPOTS[bestReachable].powerReq ?? 0)) bestReachable = index;
    }
  });
  if (bestReachable >= 0) return bestReachable;
  return lowestFallback >= 0 ? lowestFallback : 0;
}

/** 선택 수역과 현재 세이브 상태에서 스탯 화면이 표시할 값을 조립한다. 입질 대기에는 now 기준으로 효과가 든 도시락의 단축을 싣는다. */
export function selectStatsModalData(
  game: GameState, movement: Movement, spotIndex: number, now: string = new Date().toISOString(),
) {
  const spot = SPOTS[spotIndex];
  const requirement = spot.powerReq ?? 0;
  const currentPower = rodPower(game);
  const zones = powerZones(game, spot.id);
  // 방치 낚시 배수: 표시값(applied)은 추첨이 실제로 곱하는 값 그대로다. required는 요구 파워에서의 배수.
  const idleMult = commonWeightMultiplier('auto', currentPower, spot.id, zones.mult);
  const ctx = createPlayerContext({
    state: game,
    guild: NO_GUILD_EFFECTS,
    now,
    achievements: achievementBonusesOf(game),
  });
  return {
    speed: moveSpeedOf(ctx, movement, false),
    axes: rodAxes(game),
    boatName: boatNameOf(game.boat),
    spot,
    requirement,
    requirementLevel: minLevelOfPower(requirement),
    effectiveBite: biteWaitOf(ctx, spot.id, 'idle'),
    idle: {
      required: commonWeightMultiplier('auto', requirement, spot.id, 1).idle,
      current: idleMult.idle,
      penalty: idleMult.penalty,
      applied: idleMult.total,
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
export function selectStatsSpotRows(
  game: GameState, movement: Movement, now: string = new Date().toISOString(),
): StatsSpotRow[] {
  return SPOTS.map((spot, spotIndex) => {
    const data = selectStatsModalData(game, movement, spotIndex, now);
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
  sail: 'move', mutationWeight: 'fish', duelSpeedupCut: 'duel', biteWaitCut: 'fish', commonWeightCut: 'fish', bagCap: 'fish', extraCookChance: 'fish',
};

/** 길드 보너스의 갈래 — 판매가는 상점, 네임드 조우는 결투, 나머지는 낚시 */
const GUILD_CATEGORY: Record<GuildBonusId, BonusCategory> = {
  sell: 'shop', bag: 'fish', named: 'duel', rare: 'fish', mutation: 'fish',
};

/** 슬롯 효과의 갈래 - 네임드 조우는 결투, 나머지는 낚시 */
const COOK_EFFECT_CATEGORY: Record<keyof CookEffects, BonusCategory> = {
  biteWaitCut: 'fish', rarityWeight: 'fish', mutationWeight: 'fish', mutationMult: 'fish', namedWeight: 'duel', nightUnlock: 'fish',
};

/** 운세 종류의 갈래 — 대상이 속한 갈래와 같다(희귀 가중치는 낚시, 판매가는 상점, 네임드 조우는 결투) */
const FORTUNE_CATEGORY: Record<DailyFortune['kind'], BonusCategory> = {
  fish: 'fish', gold: 'shop', shadow: 'duel',
};
const POTION_TARGET_CATEGORY: Record<FortuneTarget, BonusCategory> = {
  rarity: 'fish', named: 'duel', sell: 'shop',
};

export type BonusSource =
  /** 유물 보너스 - level은 보유 레벨, scale은 업적 보유 유물 효과 배율(1 + artifactBoost)이다 */
  | { kind: 'relic'; artifact: Artifact; effect: ArtifactEffectKey; level: number; scale: number }
  /** 길드 보너스 — value는 서버가 알려 준 효과 값이다 */
  | {
    kind: 'guild'; level: number; bonus: GuildBonusId; value: number;
    baseRank?: number; enhanceRank?: number; baseValue?: number; enhanceValue?: number;
  }
  /** 슬롯 효과 - 효과가 든 슬롯의 요리 이름이 출처이고, 효과 줄은 부엌 창과 같은 문장이다 */
  | { kind: 'slot'; slot: SlotKey; label: string; effect: RecipeEffectLine }
  /** 업적 누적 보너스 — 단계 도달 즉시 자동 적용되는 합산 보너스 */
  | { kind: 'achievement'; label: string; value: string }
  /** 오늘의 운세 — 그 게임 날짜에 고정된 운 배율. 다른 보너스 다음의 최종 곱이다 */
  | { kind: 'fortune'; fortune: DailyFortune }
  /** 물약 — 그 게임 날짜에 쓴 물약의 운 배율. 오늘의 운세와 합산해 최종 곱한다 */
  | { kind: 'potion'; potion: Potion; target: FortuneTarget; bonus: number };

export interface BonusRow {
  category: BonusCategory;
  source: BonusSource;
  /** 직접 낚을 때만 붙는 효과 — 방치 낚시에는 쓰이지 않는다 */
  manualOnly: boolean;
  /** 방치 낚시에만 붙는 효과 - 직접 낚을 때는 쓰이지 않는다 */
  autoOnly?: boolean;
}

/**
 * 지금 받는 보너스 — 가진 유물의 효과(효과마다 한 줄, 보유 유물 효과 배율 반영), 길드 보너스(1단계 이상), 효과가 든 슬롯의 요리 효과(now 기준), 오늘의 운세(now 기준).
 * 길드 보너스는 서버가 알려 준 레벨과 효과를 보이기만 한다(적용은 서버 액션 경로가 한다).
 * 낚싯대 파워에서 오는 효과(GOOD·PERFECT·방치 배수)는 해역마다 달라 낚싯대 탭의 해역 표가 맡는다.
 */
export function selectActiveBonuses(
  game: GameState,
  guild: { level: number; effects: GuildEffects; bonuses?: readonly GuildBonusItem[] } | null = null,
  now: string = new Date().toISOString(),
): BonusRow[] {
  const out: BonusRow[] = [];
  const ach = achievementBonusesOf(game);
  const relicScale = 1 + ach.artifactBoost;
  for (const artifact of ARTIFACTS) {
    const level = artifactLevelOf(game, artifact.id);
    if (level === 0) continue;
    const effects = artifactEffectsAt(artifact, level);
    for (const effect of Object.keys(effects) as (keyof ArtifactEffects)[]) {
      if (effects[effect] === undefined) continue;
      out.push({ category: EFFECT_CATEGORY[effect], source: { kind: 'relic', artifact, effect, level, scale: relicScale }, manualOnly: false });
    }
    if (artifactExtraCookChanceAt(artifact, level) > 0) {
      out.push({ category: EFFECT_CATEGORY.extraCookChance, source: { kind: 'relic', artifact, effect: 'extraCookChance', level, scale: relicScale }, manualOnly: false });
    }
  }
  if (guild) {
    for (const bonus of GUILD_BONUS_IDS) {
      const value = guild.effects[bonus];
      if (value > 0) {
        const item = guild.bonuses?.find(b => b.id === bonus);
        const detail = item && item.enhanceRank > 0
          ? {
            baseRank: item.rank,
            enhanceRank: item.enhanceRank,
            baseValue: bonusEffect(bonus, item.rank),
            enhanceValue: bonusEffect(bonus, item.enhanceRank),
          }
          : {};
        out.push({ category: GUILD_CATEGORY[bonus], source: { kind: 'guild', level: guild.level, bonus, value, ...detail }, manualOnly: false });
      }
    }
  }
  const seenBaitIds = new Set<string>();
  for (const slotKey of ALL_SLOT_KEYS) {
    const slot = activeSlot(game, slotKey, now);
    if (slot === null) continue;
    if (slot.key === 'bait') {
      if (seenBaitIds.has(slot.recipe.id)) continue;
      seenBaitIds.add(slot.recipe.id);
    }
    for (const effectKey of COOK_EFFECT_KEYS) {
      if (!slot.recipe.effects[effectKey]) continue;
      const lines = recipeEffectLines({ ...slot.recipe, effects: { [effectKey]: slot.recipe.effects[effectKey] } });
      for (const effect of lines) {
        out.push({
          category: COOK_EFFECT_CATEGORY[effectKey], source: { kind: 'slot', slot: slot.key, label: slot.label, effect },
          manualOnly: slot.key === 'bait', autoOnly: slot.key === 'lunch',
        });
      }
    }
  }
  const fmtPct = (v: number, sign: '+' | '−') => {
    const pct = Math.round(v * 1000) / 10;
    return `${sign}${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
  };
  if (ach.moveSpeed > 0) {
    out.push({ category: 'move', source: { kind: 'achievement', label: '항해 속도', value: fmtPct(ach.moveSpeed, '+') }, manualOnly: false });
  }
  if (ach.biteWaitCut > 0) {
    out.push({ category: 'fish', source: { kind: 'achievement', label: '입질 대기', value: fmtPct(ach.biteWaitCut, '−') }, manualOnly: false });
  }
  if (ach.mutationWeight > 0) {
    out.push({ category: 'fish', source: { kind: 'achievement', label: '돌연변이 출현 비중', value: fmtPct(ach.mutationWeight, '+') }, manualOnly: false });
  }
  if (ach.rareWeight > 0) {
    out.push({ category: 'fish', source: { kind: 'achievement', label: '희귀 이상 출현 비중', value: fmtPct(ach.rareWeight, '+') }, manualOnly: false });
  }
  if (ach.epicWeight > 0) {
    out.push({ category: 'fish', source: { kind: 'achievement', label: '영웅 이상 출현 비중', value: fmtPct(ach.epicWeight, '+') }, manualOnly: false });
  }
  if (ach.legendaryWeight > 0) {
    out.push({ category: 'fish', source: { kind: 'achievement', label: '전설 출현 비중', value: fmtPct(ach.legendaryWeight, '+') }, manualOnly: false });
  }
  if (ach.nightWeight > 0) {
    out.push({ category: 'fish', source: { kind: 'achievement', label: '밤 어종 출현 비중', value: fmtPct(ach.nightWeight, '+') }, manualOnly: false });
  }
  if (ach.bagCap > 0) {
    out.push({ category: 'fish', source: { kind: 'achievement', label: '가방 용량', value: fmtPct(ach.bagCap, '+') }, manualOnly: false });
  }
  if (ach.energyYield > 0) {
    out.push({ category: 'fish', source: { kind: 'achievement', label: '기운 획득량', value: fmtPct(ach.energyYield, '+') }, manualOnly: false });
  }
  if (ach.namedWeight > 0) {
    out.push({ category: 'duel', source: { kind: 'achievement', label: '네임드 조우 확률', value: fmtPct(ach.namedWeight, '+') }, manualOnly: false });
  }
  if (ach.sellBonus > 0) {
    out.push({ category: 'shop', source: { kind: 'achievement', label: '판매가 보너스', value: fmtPct(ach.sellBonus, '+') }, manualOnly: false });
  }
  // 오늘의 운세 — 그 게임 날짜의 운세가 고정돼 있을 때만. 운세 종류가 가리키는 대상의 갈래에 한 줄 든다
  const fortune = fortuneOf(game, now);
  if (fortune) {
    out.push({ category: FORTUNE_CATEGORY[fortune.kind], source: { kind: 'fortune', fortune }, manualOnly: false });
  }
  // 활성 비약 — 그 게임 날짜에 사용한 비약의 운 배율 대상을 각 갈래에 한 줄씩 둔다
  for (const potion of activePotionsOf(game.potions, now)) {
    for (const target of ['rarity', 'named', 'sell'] as const) {
      const bonus = potion.effects.luck?.[target];
      if (bonus && bonus > 0) {
        out.push({
          category: POTION_TARGET_CATEGORY[target],
          source: { kind: 'potion', potion, target, bonus },
          manualOnly: false,
        });
      }
    }
  }
  return out;
}

export type BonusScope = 'all' | 'manual' | 'auto';

export interface BonusTipRow {
  label: string;
  value: string;
  divider?: boolean;
}

export interface BonusTableRow {
  id: string;
  category: BonusCategory;
  effect: string;
  scope: BonusScope;
  totalText: string;
  tipRows: BonusTipRow[];
}

const cleanNum = (n: number): number => Math.round(n * 1e9) / 1e9;
const fmtBonusPct = (ratio: number, sign: '+' | '−'): string => {
  const pct = Math.round(ratio * 10_000) / 100;
  return `${sign}${Number(pct.toFixed(2))}%`;
};
const fmtMultNum = (mult: number): string => {
  const rounded = Math.round(mult * 10_000) / 10_000;
  if (rounded === 0.5 || Number.isInteger(rounded)) return String(rounded);
  const two = Math.round(rounded * 100) / 100;
  return Math.abs(rounded - two) < 1e-6 ? rounded.toFixed(2) : String(rounded);
};

interface BonusBucket {
  id: string;
  category: BonusCategory;
  effect: string;
  scope: BonusScope;
  mode: 'add' | 'mult' | 'rule';
  sign: '+' | '−';
  addEntries: { label: string; delta: number; amplifiedDelta: number }[];
  multEntries: { label: string; mult: number }[];
  ruleSources: string[];
}

/** 보너스 탭 합산 행 — 동일 효과·범위·연산 계층을 1줄로 합치고, 툴팁은 [출처] 태그와 합연산→곱연산 내림차순·최종 적용 순으로 만든다 */
export function selectBonusTableRows(
  game: GameState,
  guild: { level: number; effects: GuildEffects; bonuses?: readonly GuildBonusItem[] } | null = null,
  now: string = new Date().toISOString(),
): BonusTableRow[] {
  const ach = achievementBonusesOf(game);
  const buckets = new Map<string, BonusBucket>();

  const getBucket = (
    category: BonusCategory,
    key: string,
    effect: string,
    scope: BonusScope,
    mode: 'add' | 'mult' | 'rule',
    sign: '+' | '−' = '+',
  ): BonusBucket => {
    const id = `${category}:${key}:${scope}:${mode}`;
    let b = buckets.get(id);
    if (!b) {
      b = { id, category, effect, scope, mode, sign, addEntries: [], multEntries: [], ruleSources: [] };
      buckets.set(id, b);
    }
    return b;
  };

  const addMultOnce = (bucket: BonusBucket, label: string, mult: number) => {
    if (!bucket.multEntries.some(e => e.label === label)) {
      bucket.multEntries.push({ label, mult });
    }
  };

  const relicScale = cleanNum(1 + ach.artifactBoost);
  const pushRelic = (category: BonusCategory, key: string, effect: string, sign: '+' | '−', relicName: string, raw: number) => {
    if (raw <= 0) return;
    const b = getBucket(category, key, effect, 'all', 'add', sign);
    b.addEntries.push({
      label: `[유물] ${relicName}`,
      delta: raw,
      amplifiedDelta: cleanNum(raw * relicScale),
    });
    if (ach.artifactBoost > 0) addMultOnce(b, '[업적] 유물 증폭', relicScale);
  };

  for (const artifact of ARTIFACTS) {
    const level = artifactLevelOf(game, artifact.id);
    if (level === 0) continue;
    const e = artifactEffectsAt(artifact, level);
    if (e.sail !== undefined) pushRelic('move', 'sail', '항해 속도', '+', artifact.name, e.sail);
    if (e.duelSpeedupCut !== undefined) pushRelic('duel', 'duelSpeedupCut', '네임드 결투 가속', '−', artifact.name, e.duelSpeedupCut);
    if (e.mutationWeight !== undefined) {
      const ratio = cleanNum(e.mutationWeight.variant / MUTATION_WEIGHTS.variant - 1);
      pushRelic('fish', 'mutationWeight', '돌연변이 출현 비중', '+', artifact.name, ratio);
    }
    if (e.biteWaitCut !== undefined) pushRelic('fish', 'biteWaitCut', '입질 대기', '−', artifact.name, e.biteWaitCut);
    if (e.commonWeightCut !== undefined) pushRelic('fish', 'commonWeightCut', '일반 어종 출현 비중', '−', artifact.name, e.commonWeightCut);
    if (e.bagCap !== undefined) pushRelic('fish', 'bagCap', '가방 용량', '+', artifact.name, e.bagCap);
    const cookChance = artifactExtraCookChanceAt(artifact, level);
    if (cookChance > 0) pushRelic('fish', 'extraCookChance', '요리 추가 완성', '+', artifact.name, cookChance);
  }

  if (guild) {
    const guildMap: Record<GuildBonusId, [BonusCategory, string, string, '+' | '−']> = {
      sell: ['shop', 'sellBonus', '판매가', '+'],
      bag: ['fish', 'bagCap', '가방 용량', '+'],
      named: ['duel', 'namedWeight', '네임드 조우 확률', '+'],
      rare: ['fish', 'commonWeightCut', '일반 어종 출현 비중', '−'],
      mutation: ['fish', 'mutationWeight', '돌연변이 출현 비중', '+'],
    };
    for (const bonus of GUILD_BONUS_IDS) {
      const value = guild.effects[bonus];
      if (value <= 0) continue;
      const [category, key, effect, sign] = guildMap[bonus];
      const item = guild.bonuses?.find(b => b.id === bonus);
      const rankSuffix = item && item.enhanceRank > 0 ? ` (${item.rank + item.enhanceRank}단)` : '';
      const b = getBucket(category, key, effect, 'all', 'add', sign);
      b.addEntries.push({ label: `[길드] ${GUILD_BONUS_NAME[bonus]}${rankSuffix}`, delta: value, amplifiedDelta: value });
    }
  }

  const zoneGroup = {
    rareWeight: { count: 0, delta: 0, labelPrefix: '구역 전설', category: 'fish' as BonusCategory, key: 'rareWeight', effect: '희귀 이상 출현 비중' },
    nightWeight: { count: 0, delta: 0, labelPrefix: '구역 밤 전설', category: 'fish' as BonusCategory, key: 'nightWeight', effect: '밤 어종 출현 비중' },
    mutationWeight: { count: 0, delta: 0, labelPrefix: '구역 돌연변이', category: 'fish' as BonusCategory, key: 'mutationWeight', effect: '돌연변이 출현 비중' },
  };
  for (const contrib of achievementBonusContributions(game)) {
    if (contrib.series.scope === 'zone') {
      if (contrib.series.bonusKind === 'rareWeight' || contrib.series.bonusKind === 'nightWeight' || contrib.series.bonusKind === 'mutationWeight') {
        const g = zoneGroup[contrib.series.bonusKind];
        g.count += 1;
        g.delta = cleanNum(g.delta + contrib.activeDelta);
      }
      continue;
    }
    if (contrib.series.scope !== 'global') continue;
    const kind = contrib.series.bonusKind;
    if (kind === 'baitAmplify' || kind === 'lunchAmplify' || kind === 'artifactBoost') continue;
    const achMap: Partial<Record<typeof kind, [BonusCategory, string, string, '+' | '−']>> = {
      moveSpeed: ['move', 'sail', '항해 속도', '+'],
      biteWaitCut: ['fish', 'biteWaitCut', '입질 대기', '−'],
      mutationWeight: ['fish', 'mutationWeight', '돌연변이 출현 비중', '+'],
      rareWeight: ['fish', 'rareWeight', '희귀 이상 출현 비중', '+'],
      epicWeight: ['fish', 'epicWeight', '영웅 이상 출현 비중', '+'],
      legendaryWeight: ['fish', 'legendaryWeight', '전설 출현 비중', '+'],
      nightWeight: ['fish', 'nightWeight', '밤 어종 출현 비중', '+'],
      bagCap: ['fish', 'bagCap', '가방 용량', '+'],
      energyYield: ['fish', 'energyYield', '기운 획득량', '+'],
      namedWeight: ['duel', 'namedWeight', '네임드 조우 확률', '+'],
      sellBonus: ['shop', 'sellBonus', '판매가', '+'],
    };
    const spec = achMap[kind];
    if (!spec) continue;
    const [category, key, effect, sign] = spec;
    const b = getBucket(category, key, effect, 'all', 'add', sign);
    b.addEntries.push({
      label: `[업적] ${contrib.series.name}`,
      delta: contrib.activeDelta,
      amplifiedDelta: contrib.activeDelta,
    });
  }
  for (const g of Object.values(zoneGroup)) {
    if (g.count > 0 && g.delta > 0) {
      const b = getBucket(g.category, g.key, g.effect, 'all', 'add', '+');
      b.addEntries.push({
        label: `[업적] ${g.labelPrefix} ${g.count}곳`,
        delta: g.delta,
        amplifiedDelta: g.delta,
      });
    }
  }

  const seenBaitIds = new Set<string>();
  for (const slotKey of ALL_SLOT_KEYS) {
    const slot = activeSlot(game, slotKey, now);
    if (slot === null) continue;
    if (slot.key === 'bait') {
      if (seenBaitIds.has(slot.recipe.id)) continue;
      seenBaitIds.add(slot.recipe.id);
    }
    const scope: BonusScope = slot.key === 'lunch' ? 'auto' : 'manual';
    const tag = slot.key === 'lunch' ? '[도시락]' : '[미끼]';
    const ampRatio = slot.key === 'lunch' ? ach.lunchAmplify : ach.baitAmplify;
    const ampScale = cleanNum(1 + ampRatio);
    const ampLabel = slot.key === 'lunch' ? '[업적] 도시락 방치 증폭' : '[업적] 미끼 손맛 증폭';
    const e = slot.recipe.effects;

    if (e.biteWaitCut !== undefined && e.biteWaitCut > 0) {
      const b = getBucket('fish', 'biteWaitCut', '입질 대기', scope, 'add', '−');
      b.addEntries.push({ label: `${tag} ${slot.recipe.name}`, delta: e.biteWaitCut, amplifiedDelta: cleanNum(e.biteWaitCut * ampScale) });
      if (ampRatio > 0) addMultOnce(b, ampLabel, ampScale);
    }
    if (e.rarityWeight !== undefined && e.rarityWeight.bonus > 0) {
      for (const grade of e.rarityWeight.grades) {
        const b = getBucket('fish', `gradeWeight:${grade}`, `${RARITY[grade].name} 어종 출현 비중`, scope, 'add', '+');
        b.addEntries.push({ label: `${tag} ${slot.recipe.name}`, delta: e.rarityWeight.bonus, amplifiedDelta: cleanNum(e.rarityWeight.bonus * ampScale) });
        if (ampRatio > 0) addMultOnce(b, ampLabel, ampScale);
      }
    }
    if (e.mutationWeight !== undefined && e.mutationWeight > 0) {
      const b = getBucket('fish', 'mutationWeight', '돌연변이 출현 비중', scope, 'add', '+');
      b.addEntries.push({ label: `${tag} ${slot.recipe.name}`, delta: e.mutationWeight, amplifiedDelta: cleanNum(e.mutationWeight * ampScale) });
      if (ampRatio > 0) addMultOnce(b, ampLabel, ampScale);
    }
    if (e.mutationMult !== undefined) {
      const b = getBucket('fish', 'mutationMult', '돌연변이 등장', scope, 'mult');
      b.multEntries.push({ label: `${tag} ${slot.recipe.name}`, mult: e.mutationMult });
    }
    if (e.namedWeight !== undefined && e.namedWeight > 0) {
      const b = getBucket('duel', 'namedWeight', '네임드 조우 확률', scope, 'add', '+');
      b.addEntries.push({ label: `${tag} ${slot.recipe.name}`, delta: e.namedWeight, amplifiedDelta: cleanNum(e.namedWeight * ampScale) });
      if (ampRatio > 0) addMultOnce(b, ampLabel, ampScale);
    }
    if (e.nightUnlock === true) {
      const b = getBucket('fish', 'nightUnlock', NIGHT_UNLOCK_EFFECT_TEXT, scope, 'rule');
      b.ruleSources.push(`${tag} ${slot.recipe.name}`);
    }
  }

  const fortune = fortuneOf(game, now);
  if (fortune) {
    const fMap: Record<DailyFortune['kind'], [BonusCategory, string, string]> = {
      fish: ['fish', 'rareWeight', '희귀 이상 출현 비중'],
      gold: ['shop', 'sellBonus', '판매가'],
      shadow: ['duel', 'namedWeight', '네임드 조우 확률'],
    };
    const [category, key, effect] = fMap[fortune.kind];
    const b = getBucket(category, key, effect, 'all', 'mult');
    b.multEntries.push({ label: `[운세] ${FORTUNE_KIND[fortune.kind].name}`, mult: cleanNum(1 + fortune.index / 100) });
  }

  for (const potion of activePotionsOf(game.potions, now)) {
    const pMap: Record<FortuneTarget, [BonusCategory, string, string]> = {
      rarity: ['fish', 'rareWeight', '희귀 이상 출현 비중'],
      named: ['duel', 'namedWeight', '네임드 조우 확률'],
      sell: ['shop', 'sellBonus', '판매가'],
    };
    for (const target of ['rarity', 'named', 'sell'] as const) {
      const bonus = potion.effects.luck?.[target];
      if (bonus && bonus > 0) {
        const [category, key, effect] = pMap[target];
        const b = getBucket(category, key, effect, 'all', 'mult');
        b.multEntries.push({ label: `[비약] ${potion.name}`, mult: cleanNum(1 + bonus) });
      }
    }
  }

  const out: BonusTableRow[] = [];
  for (const category of BONUS_CATEGORIES) {
    for (const b of buckets.values()) {
      if (b.category !== category) continue;
      if (b.mode === 'add') {
        const total = b.addEntries.reduce((sum, e) => cleanNum(sum + e.amplifiedDelta), 0);
        const totalText = fmtBonusPct(total, b.sign);
        const addSorted = [...b.addEntries]
          .sort((a, z) => Math.abs(z.delta) - Math.abs(a.delta))
          .map(e => ({ label: e.label, value: fmtBonusPct(e.delta, b.sign) }));
        const multSorted = [...b.multEntries]
          .sort((a, z) => z.mult - a.mult)
          .map(e => ({ label: e.label, value: `×${fmtMultNum(e.mult)}` }));
        out.push({
          id: b.id,
          category: b.category,
          effect: b.effect,
          scope: b.scope,
          totalText,
          tipRows: [...addSorted, ...multSorted, { label: '최종 적용', value: totalText, divider: true }],
        });
      } else if (b.mode === 'mult') {
        const totalMult = b.multEntries.reduce((prod, e) => cleanNum(prod * e.mult), 1);
        const totalText = `×${fmtMultNum(totalMult)}`;
        const multSorted = [...b.multEntries]
          .sort((a, z) => z.mult - a.mult)
          .map(e => ({ label: e.label, value: `×${fmtMultNum(e.mult)}` }));
        out.push({
          id: b.id,
          category: b.category,
          effect: b.effect,
          scope: b.scope,
          totalText,
          tipRows: [...multSorted, { label: '최종 적용', value: totalText, divider: true }],
        });
      } else {
        out.push({
          id: b.id,
          category: b.category,
          effect: b.effect,
          scope: b.scope,
          totalText: '적용 중',
          tipRows: b.ruleSources.map(src => ({ label: src, value: '적용 중' })),
        });
      }
    }
  }
  return out;
}
