// 업적 콘텐츠 — 24개 업적 정의, 카운터 키, 탭, 보상 타입의 단일 근원.
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { BOUNTY_ZONES } from './bounties.js';
import type { BountyZone } from './bounties.js';
import { zoneById } from './zones.js';

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

const ZONE_PROGRESS_REWARDS: Record<BountyZone, { basic: number; full: number }> = {
  pacific: { basic: 25_000, full: 25_000 },
  seasia: { basic: 150_000, full: 100_000 },
  indian: { basic: 400_000, full: 350_000 },
  madagascar: { basic: 1_500_000, full: 1_500_000 },
  southatlantic: { basic: 5_000_000, full: 5_000_000 },
};

const PROGRESS_ACHIEVEMENTS: AchievementDef[] = BOUNTY_ZONES.flatMap(zone => {
  const zoneName = zoneById(zone)?.name ?? zone;
  const rewards = ZONE_PROGRESS_REWARDS[zone];
  return [
    {
      id: `zone-basic-${zone}`,
      tab: 'progress' as const,
      name: `${zoneName} 도감`,
      desc: `${zoneName}의 일반 폼을 전설만 빼고 모두 모아요.`,
      reward: { kind: 'gold' as const, gold: rewards.basic },
    },
    {
      id: `zone-full-${zone}`,
      tab: 'progress' as const,
      name: `${zoneName} 도감 완결`,
      desc: `${zoneName}의 일반 폼을 전설까지 모두 모아요.`,
      reward: { kind: 'gold' as const, gold: rewards.full },
    },
  ];
});

const HAT_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'variant-village',
    tab: 'collection',
    name: '마을 돌연변이 도감',
    desc: '마을 물가 어종의 돌연변이를 모두 모아요.',
    reward: { kind: 'hat', hatId: 'straw-hat' },
  },
  {
    id: 'variant-pacific',
    tab: 'collection',
    name: '태평양 돌연변이 도감',
    desc: '태평양 어종의 돌연변이를 모두 모아요.',
    reward: { kind: 'hat', hatId: 'sou-wester' },
  },
  {
    id: 'variant-seasia',
    tab: 'collection',
    name: '동남아&오세아니아 돌연변이 도감',
    desc: '동남아&오세아니아 어종의 돌연변이를 모두 모아요.',
    reward: { kind: 'hat', hatId: 'coral-bandana' },
  },
  {
    id: 'variant-indian',
    tab: 'collection',
    name: '인도양 돌연변이 도감',
    desc: '인도양 어종의 돌연변이를 모두 모아요.',
    reward: { kind: 'hat', hatId: 'saffron-turban' },
  },
  {
    id: 'variant-madagascar',
    tab: 'collection',
    name: '마다가스카르 돌연변이 도감',
    desc: '마다가스카르 어종의 돌연변이를 모두 모아요.',
    reward: { kind: 'hat', hatId: 'worn-tricorn' },
  },
  {
    id: 'variant-southatlantic',
    tab: 'collection',
    name: '남대서양 돌연변이 도감',
    desc: '남대서양 어종의 돌연변이를 모두 모아요.',
    reward: { kind: 'hat', hatId: 'fog-beanie' },
  },
  {
    id: 'variant-all',
    tab: 'collection',
    name: '전 구역 돌연변이 도감',
    desc: '모든 구역 어종의 돌연변이를 모두 모아요.',
    reward: { kind: 'hat', hatId: 'braid-captain-cap' },
  },
  {
    id: 'grade-legendary',
    tab: 'collection',
    name: '전설 도감',
    desc: '전설 등급 어종의 일반 폼을 모두 모아요.',
    reward: { kind: 'hat', hatId: 'anchor-beret' },
  },
  {
    id: 'night-normal',
    tab: 'collection',
    name: '한밤 도감',
    desc: '밤에만 나타나는 어종의 일반 폼을 모두 모아요.',
    reward: { kind: 'hat', hatId: 'watch-sailor-cap' },
  },
  {
    id: 'night-variant',
    tab: 'collection',
    name: '한밤 돌연변이 도감',
    desc: '밤에만 나타나는 어종의 돌연변이를 모두 모아요.',
    reward: { kind: 'hat', hatId: 'earflap-cap' },
  },
  {
    id: 'big-50',
    tab: 'collection',
    name: '월척 장부',
    desc: '월척을 50종 이상 낚아요.',
    reward: { kind: 'hat', hatId: 'lure-bucket-hat' },
  },
  {
    id: 'named-all',
    tab: 'namedArtifact',
    name: '수배판 완결',
    desc: '모든 네임드를 한 번 이상 쓰러뜨려요.',
    reward: { kind: 'hat', hatId: 'harpooner-pillbox' },
  },
  {
    id: 'artifact-all',
    tab: 'namedArtifact',
    name: '유물 전집',
    desc: '모든 유물을 모아요.',
    reward: { kind: 'hat', hatId: 'shipowner-bowler' },
  },
  {
    id: 'catch-100000',
    tab: 'count',
    name: '십만 마리 낚시꾼',
    desc: '일반 어종을 합쳐 100,000마리 이상 낚아요.',
    reward: { kind: 'hat', hatId: 'salt-fisher-cap' },
  },
];

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...PROGRESS_ACHIEVEMENTS,
  ...HAT_ACHIEVEMENTS,
];

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
const ACHIEVEMENT_BY_HAT_ID = new Map(
  ACHIEVEMENTS.filter(a => a.reward.kind === 'hat').map(a => [(a.reward as { kind: 'hat'; hatId: string }).hatId, a]),
);

export const achievementById = (id: unknown): AchievementDef | undefined =>
  typeof id === 'string' ? ACHIEVEMENT_BY_ID.get(id) : undefined;

export const achievementForHatId = (hatId: unknown): AchievementDef | undefined =>
  typeof hatId === 'string' ? ACHIEVEMENT_BY_HAT_ID.get(hatId) : undefined;
