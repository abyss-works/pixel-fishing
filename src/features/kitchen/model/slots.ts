// 보너스 통합 칩·슬롯 모델 — 도시락/미끼 슬롯, 활성 물약, 오늘의 운세의 지금 효과, 남은 시간 표기, 통합 칩 표시 조건과 잠금 문안.
// 효과가 걸리는 범위와 끝나는 시점은 게임 규칙(해금, 슬롯 상태, 운세/물약)이 정하고, 이 모듈은 그것을 화면용 값으로 옮긴다.
// 효과를 읽는 요리·물약 값은 콘텐츠 표에서 오고 여기서 다시 적지 않는다.
import { COOKING_UNLOCK_BOAT, recipeById } from '../../../game/content/cooking';
import type { CookKind, Recipe } from '../../../game/content/cooking';
import type { Potion } from '../../../game/content/potions';
import { cookingUnlocked, isActiveSlot, maxBaitSlots } from '../../../game/rules/cooking';
import { activePotionsOf, fortuneOf } from '../../../game/rules/fortune';
import type { FortuneTarget } from '../../../game/rules/fortune';
import type { GameState } from '../../../game/rules/logic';
import { fmtEffectDuration } from '../../../shared/lib/effectDuration';
import { facilityGuestAllowed, facilityProgress, menuLock, progressNote } from '../../display/model/menuLock';
import type { AccountLockState } from '../../display/model/menuLock';
import {
  FORTUNE_SOURCE_LABEL,
  FORTUNE_TARGET_BONUS_LABEL,
  formatLuckMult,
  fortuneBonusText,
  fortuneEffectRows,
  fortuneName,
  fortuneShortName,
} from '../../fortune/model/fortune';
import { SLOT_SCOPE, recipeEffectLines, recipeEffectNote, recipeEffectText, recipeLabel, recipeTitle } from './recipes';
import type { RecipeEffectLine, RecipeTitle } from './recipes';

const MIN_MS = 60_000;

export const SUB_MINUTE_POLL_MS = 1_000;
export const DEFAULT_POLL_MS = 5_000;

/** 1분 미만 활성 슬롯이 하나라도 있으면 1초, 없으면 5초 갱신 주기를 돌려준다 */
export function slotPollIntervalMs(game: Pick<GameState, 'slots'>, now: string): number {
  for (const key of ALL_SLOT_KEYS) {
    const slot = activeSlot(game, key, now);
    if (slot && slot.remainingMs < MIN_MS) return SUB_MINUTE_POLL_MS;
  }
  return DEFAULT_POLL_MS;
}

/** 슬롯 키 — 슬롯 종류와 그 슬롯에 넣는 요리 종류가 같은 이름이다 */
export type SlotKey = CookKind;

/** 저장 슬롯 키 — 다중 미끼 슬롯(bait2)을 포함한 실제 슬롯 키 */
export type SlotInstanceKey = 'lunch' | 'bait' | 'bait2';

/** 활성 슬롯을 확인하는 순서 — 도시락, 첫 번째 미끼, 두 번째 미끼 */
export const ALL_SLOT_KEYS: readonly SlotInstanceKey[] = ['lunch', 'bait', 'bait2'];

/** 툴팁 목록의 남은 시간 표기 - 1분 이상은 분까지만, 1분 미만은 초만 쓴다 */
export function fmtSlotTimeLeft(remainingMs: number): string {
  return fmtEffectDuration(remainingMs / MIN_MS);
}

/** 효과가 든 슬롯 하나 */
export interface ActiveSlot {
  key: SlotKey;
  /** 실제 저장 슬롯 키('lunch' | 'bait' | 'bait2') */
  slotKey: SlotInstanceKey;
  recipe: Recipe;
  /** 화면에 쓰는 요리 이름 */
  label: string;
  /** 이름과 표시 등급 — 괄호만 등급색으로 칠하는 화면용 */
  title: RecipeTitle;
  /** 남은 시간(ms) — 0보다 크다 */
  remainingMs: number;
  /** 툴팁에 쓰는 남은 시간("8시간 12분") */
  timeLeft: string;
  /** 효과 줄 */
  effects: RecipeEffectLine[];
  /** 툴팁 목록 - 효과 줄 뒤에 남은 시간 줄을 붙인다 */
  rows: RecipeEffectLine[];
  /** 그 슬롯 종류의 적용 낚시와 지속 안내 */
  note: string;
}

/** 지금 효과가 든 슬롯. 비었거나 끝났거나 콘텐츠에 없는 요리면 null이다 */
export function activeSlot(game: Pick<GameState, 'slots'>, slotKey: SlotInstanceKey, now: string): ActiveSlot | null {
  const key: SlotKey = slotKey === 'lunch' ? 'lunch' : 'bait';
  const slot = game.slots[slotKey];
  if (!isActiveSlot(slot, key, now)) return null;
  const recipe = recipeById(slot.id)!;
  const remainingMs = Date.parse(slot.endsAt) - Date.parse(now);
  const timeLeft = fmtSlotTimeLeft(remainingMs);
  const effects = recipeEffectLines(recipe);
  return {
    key, slotKey, recipe, label: recipeLabel(recipe), title: recipeTitle(recipe), remainingMs, timeLeft,
    effects, rows: [...effects, { label: '남은 시간', value: timeLeft }], note: recipeEffectNote(recipe.kind),
  };
}

export type BonusChipKind = 'lunch' | 'bait' | 'potion' | 'fortune';

export interface BonusChipItem {
  /** 내부 추적 키 — 슬롯('lunch' | 'bait' | 'bait2'), 물약('potion:<id>'), 운세('fortune') */
  id: string;
  kind: BonusChipKind;
  /** 종류 배지 이름('도시락' | '미끼' | '물약' | '풍어운' 등) */
  kindLabel: string;
  /** 이름과 표시 등급 — 괄호만 등급색으로 칠한다 */
  title: RecipeTitle;
  /** 세부 효과 요약 */
  summary: string;
  /** 남은 시간 또는 유지 기간 */
  durationText: string;
}

export type BonusChip =
  | { state: 'locked'; lines: string[] }
  | { state: 'empty' }
  | { state: 'active'; count: number; items: BonusChipItem[] };

const POTION_TARGETS: readonly FortuneTarget[] = ['rarity', 'sell', 'named'];

const potionLuckEntries = (potion: Potion): readonly (readonly [FortuneTarget, number])[] => {
  const luck = potion.effects.luck as Partial<Record<FortuneTarget, number>> | undefined;
  return POTION_TARGETS
    .map(target => [target, luck?.[target]] as const)
    .filter((entry): entry is readonly [FortuneTarget, number] => typeof entry[1] === 'number' && entry[1] > 0);
};

function potionEffectSummary(potion: Potion): string {
  const entries = potionLuckEntries(potion);
  if (entries.length === 0) return potion.description;
  const mult = (n: number) => formatLuckMult(1 + n);
  if (entries.length === POTION_TARGETS.length && entries.every(([, v]) => v === entries[0][1])) {
    return `모든 행운 효과 ${mult(entries[0][1])}`;
  }
  return entries.map(([target, v]) => `${FORTUNE_TARGET_BONUS_LABEL[target]} ${mult(v)}`).join(', ');
}

/**
 * 칩 줄의 보너스 통합 칩.
 * 활성 효과(도시락·미끼·비약·오늘의 운세)가 하나라도 있으면 활성 수와 내역을 내고,
 * 요리가 열리기 전이나 게스트 상태에서 활성 효과도 없으면 잠금 칩 하나를,
 * 열린 뒤 활성 효과가 없으면 빈 통합 칩(empty)을 낸다.
 */
export function selectBonusChip(game: GameState, now: string, account: AccountLockState): BonusChip {
  const slotItems: BonusChipItem[] = ALL_SLOT_KEYS.flatMap((slotKey): BonusChipItem[] => {
    const slot = activeSlot(game, slotKey, now);
    if (!slot) return [];
    return [{
      id: slot.slotKey,
      kind: slot.key,
      kindLabel: slot.key === 'lunch' ? '도시락' : '미끼',
      title: slot.title,
      summary: slot.effects.map(recipeEffectText).join(', '),
      durationText: `${slot.timeLeft} 남음`,
    }];
  });

  const potionItems: BonusChipItem[] = activePotionsOf(game.potions, now).map(potion => ({
    id: `potion:${potion.id}`,
    kind: 'potion',
    kindLabel: '비약',
    title: { name: potion.name, grade: potion.grade },
    summary: potionEffectSummary(potion),
    durationText: '하루 동안',
  }));

  const fortune = fortuneOf(game, now);
  const fortuneItems: BonusChipItem[] = fortune ? [{
    id: 'fortune',
    kind: 'fortune',
    kindLabel: fortuneName(fortune),
    title: { name: FORTUNE_SOURCE_LABEL, grade: null },
    summary: fortuneBonusText(fortune),
    durationText: '하루 동안',
  }] : [];

  const items = [...slotItems, ...potionItems, ...fortuneItems];
  if (items.length > 0) {
    return { state: 'active', count: items.length, items };
  }

  const progress = facilityProgress('kitchen', game.boat);
  const locked = !cookingUnlocked(game.boat) || (account !== 'account' && !facilityGuestAllowed('kitchen'));
  if (locked) {
    const lock = menuLock({ account, guestAllowed: facilityGuestAllowed('kitchen'), feature: '활성 효과', progress });
    if (lock.kind === 'progress') {
      return { state: 'locked', lines: progressNote(COOKING_UNLOCK_BOAT, '도시락과 미끼를 쓸 수 있어요.') };
    }
    if (lock.kind !== 'none') {
      return { state: 'locked', lines: lock.lines };
    }
  }

  return { state: 'empty' };
}

export interface BonusTipRow {
  label: string;
  value: string;
}

/** HUD 효과 칩 최소 4행 호버 표 — 도시락·미끼·비약 활성 여부와 운세 3글자 요약 */
export function selectBonusTipRows(game: GameState, now: string): BonusTipRow[] {
  const lunchActive = activeSlot(game, 'lunch', now) !== null;
  const baitMax = maxBaitSlots(game);
  const baitCount = (activeSlot(game, 'bait', now) ? 1 : 0) + (activeSlot(game, 'bait2', now) ? 1 : 0);
  const potionActive = activePotionsOf(game.potions, now).length > 0;
  const fortune = fortuneOf(game, now);
  return [
    { label: '도시락', value: lunchActive ? '활성' : '없음' },
    { label: '미끼', value: baitCount === 0 ? '없음' : baitMax > 1 ? `${baitCount}/${baitMax}` : '활성' },
    { label: '비약', value: potionActive ? '활성' : '없음' },
    { label: '운세', value: fortune ? fortuneShortName(fortune) : '없음' },
  ];
}

export interface ActiveEffectEntry {
  id: string;
  title: RecipeTitle;
  durationText: string;
  stats: readonly RecipeEffectLine[];
  description?: string;
}

export interface ActiveEffectsView {
  hasAny: boolean;
  lunch: ActiveEffectEntry[];
  bait: {
    slots: ActiveEffectEntry[];
    maxSlots: number;
  };
  potions: ActiveEffectEntry[];
  fortune: ActiveEffectEntry | null;
}

function potionEffectMultiplierRows(potion: Potion): RecipeEffectLine[] {
  const entries = potionLuckEntries(potion);
  if (entries.length === 0) return [{ text: potion.description }];
  if (entries.length === POTION_TARGETS.length && entries.every(([, v]) => v === entries[0][1])) {
    return [{ label: '모든 행운 효과', value: formatLuckMult(1 + entries[0][1]) }];
  }
  return entries.map(([target, v]) => ({ label: FORTUNE_TARGET_BONUS_LABEL[target], value: formatLuckMult(1 + v) }));
}

/** 적용 중인 효과 창 모델 — 도시락(방치)·미끼(수동)·비약·오늘의 운세 4개 구획 */
export function selectActiveEffectsView(game: GameState, now: string): ActiveEffectsView {
  const lunchSlot = activeSlot(game, 'lunch', now);
  const lunch: ActiveEffectEntry[] = lunchSlot ? [{
    id: lunchSlot.slotKey,
    title: lunchSlot.title,
    durationText: `${lunchSlot.timeLeft} 남음`,
    stats: lunchSlot.effects,
    description: `${SLOT_SCOPE.lunch} 효과가 있어요.`,
  }] : [];

  const baitSlots: ActiveEffectEntry[] = (['bait', 'bait2'] as const).flatMap((key): ActiveEffectEntry[] => {
    const slot = activeSlot(game, key, now);
    if (!slot) return [];
    return [{
      id: slot.slotKey,
      title: slot.title,
      durationText: `${slot.timeLeft} 남음`,
      stats: slot.effects,
    }];
  });

  const potions: ActiveEffectEntry[] = activePotionsOf(game.potions, now).map(potion => ({
    id: `potion:${potion.id}`,
    title: { name: potion.name, grade: potion.grade },
    durationText: '하루 동안',
    stats: potionEffectMultiplierRows(potion),
  }));

  const dailyFortune = fortuneOf(game, now);
  const fortune: ActiveEffectEntry | null = dailyFortune ? {
    id: 'fortune',
    title: { name: fortuneName(dailyFortune), grade: null },
    durationText: '하루 동안',
    stats: fortuneEffectRows(dailyFortune).map(r => ({ label: r.label, value: r.value })),
  } : null;

  return {
    hasAny: lunch.length > 0 || baitSlots.length > 0 || potions.length > 0 || fortune !== null,
    lunch,
    bait: { slots: baitSlots, maxSlots: maxBaitSlots(game) },
    potions,
    fortune,
  };
}
