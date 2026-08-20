// R11~R16 + 데이터 무결성 
import { describe, it, expect } from 'vitest';
import {
  RARITY, SPOTS, FISH, BOATS, MAX_BOAT, JUDGMENT_MULT, COUPONS,
  rodStats, upgradeCost, rollFish, judgeTiming, migrate, computeFame, worstFish, redeemCoupon,
  newState, addCatch, sellAll, tryUpgrade, tryBuyBoat, canFishSpot, boatSpeed, bagValue,
} from './logic';

describe('데이터 무결성', () => {
  it('모든 물고기가 유효한 해역/등급/가격을 가진다', () => {
    const spotIds = new Set(SPOTS.map(s => s.id));
    for (const f of FISH) {
      expect(spotIds.has(f.spot), f.name).toBe(true);
      expect(RARITY[f.rarity], f.name).toBeDefined();
      expect(f.price).toBeGreaterThan(0);
    }
  });

  it('해역마다 물고기가 있고, 배 게이트 구성이 유효하다', () => {
    for (const s of SPOTS) {
      expect(FISH.some(f => f.spot === s.id), s.name).toBe(true);
    }
    expect(SPOTS.map(s => s.boatTier)).toEqual([0, 0, 1, 2]); // 마을(0)/태평양(1)/해구(2)
    expect(BOATS.map(b => b.tier)).toEqual([1, 2, 3, 4]);
  });

  it('R12: 등급 가중치와 명성', () => {
    expect(RARITY.common.weight).toBe(74);
    expect(RARITY.rare.weight).toBe(20);
    expect(RARITY.epic.weight).toBe(5);
    expect(RARITY.legendary.weight).toBe(1);
    expect(RARITY.common.fame).toBe(5);
    expect(RARITY.legendary.fame).toBe(100);
  });
});

describe('R11: 추첨', () => {
  it('항상 해당 해역의 물고기를 반환 (경계 rng 포함)', () => {
    for (const s of SPOTS) {
      for (const rng of [() => 0, () => 0.5, () => 0.999999]) {
        expect(rollFish(s.id, 1, rng).spot).toBe(s.id);
      }
    }
  });
});

describe('R14: 판정 배수 (수동 어드밴티지)', () => {
  function rareRate(mult: number, n = 20000): number {
    let rare = 0;
    for (let i = 0; i < n; i++) {
      if (rollFish('pond', mult).rarity !== 'common') rare++;
    }
    return rare / n;
  }
  it('PERFECT가 일반보다 희귀 이상 확률이 높다 (통계적)', () => {
    expect(rareRate(JUDGMENT_MULT.perfect)).toBeGreaterThan(rareRate(JUDGMENT_MULT.normal) + 0.02);
  });

  it('방치(auto)는 해당 수역 최하 어종 고정', () => {
    expect(worstFish('pond').id).toBe('minnow');      // 피라미 4G
    expect(worstFish('river').id).toBe('sweetfish');  // 은어 10G
    expect(worstFish('sea').id).toBe('mackerel');     // 고등어 15G
    expect(worstFish('deep').id).toBe('anglerfish');  // 아귀 25G
    for (const s of SPOTS) {
      const w = worstFish(s.id);
      for (const f of FISH.filter(x => x.spot === s.id)) {
        expect(w.price).toBeLessThanOrEqual(f.price);
      }
    }
  });
});

describe('R6b: 타이밍 판정', () => {
  it('중앙 존 안이면 perfect, 밖이면 normal', () => {
    expect(judgeTiming(0.5, 0.24)).toBe('perfect');
    expect(judgeTiming(0.5 + 0.11, 0.24)).toBe('perfect'); // 존 경계 안
    expect(judgeTiming(0.5 + 0.13, 0.24)).toBe('normal');  // 존 경계 밖
    expect(judgeTiming(0, 0.24)).toBe('normal');
    expect(judgeTiming(1, 0.24)).toBe('normal');
  });
});

describe('R13: 낚싯대 스탯 (무한 강화, 점근 수렴)', () => {
  it('레벨 1 기준값', () => {
    expect(rodStats(1)).toEqual({ biteMin: 4, biteMax: 8, sweep: 1, zone: 0.24 });
  });
  it('강할수록 입질 빠르고 존이 넓다 (단조성, 상한 없음)', () => {
    for (let l = 2; l <= 100; l++) {
      expect(rodStats(l).biteMax).toBeLessThan(rodStats(l - 1).biteMax);
      expect(rodStats(l).zone).toBeGreaterThan(rodStats(l - 1).zone);
    }
  });
  it('아무리 강해도 한계에 수렴할 뿐 넘지 않는다 (무한 플레이 안전)', () => {
    const s = rodStats(100000);
    expect(s.biteMin).toBeGreaterThan(1);
    expect(s.biteMax).toBeGreaterThan(2.5);
    expect(s.sweep).toBeLessThan(2.2);
    expect(s.zone).toBeLessThan(0.6);
  });
});

describe('R15: 강화/구매 비용', () => {
  it('낚싯대: 50 × 1.8^(레벨-1)', () => {
    expect(upgradeCost(1)).toBe(50);
    expect(upgradeCost(2)).toBe(90);
    expect(upgradeCost(3)).toBe(162);
  });
  it('배 가격은 단조 증가', () => {
    for (let i = 1; i < BOATS.length; i++) {
      expect(BOATS[i].price).toBeGreaterThan(BOATS[i - 1].price);
      expect(BOATS[i].speed).toBeGreaterThan(BOATS[i - 1].speed);
    }
  });
});

describe('배 게이트 (R5b)', () => {
  it('배 단계 미달 해역은 낚시 불가 (마을 물가는 배 없이 가능)', () => {
    const st = newState(); // boat 0
    expect(canFishSpot(st, 'pond')).toBe(true);
    expect(canFishSpot(st, 'river')).toBe(true);
    expect(canFishSpot(st, 'sea')).toBe(false);
    expect(canFishSpot(st, 'deep')).toBe(false);
    expect(canFishSpot({ ...st, boat: 1 }, 'sea')).toBe(true);
    expect(canFishSpot({ ...st, boat: 1 }, 'deep')).toBe(false);
    expect(canFishSpot({ ...st, boat: 2 }, 'deep')).toBe(true);
  });

  it('배 구매: 골드 부족/최고 단계면 null, 성공 시 차감+단계업+속도업', () => {
    const poor = { ...newState(), gold: BOATS[0].price - 1 };
    expect(tryBuyBoat(poor)).toBeNull();
    const first = tryBuyBoat({ ...newState(), gold: BOATS[0].price })!; // 배 없음 → 조각배
    expect(first.boat).toBe(1);
    expect(first.gold).toBe(0);
    const second = tryBuyBoat({ ...first, gold: BOATS[1].price, fame: BOATS[1].fameReq })!;
    expect(second.boat).toBe(2);
    expect(boatSpeed(second)).toBeGreaterThan(boatSpeed(first));
    expect(tryBuyBoat({ ...newState(), boat: MAX_BOAT, gold: 999999, fame: 999999 })).toBeNull();
  });

  it('명성 하한 검증: 부족하면 null, 충족 시 구매되고 명성은 소모되지 않는다', () => {
    const base = { ...newState(), boat: 1, gold: BOATS[1].price };
    expect(tryBuyBoat({ ...base, fame: BOATS[1].fameReq - 1 })).toBeNull();
    const ok = tryBuyBoat({ ...base, fame: BOATS[1].fameReq })!;
    expect(ok.boat).toBe(2);
    expect(ok.fame).toBe(BOATS[1].fameReq); // 검증만, 차감 없음
  });

  it('낚싯대는 상한 없이 강화 가능 (무한 골드 싱크)', () => {
    const high = tryUpgrade({ ...newState(), rod: 500, gold: upgradeCost(500) })!;
    expect(high.rod).toBe(501);
  });
});

describe('상태 변경 (잡기/판매/강화)', () => {
  const carp = FISH.find(f => f.id === 'carp')!;

  it('잡기 → 가방/도감/명성 반영 (불변, 명성 무한 누적)', () => {
    const st = newState();
    const st2 = addCatch(addCatch(st, carp), carp);
    expect(st.bag).toHaveLength(0); // 원본 불변
    expect(st2.bag).toHaveLength(2);
    expect(st2.caught.carp).toBe(2);
    expect(st2.fame).toBe(RARITY.rare.fame * 2);
  });

  it('전부 판매 = 가격 합만큼 골드 증가, 가방 비움', () => {
    const st = addCatch(addCatch(newState(), carp), carp);
    expect(bagValue(st)).toBe(carp.price * 2);
    const sold = sellAll(st);
    expect(sold.gold).toBe(carp.price * 2);
    expect(sold.bag).toHaveLength(0);
  });

  it('낚싯대 강화: 골드 부족이면 null, 성공 시 차감+레벨업', () => {
    const poor = { ...newState(), gold: upgradeCost(1) - 1 };
    expect(tryUpgrade(poor)).toBeNull();
    const rich = { ...newState(), gold: upgradeCost(1) };
    const up = tryUpgrade(rich)!;
    expect(up.rod).toBe(2);
    expect(up.gold).toBe(0);
  });
});

describe('R18b: 세이브 마이그레이션', () => {
  it('v1 세이브(xp/spot 시절): 자산 보존 + 조각배 증정 + 도감에서 명성 소급', () => {
    const legacy = { gold: 777, xp: 340, rod: 5, bag: ['carp'], caught: { carp: 9 }, spot: 'sea' };
    const st = migrate(legacy);
    expect(st.v).toBe(4);
    expect(st.gold).toBe(777);
    expect(st.rod).toBe(5);
    expect(st.boat).toBe(1);
    expect(st.bag).toEqual(['carp']);
    expect(st.caught.carp).toBe(9);
    expect(st.fame).toBe(RARITY.rare.fame * 9); // 잡은 만큼 소급 인정 — 데이터 손실 없음
    expect('xp' in st).toBe(false);
  });

  it('computeFame: 도감 → 등급별 명성 합산 (없는 어종 id는 무시)', () => {
    expect(computeFame({})).toBe(0);
    expect(computeFame({ crucian: 2, kraken: 1, ghost: 5 }))
      .toBe(RARITY.common.fame * 2 + RARITY.legendary.fame * 1);
  });

  it('명성이 이미 있는 v4 세이브는 소급 계산하지 않고 그대로', () => {
    const st = migrate({ v: 4, fame: 42, caught: { kraken: 3 } });
    expect(st.fame).toBe(42);
  });

  it('손상된 값은 새 게임으로', () => {
    expect(migrate(null)).toEqual(newState());
    expect(migrate('garbage')).toEqual(newState());
    expect(migrate({ gold: 'hax' }).gold).toBe(0);
  });
});

describe('쿠폰 (클라이언트 검증 — P1에서 서버 이관)', () => {
  const CODE = Object.keys(COUPONS)[0];

  it('유효 코드: 골드 지급 + 사용 기록, 재사용 불가', () => {
    const r1 = redeemCoupon(newState(), CODE);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.gold).toBe(COUPONS[CODE].gold);
    expect(r1.state.coupons).toContain(CODE);
    const r2 = redeemCoupon(r1.state, CODE);
    expect(r2).toEqual({ ok: false, reason: 'used' });
  });

  it('없는 코드는 invalid, 공백은 무시(trim)', () => {
    expect(redeemCoupon(newState(), '없는코드')).toEqual({ ok: false, reason: 'invalid' });
    expect(redeemCoupon(newState(), `  ${CODE}  `).ok).toBe(true);
  });

  it('첫 쿠폰은 조각배 값을 지급한다 (레벨디자인 개편 보상)', () => {
    expect(COUPONS[CODE].gold).toBeGreaterThanOrEqual(BOATS[0].price);
  });
});
