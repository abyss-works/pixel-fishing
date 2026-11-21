// 업적 콘텐츠 — 선언적 규칙, 카탈로그 빌더, 누적 보너스 계열, 카운터 키, 탭, 보상 타입의 단일 근원.
// 규칙은 대상 선택자·측정 방식·임계값만 갖고, 목표 수는 게임 데이터에서 카탈로그 빌더가 센다.
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { ARTIFACTS } from './artifacts.js';
import { BOUNTIES } from './bounties.js';
import { FISH } from './fish.js';
import type { Fish, FormId } from './fish.js';
import { NAMED, namedById } from './named.js';
import type { RarityId } from './rarity.js';
import { SPOTS, spotById } from './spots.js';
import type { SpotId } from './spots.js';
import { HATS } from './wardrobe.js';
import { ZONE_IDS, topZoneOfSpot, zoneById } from './zones.js';
import type { ZoneId } from './zones.js';

export const ACHIEVEMENT_COUNTER_KEYS = [
  'sell.gold',
  'catch.perfect',
  'catch.auto',
  'catch.bait',
  'named.flawless',
] as const;

export type AchievementCounterKey = (typeof ACHIEVEMENT_COUNTER_KEYS)[number];
/** 카운터 맵 — 기본 키 5종에 규칙이 만드는 동적 키(manual.*)를 더한다. 저장은 키-값 표다 */
export type AchievementCounters =
  Partial<Record<AchievementCounterKey, number>> & { [key: string]: number | undefined };

/** 위생 처리와 저장이 받아들이는 카운터 키 — 기본 5종과 수동 집계 접두사 */
export const ACHIEVEMENT_DYNAMIC_COUNTER_PREFIX = 'manual.';
export const isAchievementCounterKey = (key: string): boolean =>
  ACHIEVEMENT_COUNTER_KEYS.includes(key as AchievementCounterKey)
  || key.startsWith(ACHIEVEMENT_DYNAMIC_COUNTER_PREFIX);

export type AchievementStatus = 'claimable' | 'claimed';
export type AchievementMap = Record<string, AchievementStatus>;
export type AchievementTab = 'progress' | 'bonus' | 'cosmetic';
export type CosmeticKind = 'named' | 'night' | 'variant' | 'big' | 'general';

export type AchievementReward =
  | { kind: 'gold'; gold: number }
  | { kind: 'hat'; hatId: string };

export interface AchievementDef {
  id: string;
  tab: Exclude<AchievementTab, 'bonus'>;
  name: string;
  desc: string;
  reward: AchievementReward;
  /** 해역 진행 업적이면 해역 id */
  spot?: SpotId;
  /** 구역 소속이 분명한 업적이면 구역 id */
  zone?: ZoneId;
  /** 치장 탭 세부 분류 */
  cosmeticKind?: CosmeticKind;
  /** 다단계 치장 묶음(네임드 1·5·10회)의 그룹 키 */
  groupId?: string;
  /** 네임드 토벌 치장 업적의 의뢰 id */
  namedQuestId?: string;
  /** 네임드 토벌 치장 업적의 네임드 id */
  namedId?: string;
}

/** 업적 대상 선택자 — 게임 데이터에서 대상을 고른다. 조건 코드는 없다 */
export type AchievementSelector =
  | {
    kind: 'fish';
    spot?: SpotId;
    zone?: ZoneId;
    rarity?: RarityId | readonly RarityId[];
    form?: FormId;
    night?: boolean;
  }
  | { kind: 'named' }
  | { kind: 'artifact' }
  | { kind: 'hat' };

/** 업적 측정 방식 — 진척 엔진이 이 갈래로만 분기한다 */
export type AchievementMetric =
  | { kind: 'discover'; form: FormId }
  | { kind: 'counterSet'; prefix: string }
  | { kind: 'counter'; key: string }
  | { kind: 'set'; field: 'named' | 'artifact' }
  | { kind: 'namedClearCount'; questId: string }
  | { kind: 'bigSpecies' }
  | { kind: 'catchCount' };

export interface AchievementRule {
  id: string;
  tab: Exclude<AchievementTab, 'bonus'>;
  name: string;
  desc: string;
  selector: AchievementSelector;
  metric: AchievementMetric;
  /** 'all'이면 선택자 대상 수를 목표로 쓴다 */
  threshold: 'all' | number;
  reward: AchievementReward;
  spot?: SpotId;
  zone?: ZoneId;
  cosmeticKind?: CosmeticKind;
  groupId?: string;
  namedQuestId?: string;
  namedId?: string;
}

/** 규칙 하나의 카탈로그 항목 — 목표 수는 빌더가 데이터에서 센 값이다 */
export interface AchievementCatalogEntry {
  rule: AchievementRule;
  target: number;
  def: AchievementDef;
}

/** 누적 보너스 효과 종류 */
export type CumulativeBonusKind =
  | 'biteWaitCut'
  | 'mutationWeight'
  | 'namedWeight'
  | 'moveSpeed'
  | 'artifactBoost'
  | 'zoneLegendary'
  | 'zoneMutation';

/** 누적 보너스 측정 방식 */
export type CumulativeBonusMetric =
  | { kind: 'counter'; key: string }
  | { kind: 'zoneLegendarySum'; zone: ZoneId }
  | { kind: 'maxArtifact' };

/** 누적 보너스 단계 하나 */
export interface CumulativeBonusStep {
  id: string;
  threshold: number;
  /** 단계 도달 시 더해지는 보너스 비율(예: 0.02 = 2%) */
  delta: number;
  /** 단계별 라벨(예: '10마리') */
  label: string;
}

/** 누적 보너스 계열(다단계 카드 하나) */
export interface CumulativeBonusSeries {
  id: string;
  name: string;
  desc: string;
  scope: 'global' | 'zone';
  zone?: ZoneId;
  metric: CumulativeBonusMetric;
  bonusKind: CumulativeBonusKind;
  unit: string;
  steps: readonly CumulativeBonusStep[];
  /** 누적 보너스 업적 집계 가중치(기본 1계열 = 1건, 최고 레벨 유물은 3단계 각각 1건으로 총 23종) */
  tierCount: number;
}

const NAMED_QUESTS = BOUNTIES.filter(q => q.difficulty === 'named');
const BASIC_GRADES: readonly RarityId[] = ['common', 'rare', 'epic'];

/** 등급 선택자를 어종 등급과 대조한다 — 배열이면 포함, 단일 값이면 일치 */
const rarityMatches = (
  fish: Fish, rarity: Extract<AchievementSelector, { kind: 'fish' }>['rarity'],
): boolean => {
  if (rarity === undefined) return true;
  return typeof rarity === 'string' ? fish.rarity === rarity : rarity.includes(fish.rarity);
};

/** 선택자가 고른 어종 — 도감 대상 수와 진척 판정이 같은 목록을 본다 */
export function selectorFish(selector: AchievementSelector): readonly Fish[] {
  if (selector.kind !== 'fish') return [];
  return FISH.filter(f =>
    (selector.spot === undefined || f.spot === selector.spot)
    && (selector.zone === undefined || topZoneOfSpot(f.spot) === selector.zone)
    && rarityMatches(f, selector.rarity)
    && (selector.night === undefined || (f.night === true) === selector.night));
}

/** 선택자의 대상 id 목록 — 카운터 셋과 보유 목록 측정이 쓴다 */
export function selectorIds(selector: AchievementSelector): readonly string[] {
  switch (selector.kind) {
    case 'fish': return selectorFish(selector).map(f => f.id);
    case 'named': return NAMED_QUESTS.map(q => q.id);
    case 'artifact': return ARTIFACTS.map(a => a.id);
    case 'hat': return HATS.map(h => h.id);
  }
}

/** 선택자 대상 수 — 임계값이 'all'인 규칙의 목표 */
export function selectorTargetCount(selector: AchievementSelector): number {
  return selectorIds(selector).length;
}

// ── 1. 진행 업적 26종 (13개 낚시 해역 × 기초/숙련, 총 5,362,500G) ──

const SPOT_PROGRESS_REWARDS: Record<SpotId, { basic: number; full: number }> = {
  pond: { basic: 50, full: 50 },
  river: { basic: 100, full: 100 },
  sea: { basic: 300, full: 300 },
  deep: { basic: 800, full: 800 },
  dragonhole: { basic: 1_500, full: 1_500 },
  coron: { basic: 4_000, full: 4_000 },
  barrierreef: { basic: 12_000, full: 12_000 },
  indian: { basic: 35_000, full: 40_000 },
  southindian: { basic: 100_000, full: 100_000 },
  mozstrait: { basic: 200_000, full: 150_000 },
  comorodeep: { basic: 350_000, full: 350_000 },
  benguela: { basic: 500_000, full: 500_000 },
  sthelena: { basic: 1_500_000, full: 1_500_000 },
  azores: { basic: 3_000_000, full: 2_500_000 },
  bermuda: { basic: 7_500_000, full: 7_500_000 },
};

const SPOT_PROGRESS_RULES: AchievementRule[] = SPOTS.flatMap(spot => {
  const rewards = SPOT_PROGRESS_REWARDS[spot.id];
  const zone = topZoneOfSpot(spot.id);
  return [
    {
      id: `spot-basic-${spot.id}`,
      tab: 'progress',
      name: `${spot.name} 기초`,
      desc: `${spot.name}에서 전설 등급을 빼고 모든 어종의 일반 폼을 모아요.`,
      selector: { kind: 'fish', spot: spot.id, rarity: BASIC_GRADES },
      metric: { kind: 'discover', form: 'normal' },
      threshold: 'all',
      reward: { kind: 'gold', gold: rewards.basic },
      spot: spot.id,
      zone,
    },
    {
      id: `spot-full-${spot.id}`,
      tab: 'progress',
      name: `${spot.name} 숙련`,
      desc: `${spot.name}에서 전설 등급까지 모든 어종의 일반 폼을 모아요.`,
      selector: { kind: 'fish', spot: spot.id },
      metric: { kind: 'discover', form: 'normal' },
      threshold: 'all',
      reward: { kind: 'gold', gold: rewards.full },
      spot: spot.id,
      zone,
    },
  ];
});

// ── 2. 치장 업적 41종 (기존 14종 승계 + 밤 도감 8종 + 월척 100종 1종 + 네임드 다회 토벌 18종) ──

const COSMETIC_LEGACY_AND_COLLECTION_RULES: AchievementRule[] = [
  {
    id: 'variant-village',
    tab: 'cosmetic',
    cosmeticKind: 'variant',
    zone: 'village',
    name: '마을 돌연변이 도감',
    desc: '마을 물가 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'village' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'straw-hat' },
  },
  {
    id: 'variant-pacific',
    tab: 'cosmetic',
    cosmeticKind: 'variant',
    zone: 'pacific',
    name: '태평양 돌연변이 도감',
    desc: '태평양 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'pacific' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'sou-wester' },
  },
  {
    id: 'variant-seasia',
    tab: 'cosmetic',
    cosmeticKind: 'variant',
    zone: 'seasia',
    name: '동남아&오세아니아 돌연변이 도감',
    desc: '동남아&오세아니아 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'seasia' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'coral-bandana' },
  },
  {
    id: 'variant-indian',
    tab: 'cosmetic',
    cosmeticKind: 'variant',
    zone: 'indian',
    name: '인도양 돌연변이 도감',
    desc: '인도양 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'indian' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'saffron-turban' },
  },
  {
    id: 'variant-madagascar',
    tab: 'cosmetic',
    cosmeticKind: 'variant',
    zone: 'madagascar',
    name: '마다가스카르 돌연변이 도감',
    desc: '마다가스카르 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'madagascar' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'worn-tricorn' },
  },
  {
    id: 'variant-southatlantic',
    tab: 'cosmetic',
    cosmeticKind: 'variant',
    zone: 'southatlantic',
    name: '남대서양 돌연변이 도감',
    desc: '남대서양 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'southatlantic' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'fog-beanie' },
  },
  {
    id: 'variant-all',
    tab: 'cosmetic',
    cosmeticKind: 'variant',
    name: '전 구역 돌연변이 도감',
    desc: '모든 구역 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'braid-captain-cap' },
  },
  {
    id: 'grade-legendary',
    tab: 'cosmetic',
    cosmeticKind: 'general',
    name: '전설 도감',
    desc: '전설 등급 어종의 일반 폼을 모두 모아요.',
    selector: { kind: 'fish', rarity: 'legendary' },
    metric: { kind: 'discover', form: 'normal' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'anchor-beret' },
  },
  {
    id: 'night-normal',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'pacific',
    name: '한밤 도감',
    desc: '태평양에서 밤에만 나타나는 어종의 일반 폼을 모두 모아요.',
    selector: { kind: 'fish', zone: 'pacific', night: true },
    metric: { kind: 'discover', form: 'normal' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'watch-sailor-cap' },
  },
  {
    id: 'night-variant',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'pacific',
    name: '한밤 돌연변이 도감',
    desc: '태평양에서 밤에만 나타나는 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'pacific', night: true },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'earflap-cap' },
  },
  {
    id: 'night-seasia-normal',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'seasia',
    name: '동남아&오세아니아 한밤 도감',
    desc: '동남아&오세아니아에서 밤에만 나타나는 어종의 일반 폼을 모두 모아요.',
    selector: { kind: 'fish', zone: 'seasia', night: true },
    metric: { kind: 'discover', form: 'normal' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'crescent-hood' },
  },
  {
    id: 'night-seasia-variant',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'seasia',
    name: '동남아&오세아니아 한밤 돌연변이 도감',
    desc: '동남아&오세아니아에서 밤에만 나타나는 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'seasia', night: true },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'ink-hood' },
  },
  {
    id: 'night-indian-normal',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'indian',
    name: '인도양 한밤 도감',
    desc: '인도양에서 밤에만 나타나는 어종의 일반 폼을 모두 모아요.',
    selector: { kind: 'fish', zone: 'indian', night: true },
    metric: { kind: 'discover', form: 'normal' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'polar-beret' },
  },
  {
    id: 'night-indian-variant',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'indian',
    name: '인도양 한밤 돌연변이 도감',
    desc: '인도양에서 밤에만 나타나는 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'indian', night: true },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'polar-knit-cap' },
  },
  {
    id: 'night-madagascar-normal',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'madagascar',
    name: '마다가스카르 한밤 도감',
    desc: '마다가스카르에서 밤에만 나타나는 어종의 일반 폼을 모두 모아요.',
    selector: { kind: 'fish', zone: 'madagascar', night: true },
    metric: { kind: 'discover', form: 'normal' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'strait-night-cap' },
  },
  {
    id: 'night-madagascar-variant',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'madagascar',
    name: '마다가스카르 한밤 돌연변이 도감',
    desc: '마다가스카르에서 밤에만 나타나는 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'madagascar', night: true },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'inkglass-beanie' },
  },
  {
    id: 'night-southatlantic-normal',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'southatlantic',
    name: '남대서양 한밤 도감',
    desc: '남대서양에서 밤에만 나타나는 어종의 일반 폼을 모두 모아요.',
    selector: { kind: 'fish', zone: 'southatlantic', night: true },
    metric: { kind: 'discover', form: 'normal' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'lookout-storm-hat' },
  },
  {
    id: 'night-southatlantic-variant',
    tab: 'cosmetic',
    cosmeticKind: 'night',
    zone: 'southatlantic',
    name: '남대서양 한밤 돌연변이 도감',
    desc: '남대서양에서 밤에만 나타나는 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'southatlantic', night: true },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'pitch-lookout-cap' },
  },
  {
    id: 'big-50',
    tab: 'cosmetic',
    cosmeticKind: 'big',
    name: '월척 장부',
    desc: '월척을 50종 이상 낚아요.',
    selector: { kind: 'fish' },
    metric: { kind: 'bigSpecies' },
    threshold: 50,
    reward: { kind: 'hat', hatId: 'lure-bucket-hat' },
  },
  {
    id: 'big-100-hat',
    tab: 'cosmetic',
    cosmeticKind: 'big',
    name: '월척 백 종',
    desc: '월척을 100종 이상 낚아요.',
    selector: { kind: 'fish' },
    metric: { kind: 'bigSpecies' },
    threshold: 100,
    reward: { kind: 'hat', hatId: 'gold-hook-hat' },
  },
  {
    id: 'named-all',
    tab: 'cosmetic',
    cosmeticKind: 'general',
    name: '수배판 완결',
    desc: '모든 네임드를 한 번 이상 쓰러뜨려요.',
    selector: { kind: 'named' },
    metric: { kind: 'set', field: 'named' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'harpooner-pillbox' },
  },
  {
    id: 'artifact-all',
    tab: 'cosmetic',
    cosmeticKind: 'general',
    name: '유물 전집',
    desc: '모든 유물을 모아요.',
    selector: { kind: 'artifact' },
    metric: { kind: 'set', field: 'artifact' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'shipowner-bowler' },
  },
  {
    id: 'catch-100000',
    tab: 'cosmetic',
    cosmeticKind: 'general',
    name: '십만 마리 낚시꾼',
    desc: '일반 어종을 합쳐 100,000마리 이상 낚아요.',
    selector: { kind: 'fish' },
    metric: { kind: 'catchCount' },
    threshold: 100_000,
    reward: { kind: 'hat', hatId: 'salt-fisher-cap' },
  },
];

const NAMED_HAT_TIERS: Readonly<Record<string, readonly [string, string, string]>> = {
  megalodon: ['megalodon-work-cap', 'megalodon-fin-cap', 'megalodon-silver-visor'],
  leviathan: ['leviathan-dive-hood', 'leviathan-bell-cap', 'leviathan-serpent-hat'],
  ananta: ['ananta-lantern-hood', 'ananta-rope-cap', 'ananta-astrolabe-hat'],
  'elder-sixgill': ['dunkleos-trawl-hat', 'dunkleos-rivet-leather', 'dunkleos-jaw-helm'],
  adamastor: ['adamastor-pier-cap', 'adamastor-storm-hood', 'adamastor-lantern-hood'],
  jasconius: ['jasconius-island-cap', 'jasconius-ember-visor', 'jasconius-rockback-hat'],
};

const NAMED_CLEAR_THRESHOLDS = [1, 5, 10] as const;

const NAMED_MULTI_CLEAR_RULES: AchievementRule[] = NAMED.flatMap(named => {
  const quest = NAMED_QUESTS.find(q => q.targetFish === named.id);
  const hats = NAMED_HAT_TIERS[named.id];
  if (!quest || !hats) return [];
  const zone = named.zones[0];
  return NAMED_CLEAR_THRESHOLDS.map((count, idx): AchievementRule => ({
    id: `named-${named.id}-${count}`,
    tab: 'cosmetic',
    cosmeticKind: 'named',
    groupId: `named-${named.id}`,
    namedQuestId: quest.id,
    namedId: named.id,
    zone,
    spot: named.spot,
    name: `${named.name} 토벌 ${count}회`,
    desc: `${named.name} 토벌을 ${count}회 마쳐요.`,
    selector: { kind: 'named' },
    metric: { kind: 'namedClearCount', questId: quest.id },
    threshold: count,
    reward: { kind: 'hat', hatId: hats[idx] },
  }));
});

/** 미토벌 네임드 스포일러 가림용 출현 위치 이름(해역 우선, 없으면 구역) */
export function namedSpoilerPlace(namedId: string): string {
  const named = namedById(namedId);
  if (!named) return '알 수 없는 바다';
  if (named.spot) return spotById(named.spot)?.name ?? named.spot;
  return zoneById(named.zones[0])?.shortName ?? named.zones[0];
}

// ── 3. 누적 보너스 업적 23종 (전역 8계열 + 구역 6×2=12계열 + 최고 레벨 유물 3단계) ──

const GLOBAL_BONUS_SERIES: readonly CumulativeBonusSeries[] = [
  {
    id: 'bonus-manual-total',
    name: '수동 손맛',
    desc: '방치 낚시가 아닌 직접 챔질로 물고기를 낚아요.',
    scope: 'global',
    metric: { kind: 'counter', key: 'manual.total' },
    bonusKind: 'biteWaitCut',
    unit: '마리',
    tierCount: 1,
    steps: [
      { id: 'bonus-manual-total-1', threshold: 10, delta: 0.005, label: '10마리' },
      { id: 'bonus-manual-total-2', threshold: 100, delta: 0.005, label: '100마리' },
      { id: 'bonus-manual-total-3', threshold: 1_000, delta: 0.01, label: '1,000마리' },
      { id: 'bonus-manual-total-4', threshold: 10_000, delta: 0.02, label: '10,000마리' },
    ],
  },
  {
    id: 'bonus-manual-legendary',
    name: '전설 손맛',
    desc: '직접 챔질로 전설 등급 어종을 낚아요.',
    scope: 'global',
    metric: { kind: 'counter', key: 'manual.legendary.total' },
    bonusKind: 'biteWaitCut',
    unit: '마리',
    tierCount: 1,
    steps: [
      { id: 'bonus-manual-legendary-1', threshold: 1, delta: 0.005, label: '1마리' },
      { id: 'bonus-manual-legendary-2', threshold: 5, delta: 0.005, label: '5마리' },
      { id: 'bonus-manual-legendary-3', threshold: 10, delta: 0.005, label: '10마리' },
      { id: 'bonus-manual-legendary-4', threshold: 25, delta: 0.005, label: '25마리' },
    ],
  },
  {
    id: 'bonus-manual-variant',
    name: '돌연변이 손맛',
    desc: '직접 챔질로 돌연변이 물고기를 낚아요.',
    scope: 'global',
    metric: { kind: 'counter', key: 'manual.variant.total' },
    bonusKind: 'mutationWeight',
    unit: '마리',
    tierCount: 1,
    steps: [
      { id: 'bonus-manual-variant-1', threshold: 1, delta: 0.02, label: '1마리' },
      { id: 'bonus-manual-variant-2', threshold: 5, delta: 0.02, label: '5마리' },
      { id: 'bonus-manual-variant-3', threshold: 10, delta: 0.02, label: '10마리' },
      { id: 'bonus-manual-variant-4', threshold: 25, delta: 0.02, label: '25마리' },
    ],
  },
  {
    id: 'bonus-catch-auto',
    name: '방치 낚시',
    desc: '방치 낚시로 물고기를 낚아요.',
    scope: 'global',
    metric: { kind: 'counter', key: 'catch.auto' },
    bonusKind: 'biteWaitCut',
    unit: '마리',
    tierCount: 1,
    steps: [
      { id: 'bonus-catch-auto-1', threshold: 1_000, delta: 0.01, label: '1,000마리' },
      { id: 'bonus-catch-auto-2', threshold: 10_000, delta: 0.01, label: '10,000마리' },
      { id: 'bonus-catch-auto-3', threshold: 100_000, delta: 0.02, label: '100,000마리' },
    ],
  },
  {
    id: 'bonus-catch-perfect',
    name: 'PERFECT 챔질',
    desc: 'PERFECT 판정으로 물고기를 낚아요.',
    scope: 'global',
    metric: { kind: 'counter', key: 'catch.perfect' },
    bonusKind: 'biteWaitCut',
    unit: '회',
    tierCount: 1,
    steps: [
      { id: 'bonus-catch-perfect-1', threshold: 100, delta: 0.01, label: '100회' },
      { id: 'bonus-catch-perfect-2', threshold: 1_000, delta: 0.01, label: '1,000회' },
      { id: 'bonus-catch-perfect-3', threshold: 10_000, delta: 0.01, label: '10,000회' },
    ],
  },
  {
    id: 'bonus-catch-bait',
    name: '미끼 손맛',
    desc: '미끼를 써서 물고기를 낚아요.',
    scope: 'global',
    metric: { kind: 'counter', key: 'catch.bait' },
    bonusKind: 'biteWaitCut',
    unit: '마리',
    tierCount: 1,
    steps: [
      { id: 'bonus-catch-bait-1', threshold: 10, delta: 0.01, label: '10마리' },
      { id: 'bonus-catch-bait-2', threshold: 100, delta: 0.01, label: '100마리' },
      { id: 'bonus-catch-bait-3', threshold: 1_000, delta: 0.01, label: '1,000마리' },
    ],
  },
  {
    id: 'bonus-named-flawless',
    name: '무결점 토벌',
    desc: '실패 없이 네임드 결투를 이겨요.',
    scope: 'global',
    metric: { kind: 'counter', key: 'named.flawless' },
    bonusKind: 'namedWeight',
    unit: '회',
    tierCount: 1,
    steps: [
      { id: 'bonus-named-flawless-1', threshold: 1, delta: 0.03, label: '1회' },
      { id: 'bonus-named-flawless-2', threshold: 10, delta: 0.03, label: '10회' },
      { id: 'bonus-named-flawless-3', threshold: 50, delta: 0.04, label: '50회' },
    ],
  },
  {
    id: 'bonus-sell-gold',
    name: '누적 판매',
    desc: '물고기를 팔아 골드를 모아요.',
    scope: 'global',
    metric: { kind: 'counter', key: 'sell.gold' },
    bonusKind: 'moveSpeed',
    unit: 'G',
    tierCount: 1,
    steps: [
      { id: 'bonus-sell-gold-1', threshold: 1_000_000, delta: 0.02, label: '1,000,000G' },
      { id: 'bonus-sell-gold-2', threshold: 10_000_000, delta: 0.02, label: '10,000,000G' },
      { id: 'bonus-sell-gold-3', threshold: 100_000_000, delta: 0.02, label: '100,000,000G' },
    ],
  },
];

const ZONE_BONUS_SERIES: readonly CumulativeBonusSeries[] = ZONE_IDS.flatMap((zone): CumulativeBonusSeries[] => {
  const zoneName = zoneById(zone)?.shortName ?? zone;
  return [
    {
      id: `bonus-zone-legendary-${zone}`,
      name: `${zoneName} 전설 손맛`,
      desc: `${zoneName}에서 직접 챔질로 전설 등급 어종을 낚아요.`,
      scope: 'zone',
      zone,
      metric: { kind: 'zoneLegendarySum', zone },
      bonusKind: 'zoneLegendary',
      unit: '마리',
      tierCount: 1,
      steps: [
        { id: `bonus-zone-legendary-${zone}-1`, threshold: 1, delta: 0.02, label: '1마리' },
        { id: `bonus-zone-legendary-${zone}-2`, threshold: 3, delta: 0.02, label: '3마리' },
        { id: `bonus-zone-legendary-${zone}-3`, threshold: 5, delta: 0.02, label: '5마리' },
      ],
    },
    {
      id: `bonus-zone-variant-${zone}`,
      name: `${zoneName} 돌연변이 손맛`,
      desc: `${zoneName}에서 직접 챔질로 돌연변이 물고기를 낚아요.`,
      scope: 'zone',
      zone,
      metric: { kind: 'counter', key: `manual.variant.${zone}` },
      bonusKind: 'zoneMutation',
      unit: '마리',
      tierCount: 1,
      steps: [
        { id: `bonus-zone-variant-${zone}-1`, threshold: 1, delta: 0.03, label: '1마리' },
        { id: `bonus-zone-variant-${zone}-2`, threshold: 5, delta: 0.03, label: '5마리' },
        { id: `bonus-zone-variant-${zone}-3`, threshold: 10, delta: 0.03, label: '10마리' },
      ],
    },
  ];
});

const MAX_ARTIFACT_BONUS_SERIES: CumulativeBonusSeries = {
  id: 'bonus-max-artifact',
  name: '최고 레벨 유물',
  desc: '최고 레벨 유물과 전설 유물을 모아 보유 유물 효과를 높여요.',
  scope: 'global',
  metric: { kind: 'maxArtifact' },
  bonusKind: 'artifactBoost',
  unit: '개',
  tierCount: 3,
  steps: [
    { id: 'bonus-max-artifact-1', threshold: 1, delta: 0.03, label: '1개' },
    { id: 'bonus-max-artifact-3', threshold: 3, delta: 0.05, label: '3개' },
    { id: 'bonus-max-artifact-6', threshold: 6, delta: 0.07, label: '6개' },
  ],
};

/** 누적 보너스 업적 계열 21개(최고 레벨 유물 3단계 포함 총 23종) */
export const CUMULATIVE_BONUS_SERIES: readonly CumulativeBonusSeries[] = [
  ...GLOBAL_BONUS_SERIES,
  ...ZONE_BONUS_SERIES,
  MAX_ARTIFACT_BONUS_SERIES,
];

/** 누적 보너스 업적 총 수 (23) */
export const CUMULATIVE_BONUS_COUNT = CUMULATIVE_BONUS_SERIES.reduce((sum, s) => sum + s.tierCount, 0);

// ── 4. 폐지된 옛 업적 (재사용 금지, 이미 claimable인 기존 계정 수령 보호용) ──

export interface LegacyAchievementDef {
  id: string;
  name: string;
  reward: { kind: 'gold'; gold: number };
}

export const LEGACY_ACHIEVEMENT_DEFS: readonly LegacyAchievementDef[] = [
  { id: 'zone-basic-pacific', name: '태평양 도감', reward: { kind: 'gold', gold: 25_000 } },
  { id: 'zone-full-pacific', name: '태평양 도감 완결', reward: { kind: 'gold', gold: 25_000 } },
  { id: 'zone-basic-seasia', name: '동남아&오세아니아 도감', reward: { kind: 'gold', gold: 150_000 } },
  { id: 'zone-full-seasia', name: '동남아&오세아니아 도감 완결', reward: { kind: 'gold', gold: 100_000 } },
  { id: 'zone-basic-indian', name: '인도양 도감', reward: { kind: 'gold', gold: 400_000 } },
  { id: 'zone-full-indian', name: '인도양 도감 완결', reward: { kind: 'gold', gold: 350_000 } },
  { id: 'zone-basic-madagascar', name: '마다가스카르 도감', reward: { kind: 'gold', gold: 1_500_000 } },
  { id: 'zone-full-madagascar', name: '마다가스카르 도감 완결', reward: { kind: 'gold', gold: 1_500_000 } },
  { id: 'zone-basic-southatlantic', name: '남대서양 도감', reward: { kind: 'gold', gold: 5_000_000 } },
  { id: 'zone-full-southatlantic', name: '남대서양 도감 완결', reward: { kind: 'gold', gold: 5_000_000 } },
  { id: 'manual-10', name: '손맛 열 마리', reward: { kind: 'gold', gold: 1_000 } },
  { id: 'manual-100', name: '손맛 백 마리', reward: { kind: 'gold', gold: 10_000 } },
  { id: 'manual-1000', name: '손맛 천 마리', reward: { kind: 'gold', gold: 100_000 } },
  { id: 'manual-10000', name: '손맛 만 마리', reward: { kind: 'gold', gold: 1_000_000 } },
  { id: 'manual-legendary-1', name: '전설 손맛 첫 마리', reward: { kind: 'gold', gold: 50_000 } },
  { id: 'manual-legendary-5', name: '전설 손맛 다섯 마리', reward: { kind: 'gold', gold: 250_000 } },
  { id: 'manual-legendary-10', name: '전설 손맛 열 마리', reward: { kind: 'gold', gold: 500_000 } },
  { id: 'manual-legendary-25', name: '전설 손맛 스물다섯 마리', reward: { kind: 'gold', gold: 2_000_000 } },
  { id: 'manual-variant-1', name: '돌연변이 손맛 첫 마리', reward: { kind: 'gold', gold: 25_000 } },
  { id: 'manual-variant-5', name: '돌연변이 손맛 다섯 마리', reward: { kind: 'gold', gold: 100_000 } },
  { id: 'manual-variant-10', name: '돌연변이 손맛 열 마리', reward: { kind: 'gold', gold: 250_000 } },
  { id: 'manual-variant-25', name: '돌연변이 손맛 스물다섯 마리', reward: { kind: 'gold', gold: 1_000_000 } },
  { id: 'manual-legendary-zone-village', name: '마을 전설 손맛', reward: { kind: 'gold', gold: 30_000 } },
  { id: 'manual-variant-zone-village', name: '마을 돌연변이 손맛', reward: { kind: 'gold', gold: 10_000 } },
  { id: 'manual-legendary-zone-pacific', name: '태평양 전설 손맛', reward: { kind: 'gold', gold: 100_000 } },
  { id: 'manual-variant-zone-pacific', name: '태평양 돌연변이 손맛', reward: { kind: 'gold', gold: 20_000 } },
  { id: 'manual-legendary-zone-seasia', name: '동남아&오세아니아 전설 손맛', reward: { kind: 'gold', gold: 300_000 } },
  { id: 'manual-variant-zone-seasia', name: '동남아&오세아니아 돌연변이 손맛', reward: { kind: 'gold', gold: 40_000 } },
  { id: 'manual-legendary-zone-indian', name: '인도양 전설 손맛', reward: { kind: 'gold', gold: 200_000 } },
  { id: 'manual-variant-zone-indian', name: '인도양 돌연변이 손맛', reward: { kind: 'gold', gold: 50_000 } },
  { id: 'manual-legendary-zone-madagascar', name: '마다가스카르 전설 손맛', reward: { kind: 'gold', gold: 400_000 } },
  { id: 'manual-variant-zone-madagascar', name: '마다가스카르 돌연변이 손맛', reward: { kind: 'gold', gold: 80_000 } },
  { id: 'manual-legendary-zone-southatlantic', name: '남대서양 전설 손맛', reward: { kind: 'gold', gold: 800_000 } },
  { id: 'manual-variant-zone-southatlantic', name: '남대서양 돌연변이 손맛', reward: { kind: 'gold', gold: 150_000 } },
  { id: 'perfect-100', name: 'PERFECT 백 번', reward: { kind: 'gold', gold: 10_000 } },
  { id: 'perfect-1000', name: 'PERFECT 천 번', reward: { kind: 'gold', gold: 100_000 } },
  { id: 'perfect-10000', name: 'PERFECT 만 번', reward: { kind: 'gold', gold: 1_000_000 } },
  { id: 'auto-1000', name: '방치 천 마리', reward: { kind: 'gold', gold: 20_000 } },
  { id: 'auto-10000', name: '방치 만 마리', reward: { kind: 'gold', gold: 200_000 } },
  { id: 'auto-100000', name: '방치 십만 마리', reward: { kind: 'gold', gold: 2_000_000 } },
  { id: 'bait-10', name: '미끼 열 번', reward: { kind: 'gold', gold: 5_000 } },
  { id: 'bait-100', name: '미끼 백 번', reward: { kind: 'gold', gold: 50_000 } },
  { id: 'bait-1000', name: '미끼 천 번', reward: { kind: 'gold', gold: 500_000 } },
  { id: 'named-flawless-1', name: '무결점 토벌', reward: { kind: 'gold', gold: 100_000 } },
  { id: 'named-flawless-10', name: '무결점 토벌 열 번', reward: { kind: 'gold', gold: 500_000 } },
  { id: 'named-flawless-50', name: '무결점 토벌 쉰 번', reward: { kind: 'gold', gold: 2_000_000 } },
  { id: 'sell-1000000', name: '판매 백만 골드', reward: { kind: 'gold', gold: 30_000 } },
  { id: 'sell-10000000', name: '판매 천만 골드', reward: { kind: 'gold', gold: 300_000 } },
  { id: 'sell-100000000', name: '판매 억 골드', reward: { kind: 'gold', gold: 3_000_000 } },
  { id: 'big-100', name: '월척 백 종', reward: { kind: 'gold', gold: 300_000 } },
  { id: 'big-200', name: '월척 이백 종', reward: { kind: 'gold', gold: 1_500_000 } },
];

export const ABOLISHED_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(
  LEGACY_ACHIEVEMENT_DEFS.map(d => d.id),
);

const LEGACY_BY_ID = new Map(LEGACY_ACHIEVEMENT_DEFS.map(d => [d.id, d]));

export const legacyAchievementById = (id: unknown): LegacyAchievementDef | undefined =>
  typeof id === 'string' ? LEGACY_BY_ID.get(id) : undefined;

// ── 5. 수령형 업적 카탈로그 (진행 26종 + 치장 41종 = 67종) ──

export const ACHIEVEMENT_RULES: readonly AchievementRule[] = [
  ...SPOT_PROGRESS_RULES,
  ...COSMETIC_LEGACY_AND_COLLECTION_RULES,
  ...NAMED_MULTI_CLEAR_RULES,
];

/** 규칙의 목표 수 — 숫자 임계값은 그 값, 'all'은 선택자 대상 수 */
export function achievementTargetOf(rule: AchievementRule): number {
  return rule.threshold === 'all' ? selectorTargetCount(rule.selector) : rule.threshold;
}

/** 규칙 목록과 게임 데이터로 카탈로그를 만든다 */
export function buildAchievementCatalog(rules: readonly AchievementRule[]): readonly AchievementCatalogEntry[] {
  return rules.map(rule => ({
    rule,
    target: achievementTargetOf(rule),
    def: {
      id: rule.id,
      tab: rule.tab,
      name: rule.name,
      desc: rule.desc,
      reward: rule.reward,
      ...(rule.spot !== undefined ? { spot: rule.spot } : {}),
      ...(rule.zone !== undefined ? { zone: rule.zone } : {}),
      ...(rule.cosmeticKind !== undefined ? { cosmeticKind: rule.cosmeticKind } : {}),
      ...(rule.groupId !== undefined ? { groupId: rule.groupId } : {}),
      ...(rule.namedQuestId !== undefined ? { namedQuestId: rule.namedQuestId } : {}),
      ...(rule.namedId !== undefined ? { namedId: rule.namedId } : {}),
    },
  }));
}

export const ACHIEVEMENT_CATALOG: readonly AchievementCatalogEntry[] = buildAchievementCatalog(ACHIEVEMENT_RULES);

export const ACHIEVEMENTS: readonly AchievementDef[] = ACHIEVEMENT_CATALOG.map(entry => entry.def);

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
const ACHIEVEMENT_RULE_BY_ID = new Map(ACHIEVEMENT_RULES.map(r => [r.id, r]));
const ACHIEVEMENT_BY_HAT_ID = new Map(
  ACHIEVEMENTS.flatMap(a => (a.reward.kind === 'hat' ? [[a.reward.hatId, a] as const] : [])),
);

export const achievementById = (id: unknown): AchievementDef | undefined =>
  typeof id === 'string' ? ACHIEVEMENT_BY_ID.get(id) : undefined;

export const achievementRuleById = (id: unknown): AchievementRule | undefined =>
  typeof id === 'string' ? ACHIEVEMENT_RULE_BY_ID.get(id) : undefined;

export const achievementForHatId = (hatId: unknown): AchievementDef | undefined =>
  typeof hatId === 'string' ? ACHIEVEMENT_BY_HAT_ID.get(hatId) : undefined;
