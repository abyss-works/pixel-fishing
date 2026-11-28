import { EVENT_FISH, type EventFish } from '../../../game/content/eventFish';
import type { Fish, FormId } from '../../../game/content/fish';
import { rarityRank } from '../../../game/content/rarity';
import type { EventDexAppearance, EventDexSnapshot } from '../../../platform/api/types';
import { toEventFishSpriteSubject } from '../../events/model/events';

export type { EventDexAppearance, EventDexSnapshot };

export interface EventDexEntry {
  fish: EventFish;
  sprite: Fish;
  name: string;
  discovered: boolean;
  count: number;
  appearances: readonly EventDexAppearance[];
}

export interface EventDexView {
  entries: readonly EventDexEntry[];
  foundCount: number;
  totalCount: number;
}

export interface EventFishFormSample {
  form: FormId;
  name: string;
  lore: string;
  count: number;
}

export interface EventFishDetailData {
  forms: readonly [EventFishFormSample, EventFishFormSample];
  sprite: Fish;
  appearances: readonly EventDexAppearance[];
}

const SORTED_EVENT_FISH: readonly EventFish[] = [...EVENT_FISH].sort(
  (a, b) => rarityRank(a.rarity) - rarityRank(b.rarity),
);

/** 이벤트 도감 목록 뷰 모델 — 희귀도 순 정렬, 폼별 발견 수와 등장 이력을 계산한다 */
export function selectEventDex(
  eventDex: EventDexSnapshot | undefined,
  form: FormId,
): EventDexView {
  const counts = eventDex?.counts;
  const appearancesMap = eventDex?.appearances;

  const entries: EventDexEntry[] = SORTED_EVENT_FISH.map(fish => {
    const count = counts?.[fish.id]?.[form] ?? 0;
    return {
      fish,
      sprite: toEventFishSpriteSubject(fish),
      name: form === 'variant' ? fish.variant.name : fish.name,
      discovered: count > 0,
      count,
      appearances: appearancesMap?.[fish.id] ?? [],
    };
  });

  const foundCount = entries.filter(e => e.discovered).length;
  return {
    entries,
    foundCount,
    totalCount: entries.length,
  };
}

/** 이벤트 어종 상세 뷰 모델 — 일반/돌연변이 2개 폼 표본과 등장한 이벤트 목록을 반환한다 */
export function selectEventFishDetail(
  eventDex: EventDexSnapshot | undefined,
  fish: EventFish,
): EventFishDetailData {
  const counts = eventDex?.counts[fish.id];
  const appearances = eventDex?.appearances[fish.id] ?? [];

  return {
    forms: [
      {
        form: 'normal',
        name: fish.name,
        lore: fish.lore,
        count: counts?.normal ?? 0,
      },
      {
        form: 'variant',
        name: fish.variant.name,
        lore: fish.variant.lore,
        count: counts?.variant ?? 0,
      },
    ],
    sprite: toEventFishSpriteSubject(fish),
    appearances,
  };
}
