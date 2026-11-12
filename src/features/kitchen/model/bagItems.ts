// 가방 아이템 섹션 모델 — 생명의 기운 격자, 도시락과 미끼 행, 해금 전 잠금과 빈 상태, 먹기 계획과 교체 확인.
// 먹을 수 있는지는 게임 규칙(canEat)이, 해금은 게임 규칙(cookingUnlocked)이, 게스트 잠금은 메뉴 잠금 모델이 정한다.
// 보관함에 든 완성분은 조리가 끝난 분까지 센다(settleCooking). 이 모듈은 그 판정을 화면용 행으로 옮긴다.
import { COOK_KIND_RULES, COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS, RECIPES, recipeById } from '../../../game/content/cooking';
import type { Recipe } from '../../../game/content/cooking';
import { RARITY_ORDER } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';
import { canEat, settleCooking } from '../../../game/rules/cooking';
import type { GameState } from '../../../game/rules/logic';
import type { RuleCheck } from '../../../game/rules/rules';
import { facilityGuestAllowed, facilityProgress, menuLock, progressNote } from '../../display/model/menuLock';
import { energyLabel } from './energy';
import { recipeEffectLines, recipeEffectNote, recipeLabel, recipeTitle } from './recipes';
import type { RecipeTitle } from './recipes';
import type { RecipeEffectLine } from './recipes';
import { activeSlot } from './slots';
import type { SlotKey } from './slots';

const MIN_MS = 60_000;

export const NO_ITEMS_TEXT = '가진 아이템이 없어요.';
/** 묶음 소제목의 점선 툴팁 - 그 묶음이 무엇이고 어디서 얻고 쓰는지 */
export const ITEM_GROUP_HINT = {
  energy: '물고기 한 마리에서 그 등급의 생명의 기운 하나를 얻어요.\n기운 얻기는 집 궤짝이나 항구 어시장에서 할 수 있어요.',
  lunch: '먹기를 누르면 도시락 슬롯에 들어가요.',
  bait: '쓰기를 누르면 미끼 슬롯에 들어가요.',
} as const;
/** 아이템 섹션의 묶음 순서와 소제목 - 잠긴 자리와 열린 섹션이 같은 순서를 쓴다 */
export const ITEM_GROUPS = [
  { key: 'lunch', title: '도시락' },
  { key: 'bait', title: '미끼' },
  { key: 'energy', title: '생명의 기운' },
] as const;
const SWAP_WARNING = '지금 효과의 남은 시간은 사라져요.';

/** 슬롯 종류별 동작 이름과 교체 확인 제목 */
const SLOT_TEXT: Readonly<Record<SlotKey, { verb: '먹기' | '쓰기'; swapTitle: string }>> = {
  lunch: { verb: '먹기', swapTitle: '도시락 바꾸기' },
  bait: { verb: '쓰기', swapTitle: '미끼 바꾸기' },
};

/** stored는 저장 단위 수량이다(화면 단위의 10배). 아이템 행의 count와 단위가 다르다 */
export interface EnergyCell { grade: RarityId; label: string; stored: number }

export interface ItemRow {
  recipe: Recipe;
  label: string;
  /** 이름과 표시 등급 - 괄호만 등급색으로 칠하는 화면용. label은 같은 내용을 문자열로 합친 것이다 */
  title: RecipeTitle;
  count: number;
  slot: SlotKey;
  verb: '먹기' | '쓰기';
  /** 효과 줄과 적용 낚시, 지속 안내 - 이름의 툴팁이 보인다 */
  effects: RecipeEffectLine[];
  note: string;
}

export type ItemSectionView =
  /** 요리를 쓸 수 없는 상태(해금 전, 게스트). empty는 빈 상태 안내 줄, lines는 잠긴 칸의 툴팁 줄이다 */
  | { state: 'locked'; empty: string[]; lines: string[] }
  | { state: 'open'; energy: EnergyCell[]; lunch: ItemRow[]; bait: ItemRow[]; empty: boolean };

export function selectItemSection(game: GameState, now: string, guest: boolean): ItemSectionView {
  const progress = facilityProgress('kitchen', game.boat);
  const lock = menuLock({ guest, guestAllowed: facilityGuestAllowed('kitchen'), feature: '부엌', progress });
  if (lock.kind !== 'none') {
    const empty = lock.kind === 'progress'
      ? [NO_ITEMS_TEXT, ...progressNote(COOKING_UNLOCK_BOAT, '부엌에서 도시락과 미끼를 만들 수 있어요.')]
      : [NO_ITEMS_TEXT];
    return { state: 'locked', empty, lines: lock.lines };
  }
  const items = settleCooking(game, now).items;
  const rows = (slot: SlotKey): ItemRow[] => RECIPES.filter(r => r.kind === slot && (items[r.id] ?? 0) > 0)
    .map(recipe => ({
      recipe, label: recipeLabel(recipe), title: recipeTitle(recipe), count: items[recipe.id], slot, verb: SLOT_TEXT[slot].verb,
      effects: recipeEffectLines(recipe), note: recipeEffectNote(slot),
    }));
  const energy = RARITY_ORDER.map((grade): EnergyCell => (
    { grade, label: energyLabel(grade), stored: items[ENERGY_ITEM_IDS[grade]] ?? 0 }));
  const lunch = rows('lunch');
  const bait = rows('bait');
  return { state: 'open', energy, lunch, bait, empty: lunch.length === 0 && bait.length === 0 && energy.every(e => e.stored === 0) };
}

/** 교체 확인 — 효과가 든 슬롯에 새로 넣을 때(같은 것을 다시 넣을 때도) 잃는 남은 시간을 보인다 */
export interface SwapConfirm {
  title: string;
  confirmLabel: '먹기' | '쓰기';
  current: { label: string; minutes: number };
  next: { label: string; minutes: number };
  warning: string;
}

export interface EatPlan {
  slot: SlotKey;
  /** 먹기(쓰기) 판정 — 게임 규칙의 판정 그대로 */
  check: RuleCheck;
  /** 확인이 필요하면 그 내용, 슬롯이 비었거나 끝났으면 null */
  confirm: SwapConfirm | null;
}

export function planEat(game: GameState, item: string, now: string): EatPlan {
  const recipe = recipeById(item);
  if (recipe === undefined) return { slot: 'lunch', check: canEat(game, item, now), confirm: null };
  const slot = recipe.kind;
  const current = activeSlot(game, slot, now);
  const text = SLOT_TEXT[slot];
  return {
    slot,
    check: canEat(game, item, now),
    confirm: current === null ? null : {
      title: text.swapTitle, confirmLabel: text.verb,
      current: { label: current.label, minutes: Math.ceil(current.remainingMs / MIN_MS) },
      next: { label: recipeLabel(recipe), minutes: COOK_KIND_RULES[slot].slotMs / MIN_MS },
      warning: SWAP_WARNING,
    },
  };
}
