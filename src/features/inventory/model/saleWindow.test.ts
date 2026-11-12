// 판매 창 모델 — 창 제목, 탭, 판매 탭의 비교 표와 요약, 잠긴 개체 툴팁 문안.
import { describe, expect, it } from 'vitest';
import { FISH, newState } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import { BASE_PACKS } from '../../../game/world';
import { LOCKED_PICK_TIP, SALE_TABS, saleWindowTitle, selectSaleTab } from './saleWindow';

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
      expect(saleWindowTitle(pack.id), pack.id).toBe(card.label({ rod: 1, boatName: '' }).title);
    }
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
});

describe('잠긴 개체 툴팁', () => {
  it('두 줄이다', () => {
    expect(LOCKED_PICK_TIP).toBe('잠근 개체는 고를 수 없어요.\n잠금은 가방 탭에서 풀 수 있어요.');
  });
});
