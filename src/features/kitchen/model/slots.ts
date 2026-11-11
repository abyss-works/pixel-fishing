// 슬롯 칩 모델 — 도시락 슬롯과 미끼 슬롯의 지금 효과, 남은 시간 표기, 잠금 칩 문안, 칩 줄의 표시 조건.
// 슬롯 효과가 걸리는 범위와 끝나는 시점은 게임 규칙(해금, 슬롯 상태)이 정하고, 이 모듈은 그것을 화면용 값으로 옮긴다.
// 효과를 읽는 요리 값은 콘텐츠 표에서 오고 여기서 다시 적지 않는다.
import { COOKING_UNLOCK_BOAT, recipeById } from '../../../game/content/cooking';
import type { CookKind, Recipe } from '../../../game/content/cooking';
import { appliedSlots, cookingUnlocked } from '../../../game/rules/cooking';
import type { GameState } from '../../../game/rules/logic';
import { facilityGuestAllowed, facilityProgress, menuLock, progressNote } from '../../display/model/menuLock';
import { recipeEffectLines, recipeEffectNote, recipeLabel } from './recipes';
import type { RecipeEffectLine } from './recipes';

const MIN_MS = 60_000;

/** 슬롯 키 — 슬롯 종류와 그 슬롯에 넣는 요리 종류가 같은 이름이다 */
export type SlotKey = CookKind;

/** 칩 줄과 잠금 문안이 슬롯을 부르는 이름 */
export const SLOT_NAME: Readonly<Record<SlotKey, string>> = { lunch: '도시락 슬롯', bait: '미끼 슬롯' };

/** 칩 줄의 슬롯 순서 — 도시락 칩, 미끼 칩 */
export const SLOT_ORDER: readonly SlotKey[] = ['lunch', 'bait'];

/** 남은 시간을 분 단위로 올린 값. 0 이하는 0이다 */
const minutesLeft = (remainingMs: number): number => (remainingMs > 0 ? Math.ceil(remainingMs / MIN_MS) : 0);

/** 칩의 남은 시간 표기 - 큰 단위 하나만 쓴다. 1시간 이상은 "8시간"(시간 아래는 버림), 1시간 미만은 "25분"(분은 올림) */
export function fmtSlotChipTime(remainingMs: number): string {
  const minutes = minutesLeft(remainingMs);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간` : `${minutes}분`;
}

/** 툴팁 목록의 남은 시간 표기 - "8시간 12분", 분은 올림이다 */
export function fmtSlotTimeLeft(remainingMs: number): string {
  const minutes = minutesLeft(remainingMs);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 잠금 칩 툴팁 첫 줄의 서술부 - 도시락은 먹고 미끼는 쓴다 */
const LOCK_PREDICATE: Readonly<Record<SlotKey, string>> = { lunch: '도시락을 먹을 수 있어요.', bait: '미끼를 쓸 수 있어요.' };

/** 효과가 든 슬롯 하나 */
export interface ActiveSlot {
  key: SlotKey;
  recipe: Recipe;
  /** 화면에 쓰는 요리 이름 */
  label: string;
  /** 남은 시간(ms) — 0보다 크다 */
  remainingMs: number;
  /** 칩에 쓰는 남은 시간 - 큰 단위 하나("8시간", "25분") */
  chipTime: string;
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
export function activeSlot(game: Pick<GameState, 'slots'>, key: SlotKey, now: string): ActiveSlot | null {
  // 효과가 걸리는 조건(끝나는 시각 전, 콘텐츠에 있는 요리)은 게임 규칙(appliedSlots)의 판정을 쓴다
  const appliedId = appliedSlots(game, now, key === 'lunch' ? 'auto' : 'normal')[key];
  const slot = game.slots[key];
  const recipe = appliedId === undefined ? undefined : recipeById(appliedId);
  if (slot === null || recipe === undefined) return null;
  const remainingMs = Date.parse(slot.endsAt) - Date.parse(now);
  const timeLeft = fmtSlotTimeLeft(remainingMs);
  const effects = recipeEffectLines(recipe);
  return {
    key, recipe, label: recipeLabel(recipe), remainingMs, chipTime: fmtSlotChipTime(remainingMs), timeLeft,
    effects, rows: [...effects, { label: '남은 시간', value: timeLeft }], note: recipeEffectNote(recipe.kind),
  };
}

export type SlotChip =
  | { key: SlotKey; state: 'locked'; lines: string[] }
  | ({ state: 'active' } & ActiveSlot);

/**
 * 칩 줄의 슬롯 칩. 요리를 쓸 수 없는 동안(해금 전, 게스트)은 두 슬롯 모두 잠금 칩이고,
 * 쓸 수 있으면 효과가 든 슬롯의 칩만 도시락, 미끼 순으로 낸다.
 */
export function selectSlotChips(game: GameState, now: string, guest: boolean): SlotChip[] {
  const progress = facilityProgress('kitchen', game.boat);
  const locked = !cookingUnlocked(game.boat) || (guest && !facilityGuestAllowed('kitchen'));
  if (locked) {
    return SLOT_ORDER.flatMap((key): SlotChip[] => {
      const lock = menuLock({ guest, guestAllowed: facilityGuestAllowed('kitchen'), feature: SLOT_NAME[key], progress });
      if (lock.kind === 'none') return [];
      const lines = lock.kind === 'progress' ? progressNote(COOKING_UNLOCK_BOAT, LOCK_PREDICATE[key]) : lock.lines;
      return [{ key, state: 'locked', lines }];
    });
  }
  return SLOT_ORDER.flatMap((key): SlotChip[] => {
    const slot = activeSlot(game, key, now);
    return slot === null ? [] : [{ state: 'active', ...slot }];
  });
}
