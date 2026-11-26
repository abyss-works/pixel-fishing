// 라이브 이벤트 전용 어종·규칙·보상 상수 — 일반 어종(FISH) 및 상시 도감과 분리된 단일 정본.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import type { FishShape } from './fish.js';
import type { RarityId } from './rarity.js';

export interface EventFish {
  readonly id: string;
  readonly name: string;
  readonly rarity: RarityId;
  readonly score: number;
  readonly color: string;
  readonly shape: FishShape;
  readonly lore: string;
  readonly variant: {
    readonly name: string;
    readonly score: number;
    readonly color: string;
    readonly lore: string;
  };
}

/** 이벤트 2(강태공 선수권 대회) 전용 어종 9종 */
export const EVENT_FISH: readonly EventFish[] = [
  {
    id: 'event-boxfish',
    name: '거북복',
    rarity: 'common',
    score: 10,
    color: '#a1887f',
    shape: 'round',
    lore: '단단한 배를 부풀려 찌를 밀어내는 익살꾼이다.',
    variant: {
      name: '심홍 거북복',
      score: 20,
      color: '#d32f2f',
      lore: '각진 몸통에 짙은 붉은빛이 번져 맑은 물에서도 단번에 눈에 띈다.',
    },
  },
  {
    id: 'event-snow-smelt',
    name: '눈꽃 빙어',
    rarity: 'common',
    score: 10,
    color: '#b3e5fc',
    shape: 'tiny',
    lore: '겨울 물결에 얼음 가루를 흩뿌리며 무리 지어 다닌다.',
    variant: {
      name: '진주 눈꽃 빙어',
      score: 20,
      color: '#fff8e1',
      lore: '작은 비늘마다 뽀얀 윤기가 감돌아 볕이 비치면 옅은 무지갯빛이 어린다.',
    },
  },
  {
    id: 'event-hagfish',
    name: '먹장어',
    rarity: 'common',
    score: 10,
    color: '#546e7a',
    shape: 'eel',
    lore: '바닥 틈새에서 소리 없이 솟아 바늘을 감아 쥔다.',
    variant: {
      name: '백옥 먹장어',
      score: 20,
      color: '#cfd8dc',
      lore: '가늘고 매끈한 살결이 티 없이 희어 어두운 진흙 위에서도 선명하게 드러난다.',
    },
  },
  {
    id: 'event-gurnard',
    name: '성대',
    rarity: 'rare',
    score: 30,
    color: '#ef6c00',
    shape: 'flowing',
    lore: '가슴지느러미를 펼쳐 물밑을 미끄러지듯 걷는다.',
    variant: {
      name: '청동 성대',
      score: 60,
      color: '#cd7f32',
      lore: '단단한 머리 껍데기에 푸른 기 도는 구릿빛이 어려 건져 올리면 낮게 울린다.',
    },
  },
  {
    id: 'event-winter-sandfish',
    name: '도루묵',
    rarity: 'rare',
    score: 30,
    color: '#b0bec5',
    shape: 'slim',
    lore: '차가운 해류가 들 때마다 먼저 모습을 비추는 손님이다.',
    variant: {
      name: '백설 도루묵',
      score: 60,
      color: '#eceff1',
      lore: '하얀 옆구리가 갓 내린 눈을 닮아 살얼음 틈에서도 빛깔이 겹친다.',
    },
  },
  {
    id: 'event-torpedo-ray',
    name: '전기가오리',
    rarity: 'rare',
    score: 30,
    color: '#455a64',
    shape: 'ray',
    lore: '스치는 순간 낚싯대 끝까지 찌릿한 진동이 전해진다.',
    variant: {
      name: '백옥 전기가오리',
      score: 60,
      color: '#e1f5fe',
      lore: '맑고 둥근 등판 아래로 푸른 맥이 비치며 가까이 가면 수면의 잔물결이 떤다.',
    },
  },
  {
    id: 'event-frost-swordfish',
    name: '서리 황새치',
    rarity: 'epic',
    score: 100,
    color: '#81d4fa',
    shape: 'predator',
    lore: '서릿발 같은 긴 주둥이로 얼어붙은 수면을 단숨에 가른다.',
    variant: {
      name: '백금 서리 황새치',
      score: 200,
      color: '#e3f2fd',
      lore: '높게 솟은 등지느러미에 차가운 은백색 광택이 서려 뱃전에 올라와서도 번뜩인다.',
    },
  },
  {
    id: 'event-chimaera',
    name: '은상어',
    rarity: 'epic',
    score: 100,
    color: '#78909c',
    shape: 'shark',
    lore: '겨울밤 수면 아래를 조용히 맴도는 은빛 사냥꾼이다.',
    variant: {
      name: '흑은상어',
      score: 200,
      color: '#263238',
      lore: '검게 가라앉은 등빛이 물그림자에 섞여 그 아래에서는 희미한 눈빛과 긴 꼬리 끝만 스친다.',
    },
  },
  {
    id: 'event-glaaki',
    name: '글라키',
    rarity: 'legendary',
    score: 400,
    color: '#37474f',
    shape: 'ancient',
    lore: '바다와 닿은 적 없는 화구호 바닥에서 쇠가시를 세운 채 올라오는데도 아가미에서 짠물 냄새가 난다.',
    variant: {
      name: '태고의 글라키',
      score: 800,
      color: '#b0bec5',
      lore: '등줄기를 덮은 잿빛 껍질 위로 물이 고이기 전 화산재가 눌어붙은 듯 거친 무늬가 남아 있다.',
    },
  },
];

export const EVENT_FISH_BY_ID: ReadonlyMap<string, EventFish> = new Map(
  EVENT_FISH.map(f => [f.id, f]),
);

export function eventFishById(id: unknown): EventFish | undefined {
  return typeof id === 'string' ? EVENT_FISH_BY_ID.get(id) : undefined;
}

/** 이벤트 2 표준 스펙 (Lv20 기준) */
export const EVENT2_STANDARD_SPEC = {
  rodLevel: 20,
  power: 105,
  powerReq: 105,
  idleBoost: 5,
  biteMinSec: 2.3,
  biteMaxSec: 4.3,
  weights: [7400, 2000, 500, 100] as const,
  variantEv: 1.25,
} as const;

/** 이벤트 2 10점당 정산 단가 (배 0~9단계 × 방치/수동 1.3배 골드, 명성 고정) */
export const EVENT2_SETTLEMENT_RATES = {
  idle: [9, 12, 19, 84, 84, 128, 260, 979, 4569, 19534] as const,
  manual: [19, 24, 40, 208, 208, 318, 651, 2602, 12609, 55027] as const,
  fame: 4,
} as const;

export interface EventTrioTarget {
  readonly fishId: string;
  readonly form: 'normal' | 'variant';
}

/** 이벤트 1 기본 3슬롯 목표 */
export const EVENT1_TRIO_TARGETS: readonly EventTrioTarget[] = [
  { fishId: 'mackerel', form: 'normal' },
  { fishId: 'squid', form: 'normal' },
  { fishId: 'sailfish', form: 'normal' },
];

/** 이벤트 2 도감 완성 한정 모자 id */
export const EVENT_HAT_IDS = {
  normal: 'event-hat-basin-conical',
  variant: 'event-hat-abyss-crown',
} as const;
