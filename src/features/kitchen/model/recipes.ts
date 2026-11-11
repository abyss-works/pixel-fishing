// 요리 탭 모델 — 레시피 표시값, 필요와 보유, 조리 가능 판정, 조리 상태 줄.
// 조리 가능 여부는 게임 규칙(canCook)이, 보관함 수와 완성 수는 게임 규칙(cookStorageUsed, cookingProgress)이 정한다.
// 이 모듈은 그 판정을 화면용 값으로 옮기고, 규칙의 매개변수(수량, 대기, 지속, 효과 값)는 콘텐츠 표에서 읽는다.
import { COOK_EFFECT_KEYS, COOK_KIND_RULES, COOK_STORAGE_CAP, ENERGY_ITEM_IDS, RECIPES } from '../../../game/content/cooking';
import type { CookKind, Recipe } from '../../../game/content/cooking';
import { RARITY, RARITY_ORDER } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';
import { canCook, cookingProgress, cookStorageUsed, settleCooking } from '../../../game/rules/cooking';
import { extraCookChance } from '../../../game/rules/artifactLevel';
import type { GameState } from '../../../game/rules/logic';
import type { RuleCheck } from '../../../game/rules/rules';

const MIN_MS = 60_000;

/** 그 종류의 레시피 — 콘텐츠 순서대로 */
export const recipesOfKind = (kind: CookKind): Recipe[] => RECIPES.filter(r => r.kind === kind);

/** 등급 미끼의 등급 — 등급 가중 효과가 가중하는 가장 낮은 등급. 미끼 요리 중 등급 가중이 없는 것과 도시락은 null이다 */
export function recipeGrade(recipe: Recipe): RarityId | null {
  return recipe.kind === 'bait' ? recipe.effects.rarityWeight?.grades[0] ?? null : null;
}

export interface RecipeEffectLine { label: string; value: string }

/** 소수 둘째 자리까지, 끝의 0은 뺀다 */
const pct = (x: number): string => String(Number((x * 100).toFixed(2)));

/** 효과 줄 — 이름은 왼쪽, 값은 오른쪽에 쓴다. 등급 가중은 가중되는 등급마다 한 줄이다 */
export function recipeEffectLines(recipe: Recipe): RecipeEffectLine[] {
  const e = recipe.effects;
  return COOK_EFFECT_KEYS.flatMap((key): RecipeEffectLine[] => {
    switch (key) {
      case 'biteWaitCut':
        return e.biteWaitCut === undefined ? [] : [{ label: '입질 대기', value: `−${pct(e.biteWaitCut)}%` }];
      case 'rarityWeight':
        return e.rarityWeight === undefined ? [] : e.rarityWeight.grades.map(g => (
          { label: `${RARITY[g].name} 등급 가중치`, value: `+${pct(e.rarityWeight!.bonus)}%` }));
      case 'mutationWeight':
        return e.mutationWeight === undefined ? [] : [{ label: '돌연변이 폼 가중치', value: `+${pct(e.mutationWeight)}%` }];
      case 'namedWeight':
        return e.namedWeight === undefined ? [] : [{ label: '네임드 조우 가중치', value: `+${pct(e.namedWeight)}%` }];
      case 'judgeWidth':
        return e.judgeWidth === undefined ? [] : ['GOOD', 'PERFECT'].map(zone => (
          { label: `${zone} 영역 폭`, value: `+${e.judgeWidth}%p` }));
    }
  });
}

export interface RecipeCostRow { grade: RarityId; need: number; have: number; short: boolean }
export interface RecipeUnitCost { grade: RarityId; per: number; short: boolean }

export interface RecipeView {
  recipe: Recipe;
  grade: RarityId | null;
  /** 가진 완성품 수 */
  owned: number;
  effects: RecipeEffectLine[];
  /** 1개를 만드는 데 드는 기운 — 목록 줄용. 모자라는 등급은 short */
  unitCost: RecipeUnitCost[];
  /** 고른 수량만큼의 필요와 보유 */
  cost: RecipeCostRow[];
  /** 고른 수량. 보관함 남은 칸으로 줄이고, 가득하면 0 */
  count: number;
  /** 고를 수 있는 가장 큰 수량 — 보관함 남은 칸 */
  maxCount: number;
  /** 조리 시작 판정 — 게임 규칙의 판정 그대로 */
  check: RuleCheck;
  /** 고른 수량의 조리 시간(ms) */
  waitMs: number;
  /** 먹거나 쓴 뒤 슬롯 효과가 이어지는 시간(ms) */
  slotMs: number;
  /** 진주 상인의 저울이 더하는 추가 완성 확률(0~1). 저울이 없으면 0 */
  extraChance: number;
}

export function selectRecipeView(game: GameState, recipe: Recipe, requested: number, now: string): RecipeView {
  const settled = settleCooking(game, now);
  const maxCount = Math.max(0, COOK_STORAGE_CAP - cookStorageUsed(settled));
  const count = maxCount === 0 ? 0 : Math.min(maxCount, Math.max(1, Math.floor(requested)));
  const have = (grade: RarityId): number => settled.items[ENERGY_ITEM_IDS[grade]] ?? 0;
  const needed = RARITY_ORDER.filter(g => (recipe.cost[g] ?? 0) > 0);
  const rules = COOK_KIND_RULES[recipe.kind];
  return {
    recipe, grade: recipeGrade(recipe), owned: settled.items[recipe.id] ?? 0,
    effects: recipeEffectLines(recipe),
    unitCost: needed.map(grade => ({ grade, per: recipe.cost[grade]!, short: have(grade) < recipe.cost[grade]! })),
    cost: needed.map(grade => {
      const need = recipe.cost[grade]! * count;
      return { grade, need, have: have(grade), short: have(grade) < need };
    }),
    count, maxCount,
    // 수량 0(보관함 가득)도 이유는 보관함이라, 판정은 최소 1개로 묻는다
    check: canCook(game, recipe.id, Math.max(1, count), now),
    waitMs: rules.waitMs * count, slotMs: rules.slotMs,
    extraChance: extraCookChance(game),
  };
}

export interface KitchenStatus {
  /** 조리 중인 것. 모두 완성됐거나 조리하지 않으면 null */
  cooking: { recipe: Recipe; completed: number; count: number; nextInMin: number } | null;
  /** 보관함 수 — 완성한 요리와 조리 중인 수량 */
  stored: number;
  cap: number;
  full: boolean;
}

export function selectKitchenStatus(game: GameState, now: string): KitchenStatus {
  const progress = cookingProgress(game, now);
  const stored = cookStorageUsed(settleCooking(game, now));
  const running = progress !== null && progress.nextAt !== null ? progress : null;
  return {
    cooking: running && running.nextAt !== null ? {
      recipe: running.recipe, completed: running.completed, count: running.count,
      nextInMin: Math.max(1, Math.ceil((Date.parse(running.nextAt) - Date.parse(now)) / MIN_MS)),
    } : null,
    stored, cap: COOK_STORAGE_CAP, full: stored >= COOK_STORAGE_CAP,
  };
}
