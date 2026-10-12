// 피해자 선정 동등성 — 서버 fast path(api/action.ts catch 분기)가 리듀서와 같은
// 개체를 고르는지. 규칙 자체가 아니라 "읽기 생략분이 없음"만 본다.
// 비교자·등급우선순위·도감헬퍼가 단일 근원(logic.ts)임을 잠그는 것이 목적이다.
import { describe, it, expect } from 'vitest';
import {
  FISH, RARITY_ORDER, capOfBoat, compareBlandness, nextDexRec, overflowUids, pickEvict,
} from './logic';
import type { FishInstance, FormId } from './logic';

const mk = (uid: string, fishId: string, form: 'normal' | 'variant' = 'normal',
  size: number | null = 10, locked = false): FishInstance =>
  ({ uid, fishId, form, size, caughtAt: null, spot: null, judgment: null, locked });

// 54종 × 폼 × 크기대(소수1자리) 혼합 가방
function mixedBag(): FishInstance[] {
  const sizes: (number | null)[] = [1, 9.9, 10, 10.1, 99.5, 3000.7, null];
  return FISH.flatMap((f, i) => (['normal', 'variant'] as const).map((form, j) =>
    mk(`u-${f.id}-${form}`, f.id, form, sizes[(i + j) % sizes.length], (i + j) % 11 === 0)));
}

/** 서버 등급별 top-1 조회 흉내 — 삭제→일반→희귀→영웅→전설 순 (api/action.ts와 같은 우선순위) */
function tierTops(bag: readonly FishInstance[]): (FishInstance | null)[] {
  const unlocked = bag.filter(i => !i.locked);
  const byTier = (pred: (i: FishInstance) => boolean): FishInstance | null =>
    unlocked.filter(pred).sort(compareBlandness)[0] ?? null;
  const ids = new Set(FISH.map(f => f.id));
  return [
    byTier(i => !ids.has(i.fishId)),
    ...RARITY_ORDER.map(r => byTier(i =>
      FISH.find(f => f.id === i.fishId)?.rarity === r)),
  ];
}

describe('피해자 선정 동등성', () => {
  it('pickEvict가 overflowUids 1행과 같다 (초과 1 기준)', () => {
    for (let k = 0; k < 5; k++) {
      const bag = mixedBag().slice(k * 17, k * 17 + 60);
      const cap = bag.length - 1; // 1행 초과
      const want = overflowUids(bag, cap);
      const fresh = mk('new', 'crucian', 'normal', 12);
      const withNew = [...bag, fresh];
      const wantNew = overflowUids(withNew, cap);
      const pick = pickEvict(tierTops(bag), fresh);
      const got = pick.evictUid ? [pick.evictUid] : [];
      // 새 놈 방생이면 overflow에 새 uid가 들어간다
      expect(pick.evictNew).toBe(wantNew.includes('new'));
      if (!pick.evictNew) expect(got).toEqual(want.slice(0, 1));
    }
  });

  it('삭제 어종이 일반보다 먼저', () => {
    const bag = [mk('a', 'no-such-fish'), mk('b', 'crucian'), mk('c', 'shark')];
    const fresh = mk('new', 'carp');
    expect(pickEvict(tierTops(bag), fresh)).toEqual({ evictUid: 'a', evictNew: false });
    expect(overflowUids([...bag, fresh], bag.length)).toEqual(['a']);
  });

  it('전부 잠그면 방생 없음', () => {
    const bag = mixedBag().map(i => ({ ...i, locked: true }));
    expect(pickEvict(tierTops(bag), mk('new', 'crucian')))
      .toEqual({ evictUid: null, evictNew: false });
    expect(overflowUids(bag, bag.length - 1)).toEqual([]);
  });

  it('새 놈이 가장 안 특별하면 그 자리에서 방생', () => {
    const bag = [mk('a', 'shark', 'normal', 500), mk('b', 'kraken', 'variant', 900)];
    const fresh = mk('new', 'crucian', 'normal', 5);
    expect(pickEvict(tierTops(bag), fresh)).toEqual({ evictUid: null, evictNew: true });
    expect(overflowUids([...bag, fresh], bag.length)).toEqual(['new']);
  });

  it('nextDexRec가 addCatch 도감 갱신과 같다', () => {
    expect(nextDexRec(undefined, 20, '2026-01-01'))
      .toEqual({ count: 1, maxSize: 20, first: '2026-01-01' });
    expect(nextDexRec({ count: 3, maxSize: 30, first: '2026-01-01' }, 25, '2026-02-02'))
      .toEqual({ count: 4, maxSize: 30, first: '2026-01-01' });
    expect(nextDexRec({ count: 3, maxSize: 30, first: '2026-01-01' }, null, '2026-02-02'))
      .toEqual({ count: 4, maxSize: 30, first: '2026-01-01' });
  });

  it('capOfBoat 래칫 기준과 일치한다', () => {
    expect(capOfBoat(0)).toBe(60);
    expect(capOfBoat(1)).toBe(140);
  });

  it('폼은 2종이다 — 늘면 서버 피해자 쿼리(api/action.ts form 정렬)를 고쳐야 한다', () => {
    // FormId 유니온에 멤버가 추가되면 여기서 컴파일이 깨진다. 그게 신호다.
    const exhaustive: Record<FormId, true> = { normal: true, variant: true };
    expect(Object.keys(exhaustive)).toHaveLength(2);
  });
});
