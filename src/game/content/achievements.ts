// 업적 콘텐츠 — 선언적 규칙, 카탈로그 빌더, 카운터 키, 탭, 보상 타입의 단일 근원.
// 규칙은 대상 선택자·측정 방식·임계값만 갖고, 목표 수는 게임 데이터에서 카탈로그 빌더가 센다.
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { ARTIFACTS } from './artifacts.js';
import { BOUNTIES, BOUNTY_ZONES } from './bounties.js';
import type { BountyZone } from './bounties.js';
import { FISH } from './fish.js';
import type { Fish, FormId } from './fish.js';
import type { RarityId } from './rarity.js';
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
export type AchievementTab = 'progress' | 'collection' | 'namedArtifact' | 'count';
export type AchievementReward =
  | { kind: 'gold'; gold: number }
  | { kind: 'hat'; hatId: string };

export interface AchievementDef {
  id: string;
  tab: AchievementTab;
  name: string;
  desc: string;
  reward: AchievementReward;
}

/** 업적 대상 선택자 — 게임 데이터에서 대상을 고른다. 조건 코드는 없다 */
export type AchievementSelector =
  | {
    kind: 'fish';
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
  | { kind: 'bigSpecies' }
  | { kind: 'catchCount' };

export interface AchievementRule {
  id: string;
  tab: AchievementTab;
  name: string;
  desc: string;
  selector: AchievementSelector;
  metric: AchievementMetric;
  /** 'all'이면 선택자 대상 수를 목표로 쓴다 */
  threshold: 'all' | number;
  reward: AchievementReward;
}

/** 규칙 하나의 카탈로그 항목 — 목표 수는 빌더가 데이터에서 센 값이다 */
export interface AchievementCatalogEntry {
  rule: AchievementRule;
  target: number;
  def: AchievementDef;
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
    (selector.zone === undefined || topZoneOfSpot(f.spot) === selector.zone)
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

const ZONE_PROGRESS_REWARDS: Record<BountyZone, { basic: number; full: number }> = {
  pacific: { basic: 25_000, full: 25_000 },
  seasia: { basic: 150_000, full: 100_000 },
  indian: { basic: 400_000, full: 350_000 },
  madagascar: { basic: 1_500_000, full: 1_500_000 },
  southatlantic: { basic: 5_000_000, full: 5_000_000 },
};

const ZONE_PROGRESS_RULES: AchievementRule[] = BOUNTY_ZONES.flatMap(zone => {
  const zoneName = zoneById(zone)?.name ?? zone;
  const rewards = ZONE_PROGRESS_REWARDS[zone];
  return [
    {
      id: `zone-basic-${zone}`,
      tab: 'progress',
      name: `${zoneName} 도감`,
      desc: `${zoneName}의 일반 폼을 전설만 빼고 모두 모아요.`,
      selector: { kind: 'fish', zone, rarity: BASIC_GRADES },
      metric: { kind: 'discover', form: 'normal' },
      threshold: 'all',
      reward: { kind: 'gold', gold: rewards.basic },
    },
    {
      id: `zone-full-${zone}`,
      tab: 'progress',
      name: `${zoneName} 도감 완결`,
      desc: `${zoneName}의 일반 폼을 전설까지 모두 모아요.`,
      selector: { kind: 'fish', zone },
      metric: { kind: 'discover', form: 'normal' },
      threshold: 'all',
      reward: { kind: 'gold', gold: rewards.full },
    },
  ];
});

const COLLECTION_RULES: AchievementRule[] = [
  {
    id: 'variant-village',
    tab: 'collection',
    name: '마을 돌연변이 도감',
    desc: '마을 물가 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'village' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'straw-hat' },
  },
  {
    id: 'variant-pacific',
    tab: 'collection',
    name: '태평양 돌연변이 도감',
    desc: '태평양 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'pacific' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'sou-wester' },
  },
  {
    id: 'variant-seasia',
    tab: 'collection',
    name: '동남아&오세아니아 돌연변이 도감',
    desc: '동남아&오세아니아 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'seasia' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'coral-bandana' },
  },
  {
    id: 'variant-indian',
    tab: 'collection',
    name: '인도양 돌연변이 도감',
    desc: '인도양 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'indian' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'saffron-turban' },
  },
  {
    id: 'variant-madagascar',
    tab: 'collection',
    name: '마다가스카르 돌연변이 도감',
    desc: '마다가스카르 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'madagascar' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'worn-tricorn' },
  },
  {
    id: 'variant-southatlantic',
    tab: 'collection',
    name: '남대서양 돌연변이 도감',
    desc: '남대서양 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', zone: 'southatlantic' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'fog-beanie' },
  },
  {
    id: 'variant-all',
    tab: 'collection',
    name: '전 구역 돌연변이 도감',
    desc: '모든 구역 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish' },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'braid-captain-cap' },
  },
  {
    id: 'grade-legendary',
    tab: 'collection',
    name: '전설 도감',
    desc: '전설 등급 어종의 일반 폼을 모두 모아요.',
    selector: { kind: 'fish', rarity: 'legendary' },
    metric: { kind: 'discover', form: 'normal' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'anchor-beret' },
  },
  {
    id: 'night-normal',
    tab: 'collection',
    name: '한밤 도감',
    desc: '밤에만 나타나는 어종의 일반 폼을 모두 모아요.',
    selector: { kind: 'fish', night: true },
    metric: { kind: 'discover', form: 'normal' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'watch-sailor-cap' },
  },
  {
    id: 'night-variant',
    tab: 'collection',
    name: '한밤 돌연변이 도감',
    desc: '밤에만 나타나는 어종의 돌연변이를 모두 모아요.',
    selector: { kind: 'fish', night: true },
    metric: { kind: 'discover', form: 'variant' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'earflap-cap' },
  },
  {
    id: 'big-50',
    tab: 'collection',
    name: '월척 장부',
    desc: '월척을 50종 이상 낚아요.',
    selector: { kind: 'fish' },
    metric: { kind: 'bigSpecies' },
    threshold: 50,
    reward: { kind: 'hat', hatId: 'lure-bucket-hat' },
  },
];

const NAMED_ARTIFACT_RULES: AchievementRule[] = [
  {
    id: 'named-all',
    tab: 'namedArtifact',
    name: '수배판 완결',
    desc: '모든 네임드를 한 번 이상 쓰러뜨려요.',
    selector: { kind: 'named' },
    metric: { kind: 'set', field: 'named' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'harpooner-pillbox' },
  },
  {
    id: 'artifact-all',
    tab: 'namedArtifact',
    name: '유물 전집',
    desc: '모든 유물을 모아요.',
    selector: { kind: 'artifact' },
    metric: { kind: 'set', field: 'artifact' },
    threshold: 'all',
    reward: { kind: 'hat', hatId: 'shipowner-bowler' },
  },
];

const COUNT_RULES: AchievementRule[] = [
  {
    id: 'catch-100000',
    tab: 'count',
    name: '십만 마리 낚시꾼',
    desc: '일반 어종을 합쳐 100,000마리 이상 낚아요.',
    selector: { kind: 'fish' },
    metric: { kind: 'catchCount' },
    threshold: 100_000,
    reward: { kind: 'hat', hatId: 'salt-fisher-cap' },
  },
];

/** 횟수 탭의 단일 카운터 규칙 — 임계값과 보상만 다르다 */
const counterRule = (
  id: string, name: string, desc: string, key: string, threshold: number, gold: number,
): AchievementRule => ({
  id, tab: 'count', name, desc,
  selector: { kind: 'fish' },
  metric: { kind: 'counter', key },
  threshold,
  reward: { kind: 'gold', gold },
});

const MANUAL_TOTAL_RULES: AchievementRule[] = [
  counterRule('manual-10', '손맛 열 마리', '방치가 아닌 캐치로 물고기를 10마리 낚아요.', 'manual.total', 10, 1_000),
  counterRule('manual-100', '손맛 백 마리', '방치가 아닌 캐치로 물고기를 100마리 낚아요.', 'manual.total', 100, 10_000),
  counterRule('manual-1000', '손맛 천 마리', '방치가 아닌 캐치로 물고기를 1,000마리 낚아요.', 'manual.total', 1_000, 100_000),
  counterRule('manual-10000', '손맛 만 마리', '방치가 아닌 캐치로 물고기를 10,000마리 낚아요.', 'manual.total', 10_000, 1_000_000),
];

const MANUAL_LEGENDARY_TOTAL_RULES: AchievementRule[] = [
  counterRule('manual-legendary-1', '전설 손맛 첫 마리', '전설 등급 어종을 방치가 아닌 캐치로 1마리 낚아요.', 'manual.legendary.total', 1, 50_000),
  counterRule('manual-legendary-5', '전설 손맛 다섯 마리', '전설 등급 어종을 방치가 아닌 캐치로 5마리 낚아요.', 'manual.legendary.total', 5, 250_000),
  counterRule('manual-legendary-10', '전설 손맛 열 마리', '전설 등급 어종을 방치가 아닌 캐치로 10마리 낚아요.', 'manual.legendary.total', 10, 500_000),
  counterRule('manual-legendary-25', '전설 손맛 스물다섯 마리', '전설 등급 어종을 방치가 아닌 캐치로 25마리 낚아요.', 'manual.legendary.total', 25, 2_000_000),
];

const MANUAL_VARIANT_TOTAL_RULES: AchievementRule[] = [
  counterRule('manual-variant-1', '돌연변이 손맛 첫 마리', '돌연변이 물고기를 방치가 아닌 캐치로 1마리 낚아요.', 'manual.variant.total', 1, 25_000),
  counterRule('manual-variant-5', '돌연변이 손맛 다섯 마리', '돌연변이 물고기를 방치가 아닌 캐치로 5마리 낚아요.', 'manual.variant.total', 5, 100_000),
  counterRule('manual-variant-10', '돌연변이 손맛 열 마리', '돌연변이 물고기를 방치가 아닌 캐치로 10마리 낚아요.', 'manual.variant.total', 10, 250_000),
  counterRule('manual-variant-25', '돌연변이 손맛 스물다섯 마리', '돌연변이 물고기를 방치가 아닌 캐치로 25마리 낚아요.', 'manual.variant.total', 25, 1_000_000),
];

/** 구역별 수동 집계 보상 — 목표 수는 데이터에서 나오므로 보상만 구역별로 둔다 */
const MANUAL_ZONE_REWARDS: Record<string, { legendary: number; variant: number }> = {
  village: { legendary: 30_000, variant: 10_000 },
  pacific: { legendary: 100_000, variant: 20_000 },
  seasia: { legendary: 300_000, variant: 40_000 },
  indian: { legendary: 200_000, variant: 50_000 },
  madagascar: { legendary: 400_000, variant: 80_000 },
  southatlantic: { legendary: 800_000, variant: 150_000 },
};

const MANUAL_ZONE_RULES: AchievementRule[] = ZONE_IDS.flatMap(zone => {
  const zoneName = zoneById(zone)?.shortName ?? zone;
  const rewards = MANUAL_ZONE_REWARDS[zone] ?? { legendary: 0, variant: 0 };
  return [
    {
      id: `manual-legendary-zone-${zone}`,
      tab: 'count',
      name: `${zoneName} 전설 손맛`,
      desc: `${zoneName}의 전설 등급 어종을 방치가 아닌 캐치로 모두 낚아요.`,
      selector: { kind: 'fish', zone, rarity: 'legendary' },
      metric: { kind: 'counterSet', prefix: 'manual.legendary.' },
      threshold: 'all',
      reward: { kind: 'gold', gold: rewards.legendary },
    },
    {
      id: `manual-variant-zone-${zone}`,
      tab: 'count',
      name: `${zoneName} 돌연변이 손맛`,
      desc: `${zoneName}에서 돌연변이 물고기를 방치가 아닌 캐치로 한 마리 이상 낚아요.`,
      selector: { kind: 'fish', zone },
      metric: { kind: 'counter', key: `manual.variant.${zone}` },
      threshold: 1,
      reward: { kind: 'gold', gold: rewards.variant },
    },
  ];
});

const PERFECT_RULES: AchievementRule[] = [
  counterRule('perfect-100', 'PERFECT 백 번', 'PERFECT 판정으로 물고기를 100마리 낚아요.', 'catch.perfect', 100, 10_000),
  counterRule('perfect-1000', 'PERFECT 천 번', 'PERFECT 판정으로 물고기를 1,000마리 낚아요.', 'catch.perfect', 1_000, 100_000),
  counterRule('perfect-10000', 'PERFECT 만 번', 'PERFECT 판정으로 물고기를 10,000마리 낚아요.', 'catch.perfect', 10_000, 1_000_000),
];

const AUTO_RULES: AchievementRule[] = [
  counterRule('auto-1000', '방치 천 마리', '방치로 물고기를 1,000마리 낚아요.', 'catch.auto', 1_000, 20_000),
  counterRule('auto-10000', '방치 만 마리', '방치로 물고기를 10,000마리 낚아요.', 'catch.auto', 10_000, 200_000),
  counterRule('auto-100000', '방치 십만 마리', '방치로 물고기를 100,000마리 낚아요.', 'catch.auto', 100_000, 2_000_000),
];

const BAIT_RULES: AchievementRule[] = [
  counterRule('bait-10', '미끼 열 번', '미끼를 써서 물고기를 10마리 낚아요.', 'catch.bait', 10, 5_000),
  counterRule('bait-100', '미끼 백 번', '미끼를 써서 물고기를 100마리 낚아요.', 'catch.bait', 100, 50_000),
  counterRule('bait-1000', '미끼 천 번', '미끼를 써서 물고기를 1,000마리 낚아요.', 'catch.bait', 1_000, 500_000),
];

const NAMED_FLAWLESS_RULES: AchievementRule[] = [
  counterRule('named-flawless-1', '무결점 토벌', '실패 없이 네임드 결투를 1번 이겨요.', 'named.flawless', 1, 100_000),
  counterRule('named-flawless-10', '무결점 토벌 열 번', '실패 없이 네임드 결투를 10번 이겨요.', 'named.flawless', 10, 500_000),
  counterRule('named-flawless-50', '무결점 토벌 쉰 번', '실패 없이 네임드 결투를 50번 이겨요.', 'named.flawless', 50, 2_000_000),
];

const SELL_GOLD_RULES: AchievementRule[] = [
  counterRule('sell-1000000', '판매 백만 골드', '물고기를 판매해 골드를 1,000,000 이상 모아요.', 'sell.gold', 1_000_000, 30_000),
  counterRule('sell-10000000', '판매 천만 골드', '물고기를 판매해 골드를 10,000,000 이상 모아요.', 'sell.gold', 10_000_000, 300_000),
  counterRule('sell-100000000', '판매 억 골드', '물고기를 판매해 골드를 100,000,000 이상 모아요.', 'sell.gold', 100_000_000, 3_000_000),
];

const BIG_SPECIES_RULES: AchievementRule[] = [
  {
    id: 'big-100', tab: 'count', name: '월척 백 종',
    desc: '월척 기록이 있는 어종이 100종 이상이에요.',
    selector: { kind: 'fish' }, metric: { kind: 'bigSpecies' }, threshold: 100,
    reward: { kind: 'gold', gold: 300_000 },
  },
  {
    id: 'big-200', tab: 'count', name: '월척 이백 종',
    desc: '월척 기록이 있는 어종이 200종 이상이에요.',
    selector: { kind: 'fish' }, metric: { kind: 'bigSpecies' }, threshold: 200,
    reward: { kind: 'gold', gold: 1_500_000 },
  },
];

const COUNT_EXPANSION_RULES: AchievementRule[] = [
  ...MANUAL_TOTAL_RULES,
  ...MANUAL_LEGENDARY_TOTAL_RULES,
  ...MANUAL_VARIANT_TOTAL_RULES,
  ...MANUAL_ZONE_RULES,
  ...PERFECT_RULES,
  ...AUTO_RULES,
  ...BAIT_RULES,
  ...NAMED_FLAWLESS_RULES,
  ...SELL_GOLD_RULES,
  ...BIG_SPECIES_RULES,
];

/** 기존 24개 업적의 선언적 규칙 — id·이름·설명·탭·보상은 기존 정의와 같다 */
export const ACHIEVEMENT_RULES: readonly AchievementRule[] = [
  ...ZONE_PROGRESS_RULES,
  ...COLLECTION_RULES,
  ...NAMED_ARTIFACT_RULES,
  ...COUNT_RULES,
  ...COUNT_EXPANSION_RULES,
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
