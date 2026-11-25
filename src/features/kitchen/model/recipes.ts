// 요리 탭 모델 — 레시피 표시값, 필요와 보유, 조리 가능 판정, 조리 상태 줄과 대기열.
// 조리 가능 여부는 게임 규칙(canCook)이, 보관함 수와 완성 수는 게임 규칙(cookStorageUsed, cookingProgress)이 정한다.
// 이 모듈은 그 판정을 화면용 값으로 옮기고, 규칙의 매개변수(수량, 대기, 지속, 효과 값)는 콘텐츠 표에서 읽는다.
import {
  COOK_EFFECT_KEYS, COOK_STORAGE_CAP, ENERGY_ITEM_IDS, RECIPES, formatEnergy, recipeById, recipeCostStored, recipeWaitMs,
} from '../../../game/content/cooking';
import type { CookKind, Recipe } from '../../../game/content/cooking';
import { DISPLAY_GRADE, RARITY, RARITY_ORDER, displayGradeRank } from '../../../game/content/rarity';
import type { DisplayGradeId, RarityId } from '../../../game/content/rarity';
import { canCook, cookRefundOf, cookingProgress, cookStorageUsed, settleCooking, slotDurationMs } from '../../../game/rules/cooking';
import { achievementBonusesOf } from '../../../game/rules/achievements';
import { extraCookChance } from '../../../game/rules/artifactLevel';
import type { GameState } from '../../../game/rules/logic';
import type { RuleCheck } from '../../../game/rules/rules';
import { gradeName } from '../../../shared/lib/gradeName';
import { energyLabel } from './energy';

const MIN_MS = 60_000;

/** 레시피의 표시 등급 — 도시락과 미끼 모두 콘텐츠 정본의 등급을 따른다 */
export function recipeGrade(recipe: Recipe): DisplayGradeId {
  return recipe.grade;
}

/** 그 종류의 부엌 레시피 — 등급순(특수는 뒤), 같은 등급은 콘텐츠 순서대로 */
export function recipesOfKind(kind: CookKind): Recipe[] {
  const rank = (r: Recipe): number => displayGradeRank(recipeGrade(r));
  return RECIPES.filter(r => r.kind === kind).sort((a, b) => rank(a) - rank(b));
}

/** 화면에 쓰는 레시피 이름을 이름과 표시 등급으로 나눈 값 — 괄호만 등급색으로 칠하는 화면이 쓴다. 등급이 없으면 grade는 null이다 */
export interface RecipeTitle { name: string; grade: DisplayGradeId | null }

export function recipeTitle(recipe: Recipe): RecipeTitle {
  return { name: recipe.name, grade: recipeGrade(recipe) };
}

/** 화면에 쓰는 레시피 이름 문자열 — 등급이 있으면 이름 뒤에 등급을 괄호로 붙인다. 메시지 기록과 접근성 이름이 쓴다 */
export function recipeLabel(recipe: Recipe): string {
  const { name, grade } = recipeTitle(recipe);
  return grade === null ? name : gradeName(name, DISPLAY_GRADE[grade].name);
}

/** 그 종류의 효과가 걸리는 낚시 - 보너스 탭, 칩 툴팁, 부엌 창이 같은 표기를 쓴다 */
export const SLOT_SCOPE: Readonly<Record<CookKind, string>> = { lunch: '방치로 낚을 때만', bait: '챔질해서 낚을 때만' };

// 효과 설명 — 종류마다 적용되는 낚시와 지속 시간이 다르다. 칩 줄의 슬롯 칩과 부엌 창이 같은 문안을 쓴다
const EFFECT_NOTE: Readonly<Record<CookKind, string>> = {
  lunch: `${SLOT_SCOPE.lunch} 효과가 있어요.\n지속 시간은 먹은 때부터 흐르고, 낚시하지 않거나 접속하지 않아도 멈추지 않아요.`,
  bait: `${SLOT_SCOPE.bait} 효과가 있어요.\n물고기를 낚아도 미끼가 줄지 않아요.\n지속 시간은 쓴 때부터 흐르고, 낚시하지 않거나 접속하지 않아도 멈추지 않아요.`,
};

/** 그 종류의 효과 설명 — 줄마다 줄바꿈으로 나뉜다 */
export const recipeEffectNote = (kind: CookKind): string => EFFECT_NOTE[kind];

export type RecipeEffectLine =
  | { label: string; value: string }
  | { text: string };

/** 밤 어종 출현 미끼의 상세 설명 — 키-값으로 쪼개지 않고 한 줄 설명으로 쓴다 */
export const NIGHT_UNLOCK_EFFECT_TEXT = '낮에도 밤 어종이 함께 낚여요.';

/** 효과 줄을 한 줄 문자열로 합친다 — 보너스 표와 검색 필터가 함께 쓴다 */
export const recipeEffectText = (line: RecipeEffectLine): string =>
  'text' in line ? line.text : `${line.label} ${line.value}`;

/** 소수 둘째 자리까지, 끝의 0은 뺀다 */
const pct = (x: number): string => String(Number((x * 100).toFixed(2)));

/** 효과 줄 — 수치 효과는 이름 왼쪽·값 오른쪽, 비수치 효과는 상세 설명 한 줄이다. 등급 가중은 가중되는 등급마다 한 줄이다 */
export function recipeEffectLines(recipe: Recipe): RecipeEffectLine[] {
  const e = recipe.effects;
  return COOK_EFFECT_KEYS.flatMap((key): RecipeEffectLine[] => {
    switch (key) {
      case 'biteWaitCut':
        return e.biteWaitCut === undefined ? [] : [{ label: '입질 대기', value: `−${pct(e.biteWaitCut)}%` }];
      case 'rarityWeight':
        return e.rarityWeight === undefined ? [] : e.rarityWeight.grades.map(g => (
          { label: `${RARITY[g].name} 어종 출현`, value: `+${pct(e.rarityWeight!.bonus)}%` }));
      case 'mutationWeight':
        return e.mutationWeight === undefined ? [] : [{ label: '돌연변이 출현', value: `+${pct(e.mutationWeight)}%` }];
      case 'namedWeight':
        return e.namedWeight === undefined ? [] : [{ label: '네임드 만날 확률', value: `+${pct(e.namedWeight)}%` }];
      case 'nightUnlock':
        return e.nightUnlock === true ? [{ text: NIGHT_UNLOCK_EFFECT_TEXT }] : [];
    }
  });
}

/** 기운 수량(per, need, have)은 모두 저장 단위다. 화면에서 formatEnergy로 바꾼다 */
export interface RecipeCostRow { grade: RarityId; need: number; have: number; short: boolean }
export interface RecipeUnitCost { grade: RarityId; per: number; short: boolean }

export type CookRunMode = 'instant' | 'start' | 'queue';

export interface RecipeView {
  recipe: Recipe;
  grade: DisplayGradeId;
  /** 이름과 표시 등급 - 괄호만 등급색으로 칠하는 화면용 */
  title: RecipeTitle;
  /** 가진 완성품 수 */
  owned: number;
  effects: RecipeEffectLine[];
  /** 1개를 만드는 데 드는 기운(저장 단위) — 목록 줄용. 모자라는 등급은 short */
  unitCost: RecipeUnitCost[];
  /** 고른 수량만큼의 필요와 보유 */
  cost: RecipeCostRow[];
  /** 고른 수량. 보관함 남은 칸으로 줄이고, 가득하면 0 */
  count: number;
  /** 고를 수 있는 가장 큰 수량 — 보관함 남은 칸 */
  maxCount: number;
  /** 조리 시작 판정 — 게임 규칙의 판정 그대로 */
  check: RuleCheck;
  /** 조리 버튼 실행 방식 — 즉시 완성 / 조리 시작 / 대기열 추가 */
  mode: CookRunMode;
  /** 1개 제작 대기 시간(ms) */
  unitWaitMs: number;
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
  const needed = RARITY_ORDER.filter(g => recipeCostStored(recipe, g) > 0);
  const unitWaitMs = recipeWaitMs(recipe);
  const mode: CookRunMode = unitWaitMs === 0 ? 'instant' : settled.cooking !== null ? 'queue' : 'start';
  return {
    recipe, grade: recipeGrade(recipe), title: recipeTitle(recipe), owned: settled.items[recipe.id] ?? 0,
    effects: recipeEffectLines(recipe),
    unitCost: needed.map(grade => {
      const per = recipeCostStored(recipe, grade);
      return { grade, per, short: have(grade) < per };
    }),
    cost: needed.map(grade => {
      const need = recipeCostStored(recipe, grade) * count;
      return { grade, need, have: have(grade), short: have(grade) < need };
    }),
    count, maxCount,
    // 수량 0(보관함 가득)도 이유는 보관함이라, 판정은 최소 1개로 묻는다
    check: canCook(game, recipe.id, Math.max(1, count), now),
    mode,
    unitWaitMs,
    waitMs: unitWaitMs * count,
    slotMs: slotDurationMs(recipe, game),
    extraChance: extraCookChance(game, achievementBonusesOf(game).artifactBoost),
  };
}

export interface KitchenRefundLine {
  grade: RarityId;
  label: string;
  amountText: string;
  stored: number;
}

export interface KitchenQueueEntry {
  id: string;
  recipe: Recipe;
  title: RecipeTitle;
  label: string;
  completed: number;
  count: number;
  pending: number;
  estimatedMin: number;
  isCurrent: boolean;
  refundLines: KitchenRefundLine[];
}

export interface KitchenStatus {
  /** 조리 중인 것. 모두 완성됐거나 조리하지 않으면 null */
  cooking: { id: string; recipe: Recipe; title: RecipeTitle; completed: number; count: number; nextInMin: number } | null;
  /** 현재 조리와 대기 중인 작업 목록 */
  queue: KitchenQueueEntry[];
  queueCount: number;
  /** 보관함 수 — 완성한 요리와 조리 중·대기열 수량의 합 */
  stored: number;
  cap: number;
  full: boolean;
}

function buildRefundLines(recipe: Recipe, pending: number): KitchenRefundLine[] {
  const refund = cookRefundOf(recipe, pending);
  return RARITY_ORDER
    .filter(grade => refund[grade] > 0)
    .map(grade => ({
      grade,
      label: energyLabel(grade),
      amountText: formatEnergy(refund[grade]),
      stored: refund[grade],
    }));
}

export function selectKitchenStatus(game: GameState, now: string): KitchenStatus {
  const settled = settleCooking(game, now);
  const stored = cookStorageUsed(settled);
  const rawProgress = cookingProgress(game, now);
  const settledProgress = cookingProgress(settled, now);

  const activeProgress = rawProgress && rawProgress.pending > 0
    ? rawProgress
    : settledProgress && settledProgress.pending > 0
      ? settledProgress
      : null;
  const waitingItems = rawProgress && rawProgress.pending > 0
    ? (game.cookingQueue ?? [])
    : settled.cookingQueue;

  const nowMs = Date.parse(now);
  const queue: KitchenQueueEntry[] = [];
  let cursorMs = nowMs;

  if (activeProgress && activeProgress.nextAt !== null) {
    cursorMs = Date.parse(activeProgress.finishAt);
    queue.push({
      id: activeProgress.id,
      recipe: activeProgress.recipe,
      title: recipeTitle(activeProgress.recipe),
      label: recipeLabel(activeProgress.recipe),
      completed: activeProgress.completed,
      count: activeProgress.count,
      pending: activeProgress.pending,
      estimatedMin: Math.max(1, Math.ceil((cursorMs - nowMs) / MIN_MS)),
      isCurrent: true,
      refundLines: buildRefundLines(activeProgress.recipe, activeProgress.pending),
    });
  }

  for (const item of waitingItems) {
    const recipe = recipeById(item.recipe);
    if (!recipe) continue;
    cursorMs += item.count * recipeWaitMs(recipe);
    queue.push({
      id: item.id,
      recipe,
      title: recipeTitle(recipe),
      label: recipeLabel(recipe),
      completed: 0,
      count: item.count,
      pending: item.count,
      estimatedMin: Math.max(1, Math.ceil((cursorMs - nowMs) / MIN_MS)),
      isCurrent: false,
      refundLines: buildRefundLines(recipe, item.count),
    });
  }

  return {
    cooking: activeProgress && activeProgress.nextAt !== null ? {
      id: activeProgress.id,
      recipe: activeProgress.recipe,
      title: recipeTitle(activeProgress.recipe),
      completed: activeProgress.completed,
      count: activeProgress.count,
      nextInMin: Math.max(1, Math.ceil((Date.parse(activeProgress.nextAt) - nowMs) / MIN_MS)),
    } : null,
    queue,
    queueCount: queue.length,
    stored,
    cap: COOK_STORAGE_CAP,
    full: stored >= COOK_STORAGE_CAP,
  };
}
