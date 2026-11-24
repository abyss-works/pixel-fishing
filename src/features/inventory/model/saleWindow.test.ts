// 판매 창 모델 — 창 제목, 탭, 판매 탭의 비교 표와 요약, 등급 칩 스트립, 잠긴 개체 툴팁 문안.
import { describe, expect, it } from 'vitest';
import { FISH, newState } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import { RARITY_ORDER } from '../../../game/content/rarity';
import { BASE_PACKS } from '../../../game/world';
import { LOCKED_PICK_TIP, SALE_TABS, SEA_SELL_LOCK_TEXT, gradePickChips, saleWindowTitle, selectSaleTab, sellTabLock } from './saleWindow';

const fish = FISH.find(f => f.id === 'crucian')!;
const inst = (uid: string, over: Partial<FishInstance> = {}): FishInstance =>
  ({ uid, fishId: fish.id, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false, ...over });
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('판매 창 제목', () => {
  it('집은 궤짝, 항구는 어시장이다. 가방 마릿수는 제목에 넣지 않는다', () => {
    expect(saleWindowTitle('home')).toBe('궤짝');
    for (const port of ['harbor', 'manila', 'colombo', 'toamasina', 'walvisbay'] as const) {
      expect(saleWindowTitle(port), port).toBe('어시장');
    }
  });

  it('판매 시설이 있는 모든 거점의 제목은 그 거점 시설 카드의 이름과 같다', () => {
    for (const pack of Object.values(BASE_PACKS)) {
      const card = pack.furniture.find(f => f.id === 'sell')!;
      expect(card.windowTitle, pack.id).toBeDefined();
      expect(saleWindowTitle(pack.id), pack.id).toBe(card.windowTitle);
      expect(saleWindowTitle(pack.id), pack.id).toBe(card.label({ rod: 1, boatName: '' }).title);
    }
  });

  it('거점 밖(바다)에서는 제목이 기운 얻기이고 판매 탭은 잠긴다', () => {
    expect(saleWindowTitle(undefined)).toBe('기운 얻기');
    expect(sellTabLock(undefined)).toEqual([SEA_SELL_LOCK_TEXT]);
    expect(sellTabLock('home')).toBeNull();
    expect(sellTabLock('harbor')).toBeNull();
  });
});

describe('탭', () => {
  it('판매, 기운 얻기 순서다', () => {
    expect(SALE_TABS.map(t => [t.key, t.label])).toEqual([['sell', '판매'], ['energy', '기운 얻기']]);
  });
});

describe('판매 탭', () => {
  it('고른 개체 수, 골드와 가방의 현재 값과 판매 후 값을 낸다', () => {
    const game = seed({ gold: 120, bag: [inst('a'), inst('b'), inst('c', { locked: true })] });
    const v = selectSaleTab(game, new Set(['b']), 0);
    expect(v.count).toBe(1);
    expect(v.soldUids).toEqual(['a']);
    expect(v.gold).toEqual({ current: 120, after: 120 + fish.price });
    expect(v.bag).toEqual({ current: 3, after: 2 });
  });

  it('길드 판매가 보너스가 들어간 금액을 판매 후 골드에 쓴다', () => {
    const v = selectSaleTab(seed({ gold: 0, bag: [inst('a')] }), new Set(), 0.5);
    expect(v.total.value).toBeGreaterThan(fish.price);
    expect(v.gold.after).toBe(v.total.value);
  });

  it('고른 것이 없거나 가방이 비어도 값만 같고 구조는 그대로다', () => {
    const none = selectSaleTab(seed({ gold: 5, bag: [inst('a')] }), new Set(['a']), 0);
    expect([none.count, none.gold, none.bag]).toEqual([0, { current: 5, after: 5 }, { current: 1, after: 1 }]);
    const empty = selectSaleTab(seed({ gold: 5 }), new Set(), 0);
    expect([empty.count, empty.rows, empty.gold, empty.bag]).toEqual([0, [], { current: 5, after: 5 }, { current: 0, after: 0 }]);
  });

  it('잠근 개체는 팔리지 않고 가방 수에는 센다', () => {
    const v = selectSaleTab(seed({ bag: [inst('a', { locked: true })] }), new Set(), 0);
    expect(v.count).toBe(0);
    expect(v.bag).toEqual({ current: 1, after: 1 });
  });

  it('오늘의 재물운이 켜져 있으면 예상 수령액과 판매 후 골드에 운 배율을 반영한다', () => {
    const now = '2026-11-24T05:00:00.000Z';
    const bigFish = FISH.find(f => f.price >= 100)!;
    const g = seed({
      gold: 100,
      bag: [inst('a', { fishId: bigFish.id })],
      fortune: { day: '2026-11-24', kind: 'gold', index: 5 },
    });
    const v = selectSaleTab(g, new Set(), 0, now);
    const expected = Math.round(bigFish.price * 1.05);
    expect(v.total.value).toBe(expected);
    expect(v.total.mods).toEqual([{ id: 'fortune-sell', label: '오늘의 운세', delta: expected - bigFish.price }]);
    expect(v.gold).toEqual({ current: 100, after: 100 + expected });

    // 날짜가 지난 재물운이나 다른 종류 운세는 반영하지 않는다
    const stale = selectSaleTab({ ...g, fortune: { day: '2026-11-23', kind: 'gold', index: 5 } }, new Set(), 0, now);
    expect(stale.total.value).toBe(bigFish.price);
    const other = selectSaleTab({ ...g, fortune: { day: '2026-11-24', kind: 'fish', index: 5 } }, new Set(), 0, now);
    expect(other.total.value).toBe(bigFish.price);
  });
});

describe('등급 칩', () => {
  const rare = FISH.find(f => f.id === 'carp')!;

  it('등급 순서로 칩이 하나씩이고 그 등급의 선택 가능 개체 uid를 모은다', () => {
    const rows = selectSaleTab(seed({ bag: [inst('a'), inst('b'), inst('c', { fishId: rare.id })] }), new Set(), 0).rows;
    const chips = gradePickChips(rows);
    expect(chips.map(c => c.grade)).toEqual(RARITY_ORDER);
    expect(chips.map(c => c.name)).toEqual(['일반', '희귀', '영웅', '전설']);
    expect(chips.find(c => c.grade === 'common')!.uids).toEqual(['a', 'b']);
    expect(chips.find(c => c.grade === 'rare')!.uids).toEqual(['c']);
    expect(chips.find(c => c.grade === 'epic')!.uids).toEqual([]);
  });

  it('잠긴 개체는 칩이 다루는 개체에서 빠진다', () => {
    const rows = selectSaleTab(seed({ bag: [inst('a'), inst('b', { locked: true })] }), new Set(), 0).rows;
    expect(gradePickChips(rows).find(c => c.grade === 'common')!.uids).toEqual(['a']);
  });

  it('그 등급의 선택 가능 개체가 전부 골라져 있을 때만 켜짐이다', () => {
    const all = selectSaleTab(seed({ bag: [inst('a'), inst('b')] }), new Set(), 0).rows;
    expect(gradePickChips(all).find(c => c.grade === 'common')!.allOn).toBe(true);
    const some = selectSaleTab(seed({ bag: [inst('a'), inst('b')] }), new Set(['b']), 0).rows;
    expect(gradePickChips(some).find(c => c.grade === 'common')!.allOn).toBe(false);
    const none = selectSaleTab(seed({ bag: [inst('a')] }), new Set(['a']), 0).rows;
    expect(gradePickChips(none).find(c => c.grade === 'common')!.allOn).toBe(false);
  });

  it('선택 가능한 개체가 없는 등급은 개체가 비어 있고 켜지지 않는다', () => {
    const rows = selectSaleTab(seed({ bag: [inst('a', { locked: true })] }), new Set(), 0).rows;
    const chips = gradePickChips(rows);
    expect(chips.every(c => c.uids.length === 0 && !c.allOn)).toBe(true);
  });
});

describe('잠긴 개체 툴팁', () => {
  it('두 줄이다', () => {
    expect(LOCKED_PICK_TIP).toBe('잠근 개체는 고를 수 없어요.\n잠금은 가방 탭에서 풀 수 있어요.');
  });
});
