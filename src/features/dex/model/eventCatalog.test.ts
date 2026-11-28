import { describe, expect, it } from 'vitest';
import { EVENT_FISH } from '../../../game/content/eventFish';
import { rarityRank } from '../../../game/content/rarity';
import type { EventDexSnapshot } from '../../../platform/api/types';
import { selectEventDex, selectEventFishDetail } from './eventCatalog';

const SAMPLE_SNAPSHOT: EventDexSnapshot = {
  counts: {
    'event-boxfish': { normal: 3, variant: 1 },
    'event-gurnard': { normal: 0, variant: 2 },
  },
  appearances: {
    'event-boxfish': [
      { eventId: 'ev-1', title: '제1회 강태공 선수권', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-07T23:59:59Z' },
    ],
  },
};

describe('selectEventDex', () => {
  it('EVENT_FISH를 희귀도 순으로 정렬해 반환하고, eventDex가 없으면 모두 미발견으로 처리한다', () => {
    const view = selectEventDex(undefined, 'normal');
    expect(view.totalCount).toBe(EVENT_FISH.length);
    expect(view.foundCount).toBe(0);
    expect(view.entries).toHaveLength(EVENT_FISH.length);

    const ranks = view.entries.map(e => rarityRank(e.fish.rarity));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(view.entries.every(e => !e.discovered && e.count === 0 && e.appearances.length === 0)).toBe(true);
  });

  it('일반/돌연변이 폼별로 count와 discovered, foundCount, appearances를 구분해 반환한다', () => {
    const normalView = selectEventDex(SAMPLE_SNAPSHOT, 'normal');
    expect(normalView.foundCount).toBe(1);
    const boxfishNormal = normalView.entries.find(e => e.fish.id === 'event-boxfish')!;
    expect(boxfishNormal.discovered).toBe(true);
    expect(boxfishNormal.count).toBe(3);
    expect(boxfishNormal.name).toBe(boxfishNormal.fish.name);
    expect(boxfishNormal.appearances).toHaveLength(1);

    const gurnardNormal = normalView.entries.find(e => e.fish.id === 'event-gurnard')!;
    expect(gurnardNormal.discovered).toBe(false);
    expect(gurnardNormal.count).toBe(0);

    const variantView = selectEventDex(SAMPLE_SNAPSHOT, 'variant');
    expect(variantView.foundCount).toBe(2);
    const gurnardVariant = variantView.entries.find(e => e.fish.id === 'event-gurnard')!;
    expect(gurnardVariant.discovered).toBe(true);
    expect(gurnardVariant.count).toBe(2);
    expect(gurnardVariant.name).toBe(gurnardVariant.fish.variant.name);
  });
});

describe('selectEventFishDetail', () => {
  it('일반과 돌연변이 2개 폼 표본과 등장한 이벤트 목록을 반환한다', () => {
    const boxfish = EVENT_FISH.find(f => f.id === 'event-boxfish')!;
    const detail = selectEventFishDetail(SAMPLE_SNAPSHOT, boxfish);

    expect(detail.forms).toHaveLength(2);
    expect(detail.forms[0]).toEqual({
      form: 'normal',
      name: boxfish.name,
      lore: boxfish.lore,
      count: 3,
    });
    expect(detail.forms[1]).toEqual({
      form: 'variant',
      name: boxfish.variant.name,
      lore: boxfish.variant.lore,
      count: 1,
    });
    expect(detail.appearances).toHaveLength(1);
    expect(detail.appearances[0].title).toBe('제1회 강태공 선수권');
  });

  it('스냅샷이 없으면 0마리와 빈 등장 이력을 반환한다', () => {
    const boxfish = EVENT_FISH.find(f => f.id === 'event-boxfish')!;
    const detail = selectEventFishDetail(undefined, boxfish);
    expect(detail.forms[0].count).toBe(0);
    expect(detail.forms[1].count).toBe(0);
    expect(detail.appearances).toEqual([]);
  });
});
