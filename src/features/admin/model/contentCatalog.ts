// 관리자 콘텐츠 카탈로그 모델 — 9개 콘텐츠 축 정본 데이터를 검색·필터·열람 가능한 형태로 묶는다.
// 오프라인/로컬 환경에서도 번들 내 게임 콘텐츠 정본만으로 동작한다.
// game/world/* (대형 마스크 데이터)와 React는 절대 import하지 않는다.
import {
  ACHIEVEMENT_CATALOG,
  CUMULATIVE_BONUS_COUNT,
  CUMULATIVE_BONUS_SERIES,
} from '../../../game/content/achievements';
import type {
  AchievementTab,
  CosmeticKind,
  CumulativeBonusKind,
} from '../../../game/content/achievements';
import {
  ARTIFACT_LEVEL_COEF,
  ARTIFACT_MAX_LEVEL,
  ARTIFACTS,
  artifactHasLevel,
  artifactLevelCost,
} from '../../../game/content/artifacts';
import type { Artifact } from '../../../game/content/artifacts';
import { BOATS, WALK_BAG_CAP, boatNameOf } from '../../../game/content/boats';
import { BOUNTIES, BOUNTY_PORT_ZONE, BOUNTY_ZONES, portOfZone } from '../../../game/content/bounties';
import type { BountyDifficulty, BountyKind, BountyZone } from '../../../game/content/bounties';
import {
  AUTO_ENERGY_BOAT,
  COOK_KIND_RULES,
  COOK_STORAGE_CAP,
  COOKING_UNLOCK_BOAT,
  ENERGY_ITEM_IDS,
  RECIPES,
} from '../../../game/content/cooking';
import type { CookKind, Recipe } from '../../../game/content/cooking';
import { FISH } from '../../../game/content/fish';
import type { Fish, FishShape } from '../../../game/content/fish';
import { NAMED, namedFishOf } from '../../../game/content/named';
import { BASE_REGION, SALE_BASES } from '../../../game/content/places';
import type { BaseId, RegionId } from '../../../game/content/places';
import { DISPLAY_GRADE, RARITY, RARITY_ORDER, displayGradeRank } from '../../../game/content/rarity';
import type { DisplayGradeId, RarityId } from '../../../game/content/rarity';
import { FISH_SPRITES, FISH_SPRITES_GENERATED, spriteKey } from '../../../game/content/sprites/index';
import { SPOTS, spotById } from '../../../game/content/spots';
import type { SpotId } from '../../../game/content/spots';
import {
  DEFAULT_LOOK,
  HATS,
  LOOK_PRESETS,
  PANTS_COLORS,
  SHIRT_COLORS,
} from '../../../game/content/wardrobe';
import type { Hat, HatSource, Look } from '../../../game/content/wardrobe';
import {
  ZONE_IDS,
  ZONES,
  subtreeSpots,
  topZoneOf,
  topZoneOfSpot,
  zoneById,
  zoneControls,
  zoneGroup,
  zoneOfSpot,
  zoneTips,
} from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { artifactEffectsAt, artifactExtraCookChanceAt } from '../../../game/rules/artifactLevel';
import {
  BIG_CATCH_PERCENTILE,
  MUTATION_WEIGHTS,
  NIGHT_FISH_WEIGHT,
  VARIANT_PRICE_MULT,
} from '../../../game/rules/balance';
import { isBigSize, priceOf, sizeParams } from '../../../game/rules/logic';
import { minLevelOfPower } from '../../../game/rules/stats';
import { gradeName } from '../../../shared/lib/gradeName';

export type CatalogFishArtStyle = 'v1' | 'v2';

export type ContentAxisId =
  | 'fish'
  | 'named'
  | 'artifacts'
  | 'achievements'
  | 'wardrobe'
  | 'cooking'
  | 'boats'
  | 'zones'
  | 'bounties';

export interface ContentAxisMeta {
  id: ContentAxisId;
  label: string;
  count: number;
  summary: string;
}

export interface CatalogFilter {
  query?: string;
  zone?: ZoneId | 'all';
  rarity?: RarityId | 'all';
  nightOnly?: boolean;
}

// ── 1. 어종 ──

export interface FishArtSupport {
  v1: boolean;
  v2NormalSource: 'hand' | 'generated' | 'shapeFallback';
  v2HasNormalSprite: boolean;
  v2HasVariantSprite: boolean;
}

export interface FishSizeRange {
  min: number;
  max: number;
  mean: number;
  std: number;
  bigThreshold: number;
  bigPercentile: number;
}

export interface FishCatalogItem {
  fish: Fish;
  id: string;
  name: string;
  rarity: RarityId;
  rarityName: string;
  rarityOrder: number;
  spotId: SpotId;
  spotName: string;
  zoneId: ZoneId;
  zoneName: string;
  night: boolean;
  price: number;
  variantPrice: number;
  variantMult: number;
  baseWeight: number;
  effectiveNightWeight: number;
  shape: FishShape;
  color: string;
  lore: string;
  variant: {
    name: string;
    color: string;
    lore: string;
    price: number;
  };
  sizeRange: FishSizeRange;
  artSupport: FishArtSupport;
}

// ── 2. 네임드 ──

export interface NamedCatalogItem {
  id: string;
  name: string;
  spriteFish: Fish;
  zones: readonly { id: BountyZone; name: string }[];
  primaryZoneId: BountyZone;
  spotId: SpotId | null;
  spotName: string | null;
  placeLabel: string;
  hp: number;
  duelSpeedup: number;
  bountyRewardGold: number | null;
  rewardArtifact: {
    id: string;
    name: string;
    grade: RarityId;
    gradeLabel: string;
    materialId: string;
    materialName: string;
  } | null;
  lore: string;
  poster: string;
  trace: string;
  chronicle: readonly string[];
  artSupport: {
    v1: boolean;
    v2HasSprite: boolean;
  };
}

// ── 3. 유물 ──

export interface ArtifactLevelRow {
  level: number;
  coef: number;
  upgradeMaterialCost: number | null;
  effectLines: readonly string[];
  summary: string;
}

export interface ArtifactCatalogItem {
  id: string;
  name: string;
  grade: RarityId;
  gradeLabel: string;
  displayName: string;
  zoneId: BountyZone;
  zoneName: string;
  namedId: string;
  namedName: string;
  materialId: string;
  materialName: string;
  lore: string;
  hasLevels: boolean;
  exchangeCost: number;
  systemBonusLine: string | null;
  systemPenaltyLine: string | null;
  levels: readonly ArtifactLevelRow[];
}

// ── 4. 업적 + 누적 보너스 ──

export interface AchievementCatalogItem {
  id: string;
  tab: Exclude<AchievementTab, 'bonus'>;
  tabLabel: string;
  cosmeticKind: CosmeticKind | null;
  cosmeticKindLabel: string | null;
  name: string;
  desc: string;
  zoneId: ZoneId | null;
  zoneName: string | null;
  spotId: SpotId | null;
  spotName: string | null;
  metricKind: string;
  conditionSummary: string;
  target: number;
  rewardKind: 'gold' | 'hat';
  rewardGold: number | null;
  hatId: string | null;
  hatName: string | null;
  rewardLabel: string;
}

export interface BonusStepCatalogItem {
  id: string;
  threshold: number;
  label: string;
  delta: number;
  deltaLabel: string;
  cumulativeDelta: number;
  cumulativeLabel: string;
}

export interface BonusSeriesCatalogItem {
  id: string;
  name: string;
  desc: string;
  scope: 'global' | 'zone';
  zoneId: ZoneId | null;
  zoneName: string | null;
  bonusKind: CumulativeBonusKind;
  bonusKindLabel: string;
  unit: string;
  tierCount: number;
  metricSummary: string;
  steps: readonly BonusStepCatalogItem[];
  maxBonusLabel: string;
}

// ── 5. 모자 + 의상 ──

export interface HatCatalogItem {
  hat: Hat;
  id: string;
  name: string;
  source: HatSource;
  sourceLabel: string;
  price: number;
  color: string;
  accentColor: string | null;
  achievementId: string | null;
  achievementName: string | null;
  achievementDesc: string | null;
  zoneId: ZoneId | null;
  zoneName: string | null;
}

export interface LookPresetItem {
  name: string;
  shirt: number;
  pants: number;
  shirtHex: string;
  pantsHex: string;
}

export interface WardrobeCatalog {
  hats: readonly HatCatalogItem[];
  shopHatCount: number;
  achievementHatCount: number;
  shirtColors: readonly string[];
  pantsColors: readonly string[];
  presets: readonly LookPresetItem[];
  defaultLook: Look;
}

// ── 6. 요리 + 생명의 기운 ──

export interface RecipeCostItem {
  grade: RarityId;
  gradeName: string;
  amount: number;
}

export interface RecipeEffectItem {
  label: string;
  value: string;
}

export interface RecipeCatalogItem {
  recipe: Recipe;
  id: string;
  name: string;
  kind: CookKind;
  kindLabel: string;
  grade: DisplayGradeId | null;
  gradeLabel: string | null;
  displayName: string;
  description: string;
  waitMin: number;
  slotMin: number;
  costItems: readonly RecipeCostItem[];
  costSummary: string;
  effectLines: readonly RecipeEffectItem[];
  nightUnlock: boolean;
}

export interface EnergyCatalogItem {
  id: string;
  grade: RarityId;
  gradeName: string;
  displayName: string;
  color: string;
  sourceSummary: string;
}

export interface CookingCatalog {
  recipes: readonly RecipeCatalogItem[];
  lunchCount: number;
  baitCount: number;
  energies: readonly EnergyCatalogItem[];
  meta: {
    unlockBoatTier: number;
    unlockBoatName: string;
    autoEnergyBoatTier: number;
    autoEnergyBoatName: string;
    storageCap: number;
  };
}

// ── 7. 배 ──

export interface BoatCatalogItem {
  tier: number;
  name: string;
  price: number;
  fameReq: number;
  speed: number;
  bagCap: number;
  autoEnergy: boolean;
  unlockZones: readonly string[];
}

// ── 8. 구역·해역·거점 ──

export interface ZoneCatalogItem {
  id: ZoneId;
  name: string;
  shortName: string;
  parentId: ZoneId | null;
  parentName: string | null;
  topZoneId: ZoneId;
  topZoneName: string;
  isTopLevel: boolean;
  group: Extract<RegionId, 'village' | 'world'>;
  groupLabel: string;
  tagline: string;
  lore: string;
  tips: readonly string[];
  controls: readonly string[];
  entryBoat: number | null;
  entryBoatName: string | null;
  gateMsg: string | null;
  spotIds: readonly SpotId[];
  fishCount: number;
  nightFishCount: number;
  minPowerReq: number | null;
  minRodLevel: number | null;
}

export interface SpotCatalogItem {
  id: SpotId;
  name: string;
  zoneId: ZoneId;
  zoneName: string;
  topZoneId: ZoneId;
  topZoneName: string;
  boatTier: number;
  boatName: string;
  powerReq: number;
  minRodLevel: number;
  fishCount: number;
  dayFishCount: number;
  nightFishCount: number;
  rarityCounts: Readonly<Record<RarityId, number>>;
  hasRarityOverride: boolean;
  tagline: string;
  lore: string;
}

export interface BaseCatalogItem {
  id: BaseId;
  name: string;
  region: RegionId;
  regionLabel: string;
  hasSaleFacility: boolean;
  bountyZoneId: BountyZone | null;
  bountyZoneName: string | null;
}

export interface ZoneCatalog {
  zones: readonly ZoneCatalogItem[];
  spots: readonly SpotCatalogItem[];
  bases: readonly BaseCatalogItem[];
}

// ── 9. 현상금 의뢰 ──

export interface BountyCatalogItem {
  id: string;
  zoneId: BountyZone;
  zoneName: string;
  portName: string | null;
  difficulty: BountyDifficulty;
  difficultyLabel: string;
  kind: BountyKind;
  grade: RarityId | null;
  gradeName: string | null;
  targetFishId: string | null;
  targetFishName: string | null;
  targetLabel: string;
  count: number;
  rewardGold: number;
}

export interface ContentCatalog {
  fish: readonly FishCatalogItem[];
  named: readonly NamedCatalogItem[];
  artifacts: readonly ArtifactCatalogItem[];
  achievements: readonly AchievementCatalogItem[];
  bonusSeries: readonly BonusSeriesCatalogItem[];
  cumulativeBonusCount: number;
  wardrobe: WardrobeCatalog;
  cooking: CookingCatalog;
  boats: readonly BoatCatalogItem[];
  walkBagCap: number;
  zones: ZoneCatalog;
  bounties: readonly BountyCatalogItem[];
}

// ── 공통 선택지 ──

export const CATALOG_ZONE_OPTIONS: readonly { id: ZoneId | 'all'; label: string }[] = [
  { id: 'all', label: '전체 구역' },
  ...ZONE_IDS.map(id => ({ id, label: zoneById(id)?.name ?? id })),
];

export const CATALOG_RARITY_OPTIONS: readonly { id: RarityId | 'all'; label: string }[] = [
  { id: 'all', label: '전체 등급' },
  ...RARITY_ORDER.map(id => ({ id, label: RARITY[id].name })),
];

export const CATALOG_ART_STYLES: readonly { id: CatalogFishArtStyle; label: string }[] = [
  { id: 'v2', label: '그림체 v2 (원화·유영)' },
  { id: 'v1', label: '그림체 v1 (절차 도형)' },
];

// ── 내부 헬퍼 ──

const SIZE_SPAN_SIGMA = 3.5;

const BASE_NAMES: Record<BaseId, string> = {
  home: '집',
  harbor: '부산항',
  manila: '마닐라항',
  colombo: '콜롬보항',
  toamasina: '투아마시나항',
  walvisbay: '월비스베이항',
  lisbon: '리스본항',
};

const COSMETIC_KIND_LABELS: Record<CosmeticKind, string> = {
  named: '네임드 토벌',
  night: '밤 어종',
  variant: '돌연변이',
  big: '월척',
  general: '종합·수집',
};

const BONUS_KIND_LABELS: Record<CumulativeBonusKind, string> = {
  biteWaitCut: '입질 대기 감소',
  mutationWeight: '돌연변이 가중치',
  rareWeight: '희귀 이상 가중치',
  epicWeight: '영웅 이상 가중치',
  legendaryWeight: '전설 가중치',
  sellBonus: '판매가 보너스',
  namedWeight: '네임드 조우 가중치',
  moveSpeed: '이동 속도',
  artifactBoost: '유물 효과 배율',
  zoneLegendary: '구역 전설 가중치',
  zoneMutation: '구역 돌연변이 가중치',
};

const DIFFICULTY_LABELS: Record<BountyDifficulty, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
  named: '네임드',
};

const fmtDecimal = (n: number): string => String(Number(n.toFixed(2)));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 이진 탐색으로 어종의 월척(상위 BIG_CATCH_PERCENTILE%) 최소 크기(cm)를 구한다 */
function computeBigThreshold(fish: Fish): number {
  const { mean, std } = sizeParams(fish);
  let lo = mean;
  let hi = mean + std * 3;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (isBigSize(fish, mid)) hi = mid;
    else lo = mid;
  }
  return round1(Math.ceil(hi * 10) / 10);
}

function buildFishSizeRange(fish: Fish): FishSizeRange {
  const { mean, std } = sizeParams(fish);
  return {
    min: round1(Math.max(1, mean - SIZE_SPAN_SIGMA * std)),
    max: round1(mean + SIZE_SPAN_SIGMA * std),
    mean: round1(mean),
    std: round1(std),
    bigThreshold: computeBigThreshold(fish),
    bigPercentile: BIG_CATCH_PERCENTILE,
  };
}

function buildFishArtSupport(fish: Fish): FishArtSupport {
  const normalHand = Boolean(FISH_SPRITES[fish.id]);
  const normalGen = Boolean(FISH_SPRITES_GENERATED[fish.id]);
  const variantKey = spriteKey(fish.id, 'variant');
  const v2HasVariantSprite = Boolean(FISH_SPRITES[variantKey] ?? FISH_SPRITES_GENERATED[variantKey]);
  return {
    v1: true,
    v2NormalSource: normalHand ? 'hand' : normalGen ? 'generated' : 'shapeFallback',
    v2HasNormalSprite: normalHand || normalGen,
    v2HasVariantSprite,
  };
}

function formatArtifactEffects(art: Artifact, level: number): string[] {
  const e = artifactEffectsAt(art, level);
  const lines: string[] = [];
  if ((e.sail ?? 0) > 0) lines.push(`항해 속도 +${fmtDecimal(e.sail! * 100)}%`);
  if ((e.duelSpeedupCut ?? 0) > 0) lines.push(`네임드 결투 가속 −${fmtDecimal(e.duelSpeedupCut! * 100)}%`);
  if (e.mutationWeight !== undefined) {
    const pct = (e.mutationWeight.variant / MUTATION_WEIGHTS.variant - 1) * 100;
    lines.push(`돌연변이 가중치 +${fmtDecimal(pct)}%`);
  }
  if ((e.biteWaitCut ?? 0) > 0) lines.push(`입질 대기 −${fmtDecimal(e.biteWaitCut! * 100)}%`);
  if ((e.commonWeightCut ?? 0) > 0) lines.push(`일반 등급 가중치 −${fmtDecimal(e.commonWeightCut! * 100)}%`);
  if ((e.bagCap ?? 0) > 0) lines.push(`가방 용량 +${fmtDecimal(e.bagCap! * 100)}%`);
  const cookChance = artifactExtraCookChanceAt(art, level);
  if (cookChance > 0) lines.push(`요리 추가 완성 +${fmtDecimal(cookChance * 100)}%p`);
  if (art.system) {
    if ((art.system.namedCapBonus ?? 0) > 0) lines.push(`네임드 토벌 하루 +${art.system.namedCapBonus}회`);
    if ((art.system.namedRewardCut ?? 0) > 0) lines.push(`네임드 토벌 골드 −${fmtDecimal(art.system.namedRewardCut! * 100)}%`);
    if ((art.system.extraBaitSlots ?? 0) > 0) lines.push(`미끼 슬롯 +${art.system.extraBaitSlots}칸`);
    if ((art.system.baitDurationCut ?? 0) > 0) lines.push(`미끼 지속 시간 −${fmtDecimal(art.system.baitDurationCut! * 100)}%`);
  }
  return lines;
}

function recipeDisplayGrade(recipe: Recipe): DisplayGradeId | null {
  if (recipe.kind !== 'bait') return null;
  const weighted = recipe.effects.rarityWeight?.grades[0];
  if (weighted !== undefined) return weighted;
  return recipe.effects.mutationWeight !== undefined || recipe.effects.nightUnlock === true ? 'special' : null;
}

function buildRecipeEffectItems(recipe: Recipe): RecipeEffectItem[] {
  const e = recipe.effects;
  const items: RecipeEffectItem[] = [];
  if (e.biteWaitCut !== undefined) items.push({ label: '입질 대기', value: `−${fmtDecimal(e.biteWaitCut * 100)}%` });
  if (e.rarityWeight !== undefined) {
    for (const g of e.rarityWeight.grades) {
      items.push({ label: `${RARITY[g].name} 등급 가중치`, value: `+${fmtDecimal(e.rarityWeight.bonus * 100)}%` });
    }
  }
  if (e.mutationWeight !== undefined) items.push({ label: '돌연변이 폼 가중치', value: `+${fmtDecimal(e.mutationWeight * 100)}%` });
  if (e.namedWeight !== undefined) items.push({ label: '네임드 조우 가중치', value: `+${fmtDecimal(e.namedWeight * 100)}%` });
  if (e.nightUnlock === true) items.push({ label: '밤 어종 출현', value: '밤 전용 어종 합류' });
  return items;
}

function formatBonusDelta(kind: CumulativeBonusKind, value: number): string {
  const pct = fmtDecimal(value * 100);
  if (kind === 'biteWaitCut') return `−${pct}%`;
  return `+${pct}%`;
}

// ── 카탈로그 조립 ──

export function buildContentCatalog(): ContentCatalog {
  const fishItems: FishCatalogItem[] = FISH.map(f => {
    const spot = spotById(f.spot);
    const zoneId = topZoneOfSpot(f.spot) ?? 'village';
    const zone = zoneById(zoneId);
    const variantPrice = priceOf(f, 'variant');
    return {
      fish: f,
      id: f.id,
      name: f.name,
      rarity: f.rarity,
      rarityName: RARITY[f.rarity].name,
      rarityOrder: RARITY[f.rarity].order,
      spotId: f.spot,
      spotName: spot?.name ?? f.spot,
      zoneId,
      zoneName: zone?.name ?? zoneId,
      night: f.night === true,
      price: f.price,
      variantPrice,
      variantMult: VARIANT_PRICE_MULT,
      baseWeight: f.weight ?? 1,
      effectiveNightWeight: f.weight ?? (f.night ? NIGHT_FISH_WEIGHT : 1),
      shape: f.shape,
      color: f.color,
      lore: f.lore,
      variant: {
        name: f.variant.name,
        color: f.variant.color,
        lore: f.variant.lore,
        price: variantPrice,
      },
      sizeRange: buildFishSizeRange(f),
      artSupport: buildFishArtSupport(f),
    };
  });

  const namedItems: NamedCatalogItem[] = NAMED.map(n => {
    const zones = n.zones.map(zid => ({ id: zid, name: zoneById(zid)?.name ?? zid }));
    const spotName = n.spot ? (spotById(n.spot)?.name ?? n.spot) : null;
    const zoneLabel = zones.map(z => z.name).join(' · ');
    const art = ARTIFACTS.find(a => a.namedId === n.id) ?? null;
    const quest = BOUNTIES.find(q => q.difficulty === 'named' && q.targetFish === n.id) ?? null;
    return {
      id: n.id,
      name: n.name,
      spriteFish: namedFishOf(n),
      zones,
      primaryZoneId: n.zones[0],
      spotId: n.spot ?? null,
      spotName,
      placeLabel: spotName ? `${zoneLabel} · ${spotName}` : `${zoneLabel} 전역`,
      hp: n.hp,
      duelSpeedup: n.duelSpeedup ?? 1,
      bountyRewardGold: quest?.reward ?? null,
      rewardArtifact: art ? {
        id: art.id,
        name: art.name,
        grade: art.grade,
        gradeLabel: RARITY[art.grade].name,
        materialId: art.materialId,
        materialName: art.materialName,
      } : null,
      lore: n.lore,
      poster: n.poster,
      trace: n.trace,
      chronicle: [...n.chronicle],
      artSupport: {
        v1: true,
        v2HasSprite: Boolean(FISH_SPRITES[n.id] ?? FISH_SPRITES_GENERATED[n.id]),
      },
    };
  });

  const namedNameMap = new Map(NAMED.map(n => [n.id, n.name] as const));

  const artifactItems: ArtifactCatalogItem[] = ARTIFACTS.map(a => {
    const hasLevels = artifactHasLevel(a);
    const levels: ArtifactLevelRow[] = Array.from({ length: ARTIFACT_MAX_LEVEL }, (_, idx) => {
      const level = idx + 1;
      const coef = hasLevels ? ARTIFACT_LEVEL_COEF[idx] : 1;
      const effectLines = formatArtifactEffects(a, level);
      const upgradeMaterialCost = level === 1 ? 1 : hasLevels ? artifactLevelCost(level) : null;
      return {
        level,
        coef,
        upgradeMaterialCost,
        effectLines,
        summary: effectLines.join(' · '),
      };
    });
    const sysBonuses = [
      (a.system?.namedCapBonus ?? 0) > 0 ? `네임드 토벌 하루 +${a.system!.namedCapBonus}회` : null,
      (a.system?.extraBaitSlots ?? 0) > 0 ? `미끼 슬롯 +${a.system!.extraBaitSlots}칸` : null,
    ].filter((x): x is string => x !== null);
    const sysPenalties = [
      (a.system?.namedRewardCut ?? 0) > 0 ? `네임드 토벌 골드 −${fmtDecimal(a.system!.namedRewardCut! * 100)}%` : null,
      (a.system?.baitDurationCut ?? 0) > 0 ? `미끼 지속 시간 −${fmtDecimal(a.system!.baitDurationCut! * 100)}%` : null,
    ].filter((x): x is string => x !== null);
    return {
      id: a.id,
      name: a.name,
      grade: a.grade,
      gradeLabel: RARITY[a.grade].name,
      displayName: gradeName(a.name, RARITY[a.grade].name),
      zoneId: a.zone,
      zoneName: zoneById(a.zone)?.name ?? a.zone,
      namedId: a.namedId,
      namedName: namedNameMap.get(a.namedId) ?? a.namedId,
      materialId: a.materialId,
      materialName: a.materialName,
      lore: a.lore,
      hasLevels,
      exchangeCost: 1,
      systemBonusLine: sysBonuses.length > 0 ? sysBonuses.join(', ') : null,
      systemPenaltyLine: sysPenalties.length > 0 ? sysPenalties.join(', ') : null,
      levels,
    };
  });

  const hatByIdMap = new Map(HATS.map(h => [h.id, h] as const));

  const achievementItems: AchievementCatalogItem[] = ACHIEVEMENT_CATALOG.map(({ rule, target, def }) => {
    const zoneId = def.zone ?? (def.spot ? topZoneOfSpot(def.spot) ?? null : null);
    const zoneName = zoneId ? (zoneById(zoneId)?.name ?? zoneId) : null;
    const spotName = def.spot ? (spotById(def.spot)?.name ?? def.spot) : null;
    const hatName = def.reward.kind === 'hat' ? (hatByIdMap.get(def.reward.hatId)?.name ?? def.reward.hatId) : null;
    return {
      id: def.id,
      tab: def.tab,
      tabLabel: def.tab === 'progress' ? '진행' : '치장',
      cosmeticKind: def.cosmeticKind ?? null,
      cosmeticKindLabel: def.cosmeticKind ? COSMETIC_KIND_LABELS[def.cosmeticKind] : null,
      name: def.name,
      desc: def.desc,
      zoneId,
      zoneName,
      spotId: def.spot ?? null,
      spotName,
      metricKind: rule.metric.kind,
      conditionSummary: def.desc,
      target,
      rewardKind: def.reward.kind,
      rewardGold: def.reward.kind === 'gold' ? def.reward.gold : null,
      hatId: def.reward.kind === 'hat' ? def.reward.hatId : null,
      hatName,
      rewardLabel: def.reward.kind === 'gold'
        ? `${def.reward.gold.toLocaleString('ko-KR')}G`
        : `모자: ${hatName ?? def.reward.hatId}`,
    };
  });

  const bonusSeriesItems: BonusSeriesCatalogItem[] = CUMULATIVE_BONUS_SERIES.map(series => {
    let acc = 0;
    const steps: BonusStepCatalogItem[] = series.steps.map(step => {
      acc = Math.round((acc + step.delta) * 1e9) / 1e9;
      return {
        id: step.id,
        threshold: step.threshold,
        label: step.label,
        delta: step.delta,
        deltaLabel: formatBonusDelta(series.bonusKind, step.delta),
        cumulativeDelta: acc,
        cumulativeLabel: formatBonusDelta(series.bonusKind, acc),
      };
    });
    const zoneName = series.zone ? (zoneById(series.zone)?.name ?? series.zone) : null;
    const metricSummary = series.metric.kind === 'counter'
      ? series.metric.key
      : series.metric.kind === 'zoneLegendarySum'
        ? `${zoneName ?? series.zone} 수동 전설 합계`
        : '최고 레벨·전설 유물 보유 수';
    return {
      id: series.id,
      name: series.name,
      desc: series.desc,
      scope: series.scope,
      zoneId: series.zone ?? null,
      zoneName,
      bonusKind: series.bonusKind,
      bonusKindLabel: BONUS_KIND_LABELS[series.bonusKind],
      unit: series.unit,
      tierCount: series.tierCount,
      metricSummary,
      steps,
      maxBonusLabel: steps.length > 0 ? steps[steps.length - 1].cumulativeLabel : '—',
    };
  });

  const achByIdMap = new Map(achievementItems.map(a => [a.id, a] as const));

  const hatItems: HatCatalogItem[] = HATS.map(h => {
    const ach = h.achievementId ? achByIdMap.get(h.achievementId) : undefined;
    return {
      hat: h,
      id: h.id,
      name: h.name,
      source: h.source,
      sourceLabel: h.source === 'gold' ? '상점' : '업적',
      price: h.price,
      color: h.color,
      accentColor: h.accentColor ?? null,
      achievementId: h.achievementId ?? null,
      achievementName: ach?.name ?? null,
      achievementDesc: ach?.desc ?? null,
      zoneId: ach?.zoneId ?? null,
      zoneName: ach?.zoneName ?? null,
    };
  });

  const presets: LookPresetItem[] = LOOK_PRESETS.map(p => ({
    name: p.name,
    shirt: p.shirt,
    pants: p.pants,
    shirtHex: SHIRT_COLORS[p.shirt] ?? SHIRT_COLORS[0],
    pantsHex: PANTS_COLORS[p.pants] ?? PANTS_COLORS[0],
  }));

  const recipeItems: RecipeCatalogItem[] = [...RECIPES]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'lunch' ? -1 : 1;
      const ga = recipeDisplayGrade(a);
      const gb = recipeDisplayGrade(b);
      return (ga ? displayGradeRank(ga) : -1) - (gb ? displayGradeRank(gb) : -1);
    })
    .map(r => {
      const grade = recipeDisplayGrade(r);
      const gradeLabel = grade ? DISPLAY_GRADE[grade].name : null;
      const costItems: RecipeCostItem[] = RARITY_ORDER
        .filter(g => (r.cost[g] ?? 0) > 0)
        .map(g => ({ grade: g, gradeName: RARITY[g].name, amount: r.cost[g]! }));
      const rules = COOK_KIND_RULES[r.kind];
      return {
        recipe: r,
        id: r.id,
        name: r.name,
        kind: r.kind,
        kindLabel: r.kind === 'lunch' ? '도시락' : '미끼',
        grade,
        gradeLabel,
        displayName: gradeLabel ? gradeName(r.name, gradeLabel) : r.name,
        description: r.description,
        waitMin: rules.waitMs / 60_000,
        slotMin: rules.slotMs / 60_000,
        costItems,
        costSummary: costItems.map(c => `${c.gradeName} ${c.amount}`).join(' · '),
        effectLines: buildRecipeEffectItems(r),
        nightUnlock: r.effects.nightUnlock === true,
      };
    });

  const energies: EnergyCatalogItem[] = RARITY_ORDER.map(g => ({
    id: ENERGY_ITEM_IDS[g],
    grade: g,
    gradeName: RARITY[g].name,
    displayName: gradeName('생명의 기운', RARITY[g].name),
    color: RARITY[g].color,
    sourceSummary: '물고기 1마리 → 해당 등급 기운 1 (어시장 추출 또는 가공 플랜트선 자동 변환)',
  }));

  const boatItems: BoatCatalogItem[] = BOATS.map(b => ({
    tier: b.tier,
    name: b.name,
    price: b.price,
    fameReq: b.fameReq,
    speed: b.speed,
    bagCap: b.bagCap,
    autoEnergy: b.tier >= AUTO_ENERGY_BOAT,
    unlockZones: ZONES.filter(z => !z.parent && z.entryBoat === b.tier).map(z => z.name),
  }));

  const spotItems: SpotCatalogItem[] = SPOTS.map(s => {
    const zoneId = zoneOfSpot(s.id) ?? 'village';
    const topId = topZoneOfSpot(s.id) ?? 'village';
    const spotFish = FISH.filter(f => f.spot === s.id);
    const rarityCounts: Record<RarityId, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    let nightFishCount = 0;
    for (const f of spotFish) {
      rarityCounts[f.rarity]++;
      if (f.night) nightFishCount++;
    }
    const z = zoneById(zoneId);
    const powerReq = s.powerReq ?? 0;
    return {
      id: s.id,
      name: s.name,
      zoneId,
      zoneName: z?.name ?? zoneId,
      topZoneId: topId,
      topZoneName: zoneById(topId)?.name ?? topId,
      boatTier: s.boatTier,
      boatName: boatNameOf(s.boatTier, '배 불필요'),
      powerReq,
      minRodLevel: minLevelOfPower(powerReq),
      fishCount: spotFish.length,
      dayFishCount: spotFish.length - nightFishCount,
      nightFishCount,
      rarityCounts,
      hasRarityOverride: Boolean(s.rarityWeight),
      tagline: z?.tagline ?? '',
      lore: z?.lore ?? '',
    };
  });

  const spotItemMap = new Map(spotItems.map(s => [s.id, s] as const));

  const zoneItems: ZoneCatalogItem[] = ZONES.map(z => {
    const topId = topZoneOf(z.id);
    const topZone = zoneById(topId)!;
    const isTopLevel = !z.parent;
    const relatedSpots = isTopLevel ? subtreeSpots(z.id) : z.spots.map(id => spotById(id)!).filter(Boolean);
    const relatedFish = FISH.filter(f => relatedSpots.some(s => s.id === f.spot));
    const powers = relatedSpots.map(s => s.powerReq ?? 0).filter(p => p > 0);
    const minPowerReq = powers.length > 0 ? Math.min(...powers) : null;
    const group = zoneGroup(z.id);
    const entryBoat = z.entryBoat ?? topZone.entryBoat ?? null;
    return {
      id: z.id,
      name: z.name,
      shortName: z.shortName,
      parentId: z.parent ?? null,
      parentName: z.parent ? (zoneById(z.parent)?.name ?? z.parent) : null,
      topZoneId: topId,
      topZoneName: topZone.name,
      isTopLevel,
      group,
      groupLabel: group === 'village' ? '마을' : '대양',
      tagline: z.tagline,
      lore: z.lore,
      tips: zoneTips(z.id),
      controls: zoneControls(z.id),
      entryBoat,
      entryBoatName: entryBoat !== null ? boatNameOf(entryBoat) : null,
      gateMsg: z.gateMsg ?? null,
      spotIds: relatedSpots.map(s => s.id),
      fishCount: relatedFish.length,
      nightFishCount: relatedFish.filter(f => f.night === true).length,
      minPowerReq,
      minRodLevel: minPowerReq !== null ? minLevelOfPower(minPowerReq) : null,
    };
  });

  // spotItemMap 참조 확인(미사용 경고 방지 겸 향후 교차 검증)
  void spotItemMap;

  const baseItems: BaseCatalogItem[] = (Object.keys(BASE_REGION) as BaseId[]).map(id => {
    const region = BASE_REGION[id];
    const bountyZoneId = (BOUNTY_PORT_ZONE as Record<string, BountyZone | undefined>)[id] ?? null;
    return {
      id,
      name: BASE_NAMES[id],
      region,
      regionLabel: region === 'village' ? '마을' : '대양',
      hasSaleFacility: SALE_BASES[id],
      bountyZoneId,
      bountyZoneName: bountyZoneId ? (zoneById(bountyZoneId)?.name ?? bountyZoneId) : null,
    };
  });

  const bountyItems: BountyCatalogItem[] = BOUNTIES.map(q => {
    const port = portOfZone(q.zone);
    const gradeLabel = q.grade ? RARITY[q.grade].name : null;
    const targetFishName = q.targetFish ? (namedNameMap.get(q.targetFish) ?? q.targetFish) : null;
    return {
      id: q.id,
      zoneId: q.zone,
      zoneName: zoneById(q.zone)?.name ?? q.zone,
      portName: port ? BASE_NAMES[port] : null,
      difficulty: q.difficulty,
      difficultyLabel: DIFFICULTY_LABELS[q.difficulty],
      kind: q.difficulty === 'named' ? 'named' : 'general',
      grade: q.grade,
      gradeName: gradeLabel,
      targetFishId: q.targetFish,
      targetFishName,
      targetLabel: targetFishName ?? (gradeLabel ? `${gradeLabel} 어종` : '—'),
      count: q.count,
      rewardGold: q.reward,
    };
  });

  return {
    fish: fishItems,
    named: namedItems,
    artifacts: artifactItems,
    achievements: achievementItems,
    bonusSeries: bonusSeriesItems,
    cumulativeBonusCount: CUMULATIVE_BONUS_COUNT,
    wardrobe: {
      hats: hatItems,
      shopHatCount: hatItems.filter(h => h.source === 'gold').length,
      achievementHatCount: hatItems.filter(h => h.source === 'achievement').length,
      shirtColors: [...SHIRT_COLORS],
      pantsColors: [...PANTS_COLORS],
      presets,
      defaultLook: { ...DEFAULT_LOOK },
    },
    cooking: {
      recipes: recipeItems,
      lunchCount: recipeItems.filter(r => r.kind === 'lunch').length,
      baitCount: recipeItems.filter(r => r.kind === 'bait').length,
      energies,
      meta: {
        unlockBoatTier: COOKING_UNLOCK_BOAT,
        unlockBoatName: boatNameOf(COOKING_UNLOCK_BOAT),
        autoEnergyBoatTier: AUTO_ENERGY_BOAT,
        autoEnergyBoatName: boatNameOf(AUTO_ENERGY_BOAT),
        storageCap: COOK_STORAGE_CAP,
      },
    },
    boats: boatItems,
    walkBagCap: WALK_BAG_CAP,
    zones: {
      zones: zoneItems,
      spots: spotItems,
      bases: baseItems,
    },
    bounties: bountyItems,
  };
}

export const CONTENT_CATALOG: ContentCatalog = buildContentCatalog();

export const CONTENT_AXES: readonly ContentAxisMeta[] = [
  { id: 'fish', label: '어종·돌연변이', count: CONTENT_CATALOG.fish.length, summary: '어종 원형·돌연변이·크기 범위·그림체 v1/v2' },
  { id: 'named', label: '네임드', count: CONTENT_CATALOG.named.length, summary: '수배서·바다 위 흔적·전승 4문단·결투 체력' },
  { id: 'artifacts', label: '유물', count: CONTENT_CATALOG.artifacts.length, summary: 'Lv1~5 효과 수치·교환 재료·전설 시스템 효과' },
  { id: 'achievements', label: '업적·보너스', count: CONTENT_CATALOG.achievements.length + CONTENT_CATALOG.cumulativeBonusCount, summary: '진행 30 + 치장 41 + 누적 보너스 23계열(25종)' },
  { id: 'wardrobe', label: '모자·의상', count: CONTENT_CATALOG.wardrobe.hats.length, summary: '모자 46종(상점 5·업적 41)·팔레트·프리셋 6종' },
  { id: 'cooking', label: '요리·기운', count: CONTENT_CATALOG.cooking.recipes.length + CONTENT_CATALOG.cooking.energies.length, summary: '도시락 5·미끼 5·생명의 기운 4종' },
  { id: 'boats', label: '배', count: CONTENT_CATALOG.boats.length, summary: '9단계 배 가격·명성·속도·가방·자동 추출' },
  { id: 'zones', label: '구역·해역', count: CONTENT_CATALOG.zones.zones.length, summary: '17개 구역 계층·15개 해역·7개 거점 항구' },
  { id: 'bounties', label: '현상금 의뢰', count: CONTENT_CATALOG.bounties.length, summary: `${BOUNTY_ZONES.length}개 해역 일반·네임드 의뢰 표` },
];

// ── 검색·필터 함수 ──

function normalizeQuery(query?: string): string {
  return (query ?? '').trim().toLowerCase();
}

function matchesQuery(q: string, fields: readonly (string | number | null | undefined)[]): boolean {
  if (!q) return true;
  return fields.some(f => f !== null && f !== undefined && String(f).toLowerCase().includes(q));
}

function matchesZoneFilter(targetZone: ZoneId | null, filterZone?: ZoneId | 'all'): boolean {
  if (!filterZone || filterZone === 'all') return true;
  if (!targetZone) return false;
  return topZoneOf(targetZone) === topZoneOf(filterZone);
}

export function filterFishCatalog(
  items: readonly FishCatalogItem[],
  filter: CatalogFilter,
): FishCatalogItem[] {
  const q = normalizeQuery(filter.query);
  return items.filter(it => {
    if (filter.nightOnly && !it.night) return false;
    if (filter.rarity && filter.rarity !== 'all' && it.rarity !== filter.rarity) return false;
    if (!matchesZoneFilter(it.zoneId, filter.zone)) return false;
    return matchesQuery(q, [
      it.id, it.name, it.lore, it.variant.name, it.variant.lore, it.spotName, it.zoneName, it.rarityName,
    ]);
  });
}

export function filterNamedCatalog(
  items: readonly NamedCatalogItem[],
  filter: CatalogFilter,
): NamedCatalogItem[] {
  const q = normalizeQuery(filter.query);
  if (filter.nightOnly) return [];
  if (filter.rarity && filter.rarity !== 'all' && filter.rarity !== 'legendary') return [];
  return items.filter(it => {
    if (filter.zone && filter.zone !== 'all') {
      const top = topZoneOf(filter.zone);
      if (!it.zones.some(z => z.id === top)) return false;
    }
    return matchesQuery(q, [
      it.id, it.name, it.placeLabel, it.lore, it.poster, it.trace,
      it.rewardArtifact?.name, ...it.chronicle,
    ]);
  });
}

export function filterArtifactCatalog(
  items: readonly ArtifactCatalogItem[],
  filter: CatalogFilter,
): ArtifactCatalogItem[] {
  const q = normalizeQuery(filter.query);
  if (filter.nightOnly) return [];
  return items.filter(it => {
    if (filter.rarity && filter.rarity !== 'all' && it.grade !== filter.rarity) return false;
    if (!matchesZoneFilter(it.zoneId, filter.zone)) return false;
    return matchesQuery(q, [
      it.id, it.name, it.displayName, it.zoneName, it.namedName, it.materialName, it.lore,
      ...it.levels.flatMap(l => l.effectLines),
    ]);
  });
}

export function filterAchievementCatalog(
  items: readonly AchievementCatalogItem[],
  filter: CatalogFilter,
): AchievementCatalogItem[] {
  const q = normalizeQuery(filter.query);
  return items.filter(it => {
    if (filter.nightOnly && it.cosmeticKind !== 'night') return false;
    if (!matchesZoneFilter(it.zoneId, filter.zone)) return false;
    return matchesQuery(q, [
      it.id, it.name, it.desc, it.zoneName, it.spotName, it.hatName, it.rewardLabel,
    ]);
  });
}

export function filterBonusSeriesCatalog(
  items: readonly BonusSeriesCatalogItem[],
  filter: CatalogFilter,
): BonusSeriesCatalogItem[] {
  const q = normalizeQuery(filter.query);
  if (filter.nightOnly) return [];
  return items.filter(it => {
    if (filter.zone && filter.zone !== 'all') {
      if (it.scope !== 'zone' || !matchesZoneFilter(it.zoneId, filter.zone)) return false;
    }
    return matchesQuery(q, [
      it.id, it.name, it.desc, it.zoneName, it.bonusKindLabel, it.metricSummary,
    ]);
  });
}

export function filterHatCatalog(
  items: readonly HatCatalogItem[],
  filter: CatalogFilter,
): HatCatalogItem[] {
  const q = normalizeQuery(filter.query);
  return items.filter(it => {
    if (filter.nightOnly && !(it.achievementId ?? '').includes('night')) return false;
    if (filter.zone && filter.zone !== 'all' && !matchesZoneFilter(it.zoneId, filter.zone)) return false;
    return matchesQuery(q, [
      it.id, it.name, it.sourceLabel, it.achievementName, it.achievementDesc, it.zoneName,
    ]);
  });
}

export function filterRecipeCatalog(
  items: readonly RecipeCatalogItem[],
  filter: CatalogFilter,
): RecipeCatalogItem[] {
  const q = normalizeQuery(filter.query);
  return items.filter(it => {
    if (filter.nightOnly && !it.nightUnlock) return false;
    if (filter.rarity && filter.rarity !== 'all') {
      const hasGrade = it.grade === filter.rarity || it.costItems.some(c => c.grade === filter.rarity);
      if (!hasGrade) return false;
    }
    return matchesQuery(q, [
      it.id, it.name, it.displayName, it.kindLabel, it.description, it.costSummary,
      ...it.effectLines.map(e => `${e.label} ${e.value}`),
    ]);
  });
}

export function filterBoatCatalog(
  items: readonly BoatCatalogItem[],
  filter: CatalogFilter,
): BoatCatalogItem[] {
  const q = normalizeQuery(filter.query);
  if (filter.nightOnly) return [];
  return items.filter(it => matchesQuery(q, [
    it.tier, `${it.tier}단계`, it.name, ...it.unlockZones, it.autoEnergy ? '자동 기운 추출' : '',
  ]));
}

export function filterZoneCatalog(
  items: readonly ZoneCatalogItem[],
  filter: CatalogFilter,
): ZoneCatalogItem[] {
  const q = normalizeQuery(filter.query);
  return items.filter(it => {
    if (filter.nightOnly && it.nightFishCount === 0) return false;
    if (filter.zone && filter.zone !== 'all' && it.topZoneId !== topZoneOf(filter.zone)) return false;
    return matchesQuery(q, [
      it.id, it.name, it.shortName, it.parentName, it.tagline, it.lore, ...it.tips,
    ]);
  });
}

export function filterSpotCatalog(
  items: readonly SpotCatalogItem[],
  filter: CatalogFilter,
): SpotCatalogItem[] {
  const q = normalizeQuery(filter.query);
  return items.filter(it => {
    if (filter.nightOnly && it.nightFishCount === 0) return false;
    if (filter.zone && filter.zone !== 'all' && it.topZoneId !== topZoneOf(filter.zone)) return false;
    return matchesQuery(q, [
      it.id, it.name, it.zoneName, it.topZoneName, it.boatName, it.tagline, it.lore,
    ]);
  });
}

export function filterBountyCatalog(
  items: readonly BountyCatalogItem[],
  filter: CatalogFilter,
): BountyCatalogItem[] {
  const q = normalizeQuery(filter.query);
  if (filter.nightOnly) return [];
  return items.filter(it => {
    if (filter.zone && filter.zone !== 'all' && it.zoneId !== topZoneOf(filter.zone)) return false;
    if (filter.rarity && filter.rarity !== 'all') {
      if (it.kind === 'named') {
        if (filter.rarity !== 'legendary') return false;
      } else if (it.grade !== filter.rarity) {
        return false;
      }
    }
    return matchesQuery(q, [
      it.id, it.zoneName, it.portName, it.difficultyLabel, it.targetLabel, it.gradeName,
    ]);
  });
}
