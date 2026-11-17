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
import { topZoneOfSpot, zoneById } from './zones.js';
import type { ZoneId } from './zones.js';

export const ACHIEVEMENT_COUNTER_KEYS = [
  'sell.gold',
  'catch.perfect',
  'catch.auto',
  'catch.bait',
  'named.flawless',
] as const;

export type AchievementCounterKey = (typeof ACHIEVEMENT_COUNTER_KEYS)[number];
export type AchievementCounters = Partial<Record<AchievementCounterKey, number>>;
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

/** 현재 24개 업적의 선언적 규칙 — id·이름·설명·탭·보상은 기존 정의와 같다 */
export const ACHIEVEMENT_RULES: readonly AchievementRule[] = [
  ...ZONE_PROGRESS_RULES,
  ...COLLECTION_RULES,
  ...NAMED_ARTIFACT_RULES,
  ...COUNT_RULES,
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
