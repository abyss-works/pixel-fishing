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

/** 기운의 저장·계산 단위 — 화면 단위 1은 저장 단위 ENERGY_UNIT이다. 저장과 계산은 이 단위의 정수로 하고 화면에서만 나눈다 */
export const ENERGY_UNIT = 10;

/** 개체 하나에서 얻는 기운(저장 단위) — 화면 단위 1 */
export const ENERGY_PER_INDIVIDUAL = ENERGY_UNIT;

/** 기운 아이템 id인가 */
export const isEnergyItemId = (id: string): boolean => (Object.values(ENERGY_ITEM_IDS) as string[]).includes(id);

/** 화면 단위 수량이 소수 첫째 자리까지로 적힌 0 이상의 유한한 수인가 — 저장 단위로 바꾸면 정수가 되는 값만 true */
export const isEnergyAmount = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && Math.abs(x * ENERGY_UNIT - Math.round(x * ENERGY_UNIT)) < 1e-9;

/** 화면 단위 수량 → 저장 단위 정수. 소수 연산의 오차는 반올림으로 걷어 낸다 */
export const toStoredEnergy = (amount: number): number => Math.round(amount * ENERGY_UNIT);

/** 저장 단위 기운 → 화면 문자열. 소수 첫째 자리가 0이면 정수, 아니면 소수 첫째 자리까지, 정수부는 천 단위 쉼표.
 *  정수가 아닌 입력은 가장 가까운 저장 단위로 반올림하고, 유한하지 않은 수는 0으로 표시한다 */
export function formatEnergy(input: number): string {
  const stored = Number.isFinite(input) ? Math.round(input) : 0;
  const whole = Math.trunc(stored / ENERGY_UNIT);
  const tenth = Math.abs(stored % ENERGY_UNIT);
  return `${whole.toLocaleString('ko-KR')}${tenth === 0 ? '' : `.${tenth}`}`;
}

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
}

export const COOK_EFFECT_KEYS: readonly (keyof CookEffects)[] =
  ['biteWaitCut', 'rarityWeight', 'mutationWeight', 'namedWeight'];

/** 그 등급부터 전설까지 */
const gradesFrom = (min: RarityId): readonly RarityId[] => RARITY_ORDER.slice(RARITY_ORDER.indexOf(min));

// ---------- 레시피 ----------

export interface Recipe {
  id: string;
  name: string;
  kind: CookKind;
  /** 기운 요구 — 등급별 수량(1개를 만드는 데 드는 양). 사람이 읽는 화면 단위로 적고 소수 첫째 자리까지 허용한다 */
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

/** 그 레시피 1개의 등급별 기운 요구(저장 단위). 요구가 없는 등급은 0 */
export const recipeCostStored = (recipe: Recipe, grade: RarityId): number => toStoredEnergy(recipe.cost[grade] ?? 0);

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
