// 가방 아이템 섹션 모델 — 생명의 기운 격자, 도시락과 미끼 행, 해금 전 잠금과 빈 상태, 먹기 계획과 교체 확인.
// 먹을 수 있는지는 게임 규칙(canEat)이, 해금은 게임 규칙(cookingUnlocked)이, 게스트 잠금은 메뉴 잠금 모델이 정한다.
// 보관함에 든 완성분은 조리가 끝난 분까지 센다(settleCooking). 이 모듈은 그 판정을 화면용 행으로 옮긴다.
import { ENERGY_ITEM_IDS, recipeById } from '../../../game/content/cooking';
import type { Recipe } from '../../../game/content/cooking';
import { POTIONS } from '../../../game/content/potions';
import type { Potion } from '../../../game/content/potions';
import { RARITY_ORDER } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';
import { canEat, maxBaitSlots, settleCooking, slotDurationMs } from '../../../game/rules/cooking';
import { activePotionsOf } from '../../../game/rules/fortune';
import type { GameState } from '../../../game/rules/logic';
import { canUsePotion } from '../../../game/rules/rules';
import type { RuleCheck } from '../../../game/rules/rules';
import { GAME_DAY_RESET_TEXT } from '../../../game/rules/time';
import { josa } from '../../../shared/lib/josa';
import { facilityGuestAllowed, facilityProgress, menuLock } from '../../display/model/menuLock';
import type { AccountLockState } from '../../display/model/menuLock';
import { FORTUNE_TARGET_BONUS_LABEL } from '../../fortune/model/fortune';
import { energyLabel } from './energy';
import { recipeEffectLines, recipeEffectNote, recipeLabel, recipesOfKind, recipeTitle } from './recipes';
import type { RecipeTitle } from './recipes';
import type { RecipeEffectLine } from './recipes';
import { activeSlot } from './slots';
import type { SlotKey } from './slots';

const MIN_MS = 60_000;

export const NO_ITEMS_TEXT = '가진 아이템이 없어요.';
/** 묶음 소제목의 점선 툴팁 - 그 묶음이 무엇이고 어디서 얻고 쓰는지, 도시락·미끼 공통 주의사항 집약 */
export const ITEM_GROUP_HINT = {
  energy: '물고기 한 마리에서 그 등급의 생명의 기운 하나를 얻어요.\n기운 얻기는 집 궤짝이나 항구 어시장에서 할 수 있어요.',
  lunch: recipeEffectNote('lunch'),
  bait: recipeEffectNote('bait'),
  potion: '마시면 하루 동안 모든 행운 효과가 올라요.',
} as const;
const POTION_DETAIL_NOTE = `하루 동안 이어져요. 하루는 ${GAME_DAY_RESET_TEXT}에 새로 시작해요.`;
const LUCK_TARGETS = ['rarity', 'named', 'sell'] as const;
const pctPoint = (x: number): string => `+${Math.round(x * 1000) / 10}%p`;

/** 물약 효과 줄 — 모든 행운 대상이 같은 값이면 한 줄로 묶고, 아니면 대상별 줄을 만든다 */
export function potionEffectLines(potion: Potion): RecipeEffectLine[] {
  const luck = potion.effects.luck;
  if (!luck) return [];
  const entries = LUCK_TARGETS
    .map(target => ({ target, value: luck[target] }))
    .filter((e): e is { target: (typeof LUCK_TARGETS)[number]; value: number } => e.value !== undefined && e.value > 0);
  if (entries.length === LUCK_TARGETS.length && entries.every(e => e.value === entries[0].value)) {
    return [{ label: '모든 행운 효과', value: pctPoint(entries[0].value) }];
  }
  return entries.map(e => ({ label: FORTUNE_TARGET_BONUS_LABEL[e.target], value: pctPoint(e.value) }));
}
/** 물약 적용 안내 문구 */
export const potionUseNoticeText = (potionName: string): string =>
  `${potionName}${josa(potionName, '을/를')} 마셨어요. 하루 동안 이어져요.`;
/** 아이템 섹션의 묶음 순서와 소제목 - 잠긴 자리와 열린 섹션이 같은 순서를 쓴다 */
export const ITEM_GROUPS = [
  { key: 'energy', title: '생명의 기운' },
  { key: 'lunch', title: '도시락' },
  { key: 'bait', title: '미끼' },
] as const;
const SWAP_WARNING = '지금 효과의 남은 시간은 사라져요.';

/** 슬롯 종류별 동작 이름과 교체 확인 제목 */
const SLOT_TEXT: Readonly<Record<SlotKey, { verb: '먹기' | '쓰기'; swapTitle: string }>> = {
  lunch: { verb: '먹기', swapTitle: '도시락 바꾸기' },
  bait: { verb: '쓰기', swapTitle: '미끼 바꾸기' },
};

/** stored는 저장 단위 수량이다(화면 단위의 10배). 아이템 행의 count와 단위가 다르다 */
export interface EnergyCell { id: string; grade: RarityId; label: string; stored: number }

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
  /** 총 지속 시간(분) — 미끼는 사르가소의 그물망 등 보유 유물의 배수를 반영한다 */
  durationMinutes: number;
  /** 지금 슬롯에 장착돼 효과를 내고 있는가 */
  active: boolean;
  /** 활성 중일 때 남은 시간(분). 비활성이면 null */
  remainingMinutes: number | null;
}

export interface PotionRow {
  potion: Potion;
  count: number;
  active: boolean;
  usable: boolean;
  effects: RecipeEffectLine[];
  note: string;
}

export type ItemSectionView =
  /** 요리를 쓸 수 없는 상태(해금 전, 게스트). unlockNotice는 전체 보기 상단의 1줄 해금 안내, empty는 보유 중만 보기가 비었을 때의 안내 줄, lines는 잠긴 칸의 툴팁 줄이다 */
  | {
    state: 'locked';
    unlockNotice: string | null;
    empty: string[];
    lines: string[];
    energy: EnergyCell[];
    lunch: ItemRow[];
    bait: ItemRow[];
    potions: PotionRow[];
    potionLock: string[] | null;
  }
  | {
    state: 'open';
    energy: EnergyCell[];
    lunch: ItemRow[];
    bait: ItemRow[];
    potions: PotionRow[];
    potionLock: string[] | null;
    empty: boolean;
  };

export function selectItemSection(game: GameState, now: string, account: AccountLockState): ItemSectionView {
  const activePotionIds = new Set(activePotionsOf(game.potions, now).map(p => p.id));
  const potionLockResult = menuLock({ account, guestAllowed: false, feature: '물약' });
  const potionLock = potionLockResult.kind === 'none' ? null : potionLockResult.lines;
  const potions: PotionRow[] = POTIONS.map(potion => ({
    potion,
    count: game.items[potion.id] ?? 0,
    active: activePotionIds.has(potion.id),
    usable: canUsePotion(game, potion.id, now, account !== 'account').ok,
    effects: potionEffectLines(potion),
    note: POTION_DETAIL_NOTE,
  }));

  const items = settleCooking(game, now).items;
  const activeRemainingMs = new Map<string, number>();
  for (const k of ['lunch', 'bait', 'bait2'] as const) {
    const entry = activeSlot(game, k, now);
    if (!entry) continue;
    const prev = activeRemainingMs.get(entry.recipe.id) ?? 0;
    if (entry.remainingMs > prev) activeRemainingMs.set(entry.recipe.id, entry.remainingMs);
  }
  const rows = (slot: SlotKey): ItemRow[] => recipesOfKind(slot)
    .map(recipe => {
      const remMs = activeRemainingMs.get(recipe.id);
      const active = remMs !== undefined;
      return {
        recipe, label: recipeLabel(recipe), title: recipeTitle(recipe), count: items[recipe.id] ?? 0, slot, verb: SLOT_TEXT[slot].verb,
        effects: recipeEffectLines(recipe), note: recipeEffectNote(slot),
        durationMinutes: slotDurationMs(recipe, game) / MIN_MS,
        active,
        remainingMinutes: active ? remMs / MIN_MS : null,
      };
    });
  const energy = RARITY_ORDER.map((grade): EnergyCell => (
    { id: ENERGY_ITEM_IDS[grade], grade, label: energyLabel(grade), stored: items[ENERGY_ITEM_IDS[grade]] ?? 0 }));
  const lunch = rows('lunch');
  const bait = rows('bait');

  const progress = facilityProgress('kitchen', game.boat);
  const lock = menuLock({ account, guestAllowed: facilityGuestAllowed('kitchen'), feature: '부엌', progress });
  if (lock.kind !== 'none') {
    const unlockNotice = lock.kind === 'progress' ? lock.lines[0] ?? null : null;
    const empty = [NO_ITEMS_TEXT];
    return { state: 'locked', unlockNotice, empty, lines: lock.lines, energy, lunch, bait, potions, potionLock };
  }
  const empty = lunch.every(r => !isOwnedOrActiveItem(r))
    && bait.every(r => !isOwnedOrActiveItem(r))
    && energy.every(e => e.stored === 0)
    && potions.every(p => !isOwnedOrActivePotion(p));
  return { state: 'open', energy, lunch, bait, potions, potionLock, empty };
}

/** 보유 중만 보기 필터 기준 — 수량이 1개 이상이거나 현재 슬롯에서 효과가 적용 중인 아이템 */
export const isOwnedOrActiveItem = (row: Pick<ItemRow, 'count' | 'active'>): boolean =>
  row.count > 0 || row.active;

/** 보유 중만 보기 필터 기준 — 수량이 1개 이상이거나 오늘 사용 중인 물약 */
export const isOwnedOrActivePotion = (row: Pick<PotionRow, 'count' | 'active'>): boolean =>
  row.count > 0 || row.active;

export interface OpenItemLists {
  lunch: ItemRow[];
  bait: ItemRow[];
  energy: EnergyCell[];
  potions: PotionRow[];
  empty: boolean;
}

/** 아이템 섹션에서 보유 중만 보기 토글 상태에 맞는 목록을 돌려준다 */
export function filterItemSection(
  view: ItemSectionView,
  ownedOnly: boolean,
): OpenItemLists {
  if (!ownedOnly) {
    return { lunch: view.lunch, bait: view.bait, energy: view.energy, potions: view.potions, empty: false };
  }
  const lunch = view.lunch.filter(isOwnedOrActiveItem);
  const bait = view.bait.filter(isOwnedOrActiveItem);
  const energy = view.energy.filter(e => e.stored > 0);
  const potions = view.potions.filter(isOwnedOrActivePotion);
  return {
    lunch,
    bait,
    energy,
    potions,
    empty: lunch.length === 0 && bait.length === 0 && energy.length === 0 && potions.length === 0,
  };
}

/** 다중 미끼 슬롯이 모두 찼을 때 바꿀 대상 슬롯 선택지 */
export interface SwapChoice {
  slotKey: 'bait' | 'bait2';
  label: string;
  title: RecipeTitle;
  minutes: number;
}

/** 교체 확인 — 효과가 든 슬롯에 새로 넣을 때(같은 것을 다시 넣을 때도) 잃는 남은 시간을 보인다 */
export interface SwapConfirm {
  title: string;
  confirmLabel: '먹기' | '쓰기';
  current: { label: string; title: RecipeTitle; minutes: number };
  next: { label: string; title: RecipeTitle; minutes: number };
  warning: string;
  /** 다중 미끼 슬롯이 모두 차 세 번째 미끼를 쓸 때만 채운다 */
  choices?: SwapChoice[];
  defaultChoice?: 'bait' | 'bait2';
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
  const text = SLOT_TEXT[slot];
  const check = canEat(game, item, now);
  const nextMinutes = slotDurationMs(recipe, game) / MIN_MS;

  const nextTitle = recipeTitle(recipe);

  if (slot === 'lunch') {
    const current = activeSlot(game, 'lunch', now);
    return {
      slot,
      check,
      confirm: current === null ? null : {
        title: text.swapTitle, confirmLabel: text.verb,
        current: { label: current.label, title: current.title, minutes: Math.ceil(current.remainingMs / MIN_MS) },
        next: { label: recipeLabel(recipe), title: nextTitle, minutes: nextMinutes },
        warning: SWAP_WARNING,
      },
    };
  }

  const b1 = activeSlot(game, 'bait', now);
  const b2 = activeSlot(game, 'bait2', now);

  if (maxBaitSlots(game) <= 1) {
    return {
      slot,
      check,
      confirm: b1 === null ? null : {
        title: text.swapTitle, confirmLabel: text.verb,
        current: { label: b1.label, title: b1.title, minutes: Math.ceil(b1.remainingMs / MIN_MS) },
        next: { label: recipeLabel(recipe), title: nextTitle, minutes: nextMinutes },
        warning: SWAP_WARNING,
      },
    };
  }

  // 다중 미끼 슬롯: 같은 미끼가 이미 켜져 있으면 그 슬롯을 갱신하는 확인 창
  const duplicate = b1?.recipe.id === recipe.id ? b1 : b2?.recipe.id === recipe.id ? b2 : null;
  if (duplicate !== null) {
    return {
      slot,
      check,
      confirm: {
        title: text.swapTitle, confirmLabel: text.verb,
        current: { label: duplicate.label, title: duplicate.title, minutes: Math.ceil(duplicate.remainingMs / MIN_MS) },
        next: { label: recipeLabel(recipe), title: nextTitle, minutes: nextMinutes },
        warning: SWAP_WARNING,
      },
    };
  }

  // 빈 슬롯이 하나라도 있으면 확인 없이 바로 넣는다
  if (b1 === null || b2 === null) {
    return { slot, check, confirm: null };
  }

  // 두 슬롯 모두 다른 미끼로 차 있을 때: 바꿀 슬롯 선택 (먼저 끝나는 슬롯 기본 선택)
  const defaultChoice: 'bait' | 'bait2' = b1.remainingMs <= b2.remainingMs ? 'bait' : 'bait2';
  const chosen = defaultChoice === 'bait' ? b1 : b2;
  return {
    slot,
    check,
    confirm: {
      title: text.swapTitle, confirmLabel: text.verb,
      current: { label: chosen.label, title: chosen.title, minutes: Math.ceil(chosen.remainingMs / MIN_MS) },
      next: { label: recipeLabel(recipe), title: nextTitle, minutes: nextMinutes },
      warning: SWAP_WARNING,
      choices: [
        { slotKey: 'bait', label: b1.label, title: b1.title, minutes: Math.ceil(b1.remainingMs / MIN_MS) },
        { slotKey: 'bait2', label: b2.label, title: b2.title, minutes: Math.ceil(b2.remainingMs / MIN_MS) },
      ],
      defaultChoice,
    },
  };
}
