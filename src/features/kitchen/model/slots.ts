// 슬롯 칩 모델 — 도시락 슬롯과 미끼 슬롯의 지금 효과, 남은 시간 표기, 칩 줄의 표시 조건.
// 슬롯 효과가 걸리는 범위와 끝나는 시점은 게임 규칙(해금, 슬롯 상태)이 정하고, 이 모듈은 그것을 화면용 값으로 옮긴다.
// 효과를 읽는 요리 값은 콘텐츠 표에서 오고 여기서 다시 적지 않는다.
import { recipeById } from '../../../game/content/cooking';
import type { CookKind, Recipe } from '../../../game/content/cooking';
import { cookingUnlocked } from '../../../game/rules/cooking';
import type { GameState } from '../../../game/rules/logic';
import { facilityGuestAllowed, facilityProgress, menuLock } from '../../display/model/menuLock';
import { recipeEffectLines, recipeEffectNote, recipeLabel } from './recipes';
import type { RecipeEffectLine } from './recipes';

const MIN_MS = 60_000;

/** 슬롯 키 — 슬롯 종류와 그 슬롯에 넣는 요리 종류가 같은 이름이다 */
export type SlotKey = CookKind;

/** 칩 줄과 잠금 문안이 슬롯을 부르는 이름 */
export const SLOT_NAME: Readonly<Record<SlotKey, string>> = { lunch: '도시락 슬롯', bait: '미끼 슬롯' };

/** 칩 줄의 슬롯 순서 — 도시락 칩, 미끼 칩 */
export const SLOT_ORDER: readonly SlotKey[] = ['lunch', 'bait'];

/** 남은 시간 칩 표기 — "8:12" 꼴(시:분, 분은 두 자리). 1분 안쪽의 남은 시간은 올려서 0:00으로 보이지 않는다 */
export function fmtSlotClock(remainingMs: number): string {
  const minutes = remainingMs > 0 ? Math.ceil(remainingMs / MIN_MS) : 0;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** 효과가 든 슬롯 하나 */
export interface ActiveSlot {
  key: SlotKey;
  recipe: Recipe;
  /** 화면에 쓰는 요리 이름 */
  label: string;
  /** 남은 시간(ms) — 0보다 크다 */
  remainingMs: number;
  /** 칩에 쓰는 남은 시간 */
  clock: string;
  /** 효과 줄 */
  effects: RecipeEffectLine[];
  /** 그 슬롯 종류의 적용 낚시와 지속 안내 */
  note: string;
}

/** 지금 효과가 든 슬롯. 비었거나 끝났거나 콘텐츠에 없는 요리면 null이다 */
export function activeSlot(game: Pick<GameState, 'slots'>, key: SlotKey, now: string): ActiveSlot | null {
  const slot = game.slots[key];
  const recipe = slot === null ? undefined : recipeById(slot.id);
  if (slot === null || recipe === undefined) return null;
  const remainingMs = Date.parse(slot.endsAt) - Date.parse(now);
  if (!(remainingMs > 0)) return null;
  return {
    key, recipe, label: recipeLabel(recipe), remainingMs, clock: fmtSlotClock(remainingMs),
    effects: recipeEffectLines(recipe), note: recipeEffectNote(recipe.kind),
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
      return lock.kind === 'none' ? [] : [{ key, state: 'locked', lines: lock.lines }];
    });
  }
  return SLOT_ORDER.flatMap((key): SlotChip[] => {
    const slot = activeSlot(game, key, now);
    return slot === null ? [] : [{ state: 'active', ...slot }];
  });
}
