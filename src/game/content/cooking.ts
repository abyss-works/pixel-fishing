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
  lunch: { waitMs: 15 * MIN_MS, slotMs: 9 * 60 * MIN_MS },
  bait: { waitMs: 1 * MIN_MS, slotMs: 30 * MIN_MS },
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
  /** 레시피 상세 머리에 이름 아래 보이는 로어 두 문장 */
  description: string;
  kind: CookKind;
  /** 기운 요구 — 등급별 수량(1개를 만드는 데 드는 양). 사람이 읽는 화면 단위로 적고 소수 첫째 자리까지 허용한다 */
  cost: Readonly<Partial<Record<RarityId, number>>>;
  effects: CookEffects;
}

export const RECIPES: readonly Recipe[] = [
  // 도시락 — 도시락 슬롯, 방치 캐치에 적용
  { id: 'cook-lunch-bite', name: '가루디야',
    description: '소금물에 끓인 다랑어 국물에서 짠 김이 피어오른다. 그릇을 다 비우기도 전에 찌가 먼저 가라앉는다.',
    kind: 'lunch',
    cost: { common: 600 }, effects: { biteWaitCut: 0.1 } },
  { id: 'cook-lunch-rare', name: '민 몰리',
    description: '코코넛 밀크와 강황으로 끓인 국물에 생선 살이 잠긴다. 귀한 생선을 넣을수록 맛이 깊어진다.',
    kind: 'lunch',
    cost: { common: 100, rare: 20 }, effects: { rarityWeight: { grades: gradesFrom('rare'), bonus: 0.1 } } },
  { id: 'cook-lunch-mutation', name: '생선 비리야니',
    description: '솥을 봉한 반죽을 뜯어내면 향신료 냄새가 한꺼번에 퍼진다. 밝은 빛으로 따로 물들인 밥이 생선과 켜를 이룬다.',
    kind: 'lunch',
    cost: { rare: 20, epic: 4 }, effects: { mutationWeight: 0.5 } },
  { id: 'cook-lunch-named', name: '암불 티얄',
    description: '고라카 열매의 신맛이 바짝 졸인 다랑어 살 속까지 밴다. 콜롬보항 뱃사람들은 큰 그림자를 쫓아 오래 나가는 날 이 요리를 싣는다.',
    kind: 'lunch',
    cost: { epic: 8 }, effects: { namedWeight: 0.5 } },
  { id: 'cook-lunch-bundle', name: '생선 탈리',
    description: '밥을 가운데 두고 생선 반찬을 작은 그릇에 나눠 둥근 쟁반에 차린 인도식 한 상이다. 그릇마다 양은 적어도 빠진 맛이 없다.',
    kind: 'lunch',
    cost: { common: 50, rare: 5, epic: 1, legendary: 1 },
    effects: { biteWaitCut: 0.05, rarityWeight: { grades: gradesFrom('rare'), bonus: 0.05 } } },
  // 미끼 요리 — 미끼 슬롯, 수동 캐치에 적용
  { id: 'cook-bait-mutation', name: '사프란 미끼',
    description: '붉은 사프란 암술을 물에 담그면 금빛이 번져 나온다. 이 미끼를 문 물고기는 가끔 비늘 빛부터 남다르다.',
    kind: 'bait',
    cost: { epic: 4, legendary: 1 }, effects: { mutationWeight: 1 } },
  { id: 'cook-bait-rare', name: '롱페퍼 미끼',
    description: '롱페퍼 이삭을 말려 빻아 반죽에 섞은 미끼다. 후추보다 이 열매가 비싸게 팔리던 때가 있었다.',
    kind: 'bait',
    cost: { common: 50, rare: 15 },
    effects: { rarityWeight: { grades: gradesFrom('rare'), bonus: 0.2 } } },
  { id: 'cook-bait-epic', name: '큐베브 미끼',
    description: '큐베브 열매에는 짧은 꼬리 같은 꼭지가 하나씩 달려 있다. 아린 맛이 오래 남는 열매 가루가 물에 풀리면 덩치 큰 것들이 먼저 줄을 당긴다.',
    kind: 'bait',
    cost: { common: 50, epic: 5 },
    effects: { rarityWeight: { grades: gradesFrom('epic'), bonus: 0.4 } } },
  { id: 'cook-bait-legendary', name: '용연향 미끼',
    description: '해변에 밀려온 용연향 덩어리를 옛 중국 사람들은 용이 흘린 침이 굳은 것으로 여겼다. 이 냄새를 따라 이야기로만 듣던 물고기가 올라오기도 한다.',
    kind: 'bait',
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
