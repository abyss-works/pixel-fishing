// 세이브 불변식 검증 — 변조 방어 (api/save.ts와 공유)
import { describe, it, expect } from 'vitest';
import { validateSave, totalSpent, maxSellable, couponGold } from './validate';
import { BOATS, COUPONS, FISH, RARITY, addCatch, newState, sellAll, tryBuyBoat, tryUpgrade, upgradeCost, computeFame } from './logic';
import type { GameState } from './logic';
import { CATCH_RATE_SLACK, MIN_CATCH_INTERVAL_MS } from './balance';

const carp = FISH.find(f => f.id === 'carp')!;   // 희귀 30G
const minnow = FISH.find(f => f.id === 'minnow')!; // 일반 4G

// 정상 플레이 재현: n마리 잡고 전부 판매
function legit(n: number): GameState {
  let s = newState();
  for (let i = 0; i < n; i++) s = addCatch(s, carp);
  return sellAll(s);
}

describe('정상 상태는 통과', () => {
  it('새 게임 / 정상 플레이 / 강화·구매·쿠폰까지 전부 통과', () => {
    expect(validateSave(newState(), null, null).ok).toBe(true);
    const played = legit(20); // 600G
    expect(validateSave(played, null, null).ok).toBe(true);
    const upgraded = tryUpgrade(played)!;
    expect(validateSave(upgraded, null, null).ok).toBe(true);
    const withBoat = tryBuyBoat({ ...legit(50), fame: computeFame(legit(50).caught) })!;
    expect(validateSave(withBoat, null, null).ok).toBe(true);
    const couponed: GameState = { ...newState(), gold: 300, coupons: [Object.keys(COUPONS)[0]] };
    expect(validateSave(couponed, null, null).ok).toBe(true);
  });

  it('가방에 있는(미판매) 물고기 상태도 통과', () => {
    const s = addCatch(addCatch(newState(), carp), minnow);
    expect(validateSave(s, null, null).ok).toBe(true);
  });
});

describe('변조 거부', () => {
  it('골드 뻥튀기: 벌 수 없었던 골드', () => {
    const s = { ...legit(5), gold: 999999 };
    expect(validateSave(s, null, null)).toEqual({ ok: false, reason: 'economy' });
  });

  it('명성 뻥튀기: 도감과 불일치', () => {
    const s = { ...legit(5), fame: 999999 };
    expect(validateSave(s, null, null)).toEqual({ ok: false, reason: 'fame!=caught' });
  });

  it('공짜 장비: 지출 없이 낚싯대/배만 올림', () => {
    const rod = { ...newState(), rod: 10 };
    expect(validateSave(rod, null, null)).toEqual({ ok: false, reason: 'economy' });
    const boat = { ...newState(), boat: 4, fame: 0 };
    expect(validateSave(boat, null, null).ok).toBe(false);
  });

  it('없는 어종/쿠폰, 가방>도감, 음수·소수 값', () => {
    expect(validateSave({ ...newState(), caught: { ghost: 1 } } as GameState, null, null).ok).toBe(false);
    expect(validateSave({ ...newState(), bag: ['ghost'] }, null, null).ok).toBe(false);
    expect(validateSave({ ...newState(), bag: ['carp'] }, null, null)) // 도감엔 없는데 가방에만
      .toEqual({ ok: false, reason: 'bag>caught' });
    expect(validateSave({ ...newState(), coupons: ['해킹쿠폰'] }, null, null).ok).toBe(false);
    expect(validateSave({ ...newState(), gold: -5 }, null, null).ok).toBe(false);
    expect(validateSave({ ...newState(), gold: 1.5 }, null, null).ok).toBe(false);
    expect(validateSave({ ...newState(), locked: ['ghost'] }, null, null))
      .toEqual({ ok: false, reason: 'locked:unknown-fish' });
    expect(validateSave({ ...newState(), locked: ['carp'] }, null, null).ok).toBe(true); // 잠금은 자유
  });
});

describe('직전 상태 대비 (단조성·속도)', () => {
  it('도감/장비/쿠폰은 되돌아갈 수 없다 (기기 충돌 롤백 방지 겸용)', () => {
    const prev = legit(10);
    expect(validateSave(legit(5), prev, 60_000)).toEqual({ ok: false, reason: 'caught:decrease' });
    const rodBack = { ...tryUpgrade(legit(10))!, rod: 1, gold: legit(10).gold };
    expect(validateSave(rodBack, tryUpgrade(legit(10))!, 60_000).ok).toBe(false);
  });

  it('인간 불가능한 어획 속도는 거부, 정상 속도는 통과', () => {
    const prev = newState();
    const fast = legit(CATCH_RATE_SLACK + 100); // 1초 만에 110마리?
    expect(validateSave(fast, prev, 1000)).toEqual({ ok: false, reason: 'catch-rate' });
    const okDelta = legit(3);
    expect(validateSave(okDelta, prev, MIN_CATCH_INTERVAL_MS * 3).ok).toBe(true);
  });
});

describe('보조 계산', () => {
  it('totalSpent = 강화 비용 합 + 배 가격 합', () => {
    expect(totalSpent(newState())).toBe(0);
    expect(totalSpent({ ...newState(), rod: 3 })).toBe(upgradeCost(1) + upgradeCost(2));
    expect(totalSpent({ ...newState(), boat: 2 })).toBe(BOATS[0].price + BOATS[1].price);
  });

  it('maxSellable = (도감−가방) × 가격, couponGold = 사용 쿠폰 합', () => {
    const s = addCatch(addCatch(newState(), carp), carp);
    expect(maxSellable(s)).toBe(0); // 전부 가방에
    expect(maxSellable(sellAll(s))).toBe(carp.price * 2);
    expect(couponGold({ ...newState(), coupons: [Object.keys(COUPONS)[0]] }))
      .toBe(Object.values(COUPONS)[0].gold);
  });

  it('RARITY 명성이 소수 없는 정수라 fame 등식이 안전하다', () => {
    for (const r of Object.values(RARITY)) expect(Number.isInteger(r.fame)).toBe(true);
  });
});
