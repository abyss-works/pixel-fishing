// R11~R16 + 데이터 무결성 
import { describe, it, expect } from 'vitest';
import {
  RARITY, SPOTS, FISH, MAX_ROD,
  rodStats, upgradeCost, rollFish, levelForXp,
  newState, addCatch, sellAll, tryUpgrade, bagValue,
} from './logic';

describe('데이터 무결성', () => {
  it('모든 물고기가 유효한 낚시터/등급/가격을 가진다', () => {
    const spotIds = new Set(SPOTS.map(s => s.id));
    for (const f of FISH) {
      expect(spotIds.has(f.spot), f.name).toBe(true);
      expect(RARITY[f.rarity], f.name).toBeDefined();
      expect(f.price).toBeGreaterThan(0);
    }
  });

  it('낚시터마다 물고기가 있다', () => {
    for (const s of SPOTS) {
      expect(FISH.some(f => f.spot === s.id), s.name).toBe(true);
    }
  });

  it('R12: 등급 가중치와 XP', () => {
    expect(RARITY.common.weight).toBe(74);
    expect(RARITY.rare.weight).toBe(20);
    expect(RARITY.epic.weight).toBe(5);
    expect(RARITY.legendary.weight).toBe(1);
    expect(RARITY.common.xp).toBe(5);
    expect(RARITY.rare.xp).toBe(15);
    expect(RARITY.epic.xp).toBe(40);
    expect(RARITY.legendary.xp).toBe(100);
  });
});

describe('R11: 추첨', () => {
  it('항상 해당 낚시터의 물고기를 반환 (경계 rng 포함)', () => {
    for (const s of SPOTS) {
      for (const rng of [() => 0, () => 0.5, () => 0.999999]) {
        expect(rollFish(s.id, 0, rng).spot).toBe(s.id);
      }
    }
  });
});

describe('R14: 행운', () => {
  function rareRate(luck: number, n = 20000): number {
    let rare = 0;
    for (let i = 0; i < n; i++) {
      if (rollFish('pond', luck).rarity !== 'common') rare++;
    }
    return rare / n;
  }
  it('행운이 높으면 희귀 이상 확률이 통계적으로 증가', () => {
    expect(rareRate(9)).toBeGreaterThan(rareRate(0) + 0.05);
  });
});

describe('R13: 낚싯대 스탯', () => {
  it('레벨 1과 10의 스펙 값', () => {
    const s1 = rodStats(1), s10 = rodStats(MAX_ROD);
    expect(s1).toEqual({ biteMin: 4, biteMax: 8, window: 1, luck: 0 });
    expect(s10.biteMin).toBeCloseTo(1);
    expect(s10.biteMax).toBeCloseTo(2.5);
    expect(s10.window).toBeCloseTo(2);
    expect(s10.luck).toBe(9);
  });
  it('강할수록 빠르고 창이 넓다 (단조성)', () => {
    for (let l = 2; l <= MAX_ROD; l++) {
      expect(rodStats(l).biteMax).toBeLessThan(rodStats(l - 1).biteMax);
      expect(rodStats(l).window).toBeGreaterThan(rodStats(l - 1).window);
    }
  });
});

describe('R15: 강화 비용', () => {
  it('50 × 1.8^(레벨-1)', () => {
    expect(upgradeCost(1)).toBe(50);
    expect(upgradeCost(2)).toBe(90);
    expect(upgradeCost(3)).toBe(162);
  });
});

describe('R16: 레벨 곡선', () => {
  it('레벨 n→n+1에 n×50 xp', () => {
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(49).level).toBe(1);
    expect(levelForXp(50).level).toBe(2);
    expect(levelForXp(50 + 100).level).toBe(3);
    expect(levelForXp(50 + 100 + 150).level).toBe(4);
  });
});

describe('상태 변경 (잡기/판매/강화)', () => {
  const carp = FISH.find(f => f.id === 'carp')!;

  it('잡기 → 가방/도감/XP 반영 (불변)', () => {
    const st = newState();
    const st2 = addCatch(addCatch(st, carp), carp);
    expect(st.bag).toHaveLength(0); // 원본 불변
    expect(st2.bag).toHaveLength(2);
    expect(st2.caught.carp).toBe(2);
    expect(st2.xp).toBe(RARITY.rare.xp * 2);
  });

  it('전부 판매 = 가격 합만큼 골드 증가, 가방 비움', () => {
    const st = addCatch(addCatch(newState(), carp), carp);
    expect(bagValue(st)).toBe(carp.price * 2);
    const sold = sellAll(st);
    expect(sold.gold).toBe(carp.price * 2);
    expect(sold.bag).toHaveLength(0);
  });

  it('강화: 골드 부족/최대 레벨이면 null, 성공 시 차감+레벨업', () => {
    const poor = { ...newState(), gold: upgradeCost(1) - 1 };
    expect(tryUpgrade(poor)).toBeNull();
    const rich = { ...newState(), gold: upgradeCost(1) };
    const up = tryUpgrade(rich)!;
    expect(up.rod).toBe(2);
    expect(up.gold).toBe(0);
    expect(tryUpgrade({ ...newState(), rod: MAX_ROD, gold: 999999 })).toBeNull();
  });
});
