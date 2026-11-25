// 보너스 통합 칩·슬롯 모델 — 도시락/미끼 슬롯, 활성 물약, 오늘의 운세의 지금 효과, 남은 시간 표기, 통합 칩 표시 조건과 잠금 문안.
// 효과가 걸리는 범위와 끝나는 시점은 게임 규칙(해금, 슬롯 상태, 운세/물약)이 정하고, 이 모듈은 그것을 화면용 값으로 옮긴다.
// 효과를 읽는 요리·물약 값은 콘텐츠 표에서 오고 여기서 다시 적지 않는다.
import { COOKING_UNLOCK_BOAT, recipeById } from '../../../game/content/cooking';
import type { CookKind, Recipe } from '../../../game/content/cooking';
import type { Potion } from '../../../game/content/potions';
import { cookingUnlocked, isActiveSlot } from '../../../game/rules/cooking';
import { activePotionsOf, fortuneOf } from '../../../game/rules/fortune';
import type { FortuneTarget } from '../../../game/rules/fortune';
import type { GameState } from '../../../game/rules/logic';
import { facilityGuestAllowed, facilityProgress, menuLock, progressNote } from '../../display/model/menuLock';
import type { AccountLockState } from '../../display/model/menuLock';
import {
  FORTUNE_KIND,
  FORTUNE_SOURCE_LABEL,
  FORTUNE_TARGET_BONUS_LABEL,
  fortuneBonusText,
} from '../../fortune/model/fortune';
import { recipeEffectLines, recipeEffectNote, recipeEffectText, recipeLabel, recipeTitle } from './recipes';
import type { RecipeEffectLine, RecipeTitle } from './recipes';

const MIN_MS = 60_000;

/** 슬롯 키 — 슬롯 종류와 그 슬롯에 넣는 요리 종류가 같은 이름이다 */
export type SlotKey = CookKind;

/** 저장 슬롯 키 — 다중 미끼 슬롯(bait2)을 포함한 실제 슬롯 키 */
export type SlotInstanceKey = 'lunch' | 'bait' | 'bait2';

/** 활성 슬롯을 확인하는 순서 — 도시락, 첫 번째 미끼, 두 번째 미끼 */
export const ALL_SLOT_KEYS: readonly SlotInstanceKey[] = ['lunch', 'bait', 'bait2'];

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
export function activeSlot(game: Pick<GameState, 'slots'>, slotKey: SlotInstanceKey, now: string): ActiveSlot | null {
  const key: SlotKey = slotKey === 'lunch' ? 'lunch' : 'bait';
  const slot = game.slots[slotKey];
  if (!isActiveSlot(slot, key, now)) return null;
  const recipe = recipeById(slot.id)!;
  const remainingMs = Date.parse(slot.endsAt) - Date.parse(now);
  const timeLeft = fmtSlotTimeLeft(remainingMs);
  const effects = recipeEffectLines(recipe);
  return {
    key, slotKey, recipe, label: recipeLabel(recipe), title: recipeTitle(recipe), remainingMs, chipTime: fmtSlotChipTime(remainingMs), timeLeft,
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

function potionEffectSummary(potion: Potion): string {
  const entries = POTION_TARGETS
    .map(target => [target, potion.effects.luck?.[target]] as const)
    .filter((entry): entry is readonly [FortuneTarget, number] => typeof entry[1] === 'number' && entry[1] > 0);
  if (entries.length === 0) return potion.description;
  const pct = (n: number) => Math.round(n * 1000) / 10;
  if (entries.length === POTION_TARGETS.length && entries.every(([, v]) => v === entries[0][1])) {
    return `모든 행운 효과 +${pct(entries[0][1])}%p`;
  }
  return entries.map(([target, v]) => `${FORTUNE_TARGET_BONUS_LABEL[target]} +${pct(v)}%p`).join(', ');
}

/**
 * 칩 줄의 보너스 통합 칩.
 * 활성 효과(도시락·미끼·물약·오늘의 운세)가 하나라도 있으면 활성 수와 내역을 내고,
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
    kindLabel: '물약',
    title: { name: potion.name, grade: potion.grade },
    summary: potionEffectSummary(potion),
    durationText: '하루 동안',
  }));

  const fortune = fortuneOf(game, now);
  const fortuneItems: BonusChipItem[] = fortune ? [{
    id: 'fortune',
    kind: 'fortune',
    kindLabel: FORTUNE_KIND[fortune.kind].name,
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
