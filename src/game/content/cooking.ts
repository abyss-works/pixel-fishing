// 요리 콘텐츠 — 레시피 표, 기운 아이템, 조리 대기·보관함·슬롯 지속, 해금 배 단계.
// 수량과 효과 값은 이 파일의 표 한 곳에서만 바꾼다. 규칙 모듈은 값을 다시 적지 않고 이 표를 읽는다.
// 레시피 id는 완성품이 items에 쌓이는 키이며 표시 이름과 분리된 고정 신분증이다. 표시 이름은 콘텐츠 값이다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버의 import 그래프에 포함된다.
import { RARITY_ORDER } from './rarity.js';
import type { RarityId } from './rarity.js';
import { zoneById } from './zones.js';

// ---------- 해금 ----------

/** 요리가 열리는 배 단계 — 인도양으로 들어서는 배 단계에서 파생한다 */
export const COOKING_UNLOCK_BOAT: number = (() => {
  const tier = zoneById('indian')?.entryBoat;
  if (tier === undefined) throw new Error('인도양 존의 진입 배 단계가 없어요.');
  return tier;
})();

// ---------- 기운 ----------

/** 생명의 기운 아이템 id — 등급마다 하나. 표시 이름과 등급 표기는 화면이 정한다 */
export const ENERGY_ITEM_IDS: Readonly<Record<RarityId, string>> = {
  common: 'energy-common',
  rare: 'energy-rare',
  epic: 'energy-epic',
  legendary: 'energy-legendary',
};

// ---------- 종류별 규칙 ----------

export type CookKind = 'lunch' | 'bait';

const MIN_MS = 60_000;

/** 종류별 조리 대기(1개당)와 슬롯 지속. 도시락은 도시락 슬롯, 미끼 요리는 미끼 슬롯에 들어간다 */
export const COOK_KIND_RULES: Readonly<Record<CookKind, { waitMs: number; slotMs: number }>> = {
  lunch: { waitMs: 60 * MIN_MS, slotMs: 9 * 60 * MIN_MS },
  bait: { waitMs: 15 * MIN_MS, slotMs: 30 * MIN_MS },
};

/** 보관함 상한 — 완성품과 조리 중인 수량의 합 */
export const COOK_STORAGE_CAP = 10;

// ---------- 효과 ----------

/** 등급 가중치 보너스 — grades의 가중치에 bonus(예: 0.1 = +10%)를 더한다 */
export interface RarityWeightEffect { grades: readonly RarityId[]; bonus: number }

/** 요리 효과 — 같은 대상에 걸리는 다른 보너스와 더해 한 번 적용하는 보너스 효과다 */
export interface CookEffects {
  /** 입질 대기 감소율 (예: 0.1 = −10%) */
  biteWaitCut?: number;
  /** 등급 가중치 증가 */
  rarityWeight?: RarityWeightEffect;
  /** 돌연변이 폼 가중치 증가율 (예: 0.5 = +50%) */
  mutationWeight?: number;
  /** 네임드 조우 가중치 증가율 */
  namedWeight?: number;
  /** GOOD, PERFECT 영역 폭을 넓히는 값 */
  judgeWidth?: number;
}

export const COOK_EFFECT_KEYS: readonly (keyof CookEffects)[] =
  ['biteWaitCut', 'rarityWeight', 'mutationWeight', 'namedWeight', 'judgeWidth'];

/** 판정 칸(미끼)이 영역 폭을 넓히는 값 — 열린 항목이라 밸런스 도구로 잰 뒤 정한다. 기본 0(효과 없음) */
export const JUDGE_WIDTH_BONUS = 0;

/** 그 등급부터 전설까지 */
const gradesFrom = (min: RarityId): readonly RarityId[] => RARITY_ORDER.slice(RARITY_ORDER.indexOf(min));

// ---------- 레시피 ----------

export interface Recipe {
  id: string;
  name: string;
  kind: CookKind;
  /** 기운 요구 — 등급별 개수(1개를 만드는 데 드는 양) */
  cost: Readonly<Partial<Record<RarityId, number>>>;
  effects: CookEffects;
}

export const RECIPES: readonly Recipe[] = [
  // 도시락 — 도시락 슬롯, 방치 캐치에 적용
  { id: 'cook-lunch-bite', name: '가루디야', kind: 'lunch',
    cost: { common: 600 }, effects: { biteWaitCut: 0.1 } },
  { id: 'cook-lunch-rare', name: '민 몰리', kind: 'lunch',
    cost: { common: 100, rare: 20 }, effects: { rarityWeight: { grades: gradesFrom('rare'), bonus: 0.1 } } },
  { id: 'cook-lunch-mutation', name: '생선 비리야니', kind: 'lunch',
    cost: { rare: 20, epic: 4 }, effects: { mutationWeight: 0.5 } },
  { id: 'cook-lunch-named', name: '암불 티얄', kind: 'lunch',
    cost: { epic: 8 }, effects: { namedWeight: 0.5 } },
  { id: 'cook-lunch-bundle', name: '생선 탈리', kind: 'lunch',
    cost: { common: 50, rare: 5, epic: 1, legendary: 1 },
    effects: { biteWaitCut: 0.05, rarityWeight: { grades: gradesFrom('rare'), bonus: 0.05 } } },
  // 미끼 요리 — 미끼 슬롯, 수동 캐치에 적용
  { id: 'cook-bait-judge', name: '메이스 미끼', kind: 'bait',
    cost: { common: 50, rare: 5 }, effects: { judgeWidth: JUDGE_WIDTH_BONUS } },
  { id: 'cook-bait-mutation', name: '사프란 미끼', kind: 'bait',
    cost: { epic: 4, legendary: 1 }, effects: { mutationWeight: 1 } },
  { id: 'cook-bait-rare', name: '롱페퍼 미끼', kind: 'bait',
    cost: { common: 50, rare: 15 },
    effects: { rarityWeight: { grades: gradesFrom('rare'), bonus: 0.2 } } },
  { id: 'cook-bait-epic', name: '큐베브 미끼', kind: 'bait',
    cost: { common: 50, epic: 5 },
    effects: { rarityWeight: { grades: gradesFrom('epic'), bonus: 0.4 } } },
  { id: 'cook-bait-legendary', name: '용연향 미끼', kind: 'bait',
    cost: { common: 50, legendary: 3 },
    effects: { rarityWeight: { grades: gradesFrom('legendary'), bonus: 0.6 } } },
];

/** id → 레시피. 없는 id와 문자열이 아닌 입력은 undefined */
export const recipeById = (id: unknown): Recipe | undefined =>
  typeof id === 'string' ? RECIPES.find(r => r.id === id) : undefined;

// ---------- 이전 미끼 ----------

/** 이전 미끼 4종의 정가 — 세이브 이관이 보유 개수를 이 값으로 골드로 바꾼다 */
export const LEGACY_BAIT_REFUND: Readonly<Record<string, number>> = {
  'bait-common': 25,
  'bait-rare': 200,
  'bait-epic': 1000,
  'bait-legendary': 2500,
};
