// R11~R16 + 데이터 무결성 
import { describe, it, expect } from 'vitest';
import {
  RARITY, RARITY_ORDER, SPOTS, FISH, BOATS, MAX_BOAT, JUDGMENT_MULT, COUPONS,
  rodStats, upgradeCost, rollFish, judgeTiming, migrate, computeFame, redeemCoupon,
  drawRows, goldEV,
  type RarityId,
  newState, addCatch, sellAll, tryUpgrade, tryBuyBoat, canFishSpot, boatSpeed, bagValue,
  sellableValue, sellSelected, setLocked, overflowUids, release, bagCapacity,
  autoLockUids, addItem, takeItem, usableBait, rarityWeightOf,
  WALK_BAG_CAP,
  sizeParams, rollSize, sizePercentile, rollCatchExtras,
  makeInstance, priceOfInstance, instanceName, dexRecord, speciesCount,
  formDiscovered, variantDiscovered, dexSpeciesCount,
  canBuyBoat, canUpgradeRod, canFish, REJECT_TEXT,
} from './logic';
import type { CatchExtras, FishInstance, FormId } from './logic';

// 개체 픽스처 — 캐치 문맥은 테스트마다 고정값이면 충분
let uidSeq = 0;
const mk = (fishId: string, form: FormId = 'normal', size: number | null = 20): FishInstance =>
  ({ uid: `u${++uidSeq}`, fishId, form, size, caughtAt: null, spot: null, judgment: null,
     locked: false });

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
    expect(SPOTS.map(s => s.boatTier)).toEqual([0, 0, 1, 2, 3, 3, 3, 5, 6]); // 마을(0)/태평양(1)/해구(2)/동남아(3)/인도양(5·6 — 1-2는 tier4 소비)
    expect(BOATS.map(b => b.tier)).toEqual([1, 2, 3, 4, 5, 6]);
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

describe('2단 추첨 — 등급 축·개체 축 분리 (v0.6.6, balance-metrics 왜곡 수정)', () => {
  it('등급 실질확률은 개체 수와 무관하게 설계 가중치 비율이다', () => {
    // 배리어 리프(사용자 밸런스 일괄 2026-08-27): 일반74 · 희귀23 · 영웅0 · 전설3
    const T = 74 + 23 + 3; // 영웅 부재 재균등 + 수역 오버라이드 (100)
    const rows = drawRows('barrierreef');
    const sumFishPct = (r: RarityId) => rows.filter(x => x.fish.rarity === r)
      .reduce((s, x) => s + x.fishPct, 0);
    // 행의 gradePct는 "그 등급의 총 확률"이라 모든 개체 행에서 같은 값을 담는다
    for (const x of rows.filter(x => x.fish.rarity === 'common')) {
      expect(x.gradePct).toBeCloseTo(74 / T * 100, 5);
    }
    for (const x of rows.filter(x => x.fish.rarity === 'legendary')) {
      expect(x.gradePct).toBeCloseTo(3 / T * 100, 5); // 오버라이드 3
    }
    expect(sumFishPct('common')).toBeCloseTo(74 / T * 100, 5);
    expect(sumFishPct('rare')).toBeCloseTo(23 / T * 100, 5);
    expect(sumFishPct('epic')).toBe(0);
    expect(sumFishPct('legendary')).toBeCloseTo(3 / T * 100, 5);
  });

  it('goldEV — drawRows 확률 × 가격과 동치이고, 수역 오버라이드·다이얼을 반영한다', () => {
    const manual = drawRows('barrierreef')
      .reduce((s, x) => s + x.fishPct / 100 * x.fish.price, 0);
    expect(goldEV('barrierreef')).toBeCloseTo(manual, 6);
    // 회귀 앵커 — 중립/GOOD/방치 대표값(2026-08-27 밸런스 JSON 3차 반영 후 재측정)
    expect(goldEV('pond')).toBeCloseTo(20.7, 0);
    expect(goldEV('barrierreef', { rareMult: 1.6 })).toBeCloseTo(393.5, 0);
    expect(goldEV('pond', { commonMult: 10 })).toBeCloseTo(7.0, 0);
  });

  it('같은 등급 내 개체는 균등 배분 — 연못 일반 3종 각 74/3%', () => {
    const commons = drawRows('pond').filter(x => x.fish.rarity === 'common');
    expect(commons).toHaveLength(3);
    for (const x of commons) expect(x.fishPct).toBeCloseTo(74 / 3 / (74 + 20 + 5 + 1) * 100, 5);
    // 개체 가중치는 기본 1 (고도화 예약 축)
    for (const x of drawRows('pond')) expect(x.individualWeight).toBe(1);
  });

  it('통계(결정적 시드) — 배리어 리프 전설 2종 반반, 합계 ~1%대', () => {
    let s = 42 >>> 0;
    const rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const N = 80000;
    const byId = new Map<string, number>();
    let nonCommon = 0;
    for (let i = 0; i < N; i++) {
      const f = rollFish('barrierreef', 1, rng);
      if (f.rarity !== 'common') nonCommon++;
      if (f.rarity === 'legendary') byId.set(f.id, (byId.get(f.id) ?? 0) + 1);
    }
    expect(nonCommon / N).toBeGreaterThan(0.22);   // 설계 26% ((23+3)/100) ± 여유
    expect(nonCommon / N).toBeLessThan(0.30);
    const [a = 0, b = 0] = [...byId.values()];
    expect(Math.abs(a - b) / Math.max(a, b, 1)).toBeLessThan(0.25); // 두 종 균등
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

  it('commonMult(방치 페널티): 일반 가중치를 키우면 희귀 이상 확률이 크게 줄어든다', () => {
    const rate = (commonMult: number, n = 20000) => {
      let rare = 0;
      for (let i = 0; i < n; i++) {
        if (rollFish('pond', 1, Math.random, commonMult).rarity !== 'common') rare++;
      }
      return rare / n;
    };
    const normal = rate(1);   // ≈ 26%
    const idle = rate(10);    // ≈ 3.4% — 수동의 1/10 수준
    expect(idle).toBeLessThan(normal / 5);
    expect(idle).toBeGreaterThan(0.005); // 그래도 0은 아님 — 방치로도 희귀가 뜬다
  });
});

describe('R6b: 타이밍 판정', () => {
  it('중앙 존 안이면 good(노란), 더 안이면 perfect(빨간), 밖이면 normal', () => {
    expect(judgeTiming(0.5, 0.24)).toBe('good');
    expect(judgeTiming(0.5, 0.24, 0.10)).toBe('perfect'); // 빨간 안
    expect(judgeTiming(0.5 + 0.11, 0.24)).toBe('good'); // 존 경계 안
    expect(judgeTiming(0.5 + 0.13, 0.24)).toBe('normal');  // 존 경계 밖
    expect(judgeTiming(0, 0.24)).toBe('normal');
    expect(judgeTiming(1, 0.24)).toBe('normal');
  });
});

describe('R13: 낚싯대 스탯 (무한 강화, 점근 수렴)', () => {
  it('레벨 1 기준값 — 존 스탯은 폐기(존은 수역 파워 게이트 소관), 바 시간은 1.4초 고정', () => {
    expect(rodStats(1)).toEqual({ biteMin: 4, biteMax: 8, sweep: 1.4 });
  });
  it('강할수록 입질이 빨라진다 (단조성, 상한 없음) — 바 시간은 고정', () => {
    for (let l = 2; l <= 100; l++) {
      expect(rodStats(l).biteMax).toBeLessThan(rodStats(l - 1).biteMax);
      expect(rodStats(l).sweep).toBe(1.4);
    }
  });
  it('아무리 강해도 한계에 수렴할 뿐 넘지 않는다 (무한 플레이 안전)', () => {
    const s = rodStats(100000);
    expect(s.biteMin).toBeGreaterThan(1);
    expect(s.biteMax).toBeGreaterThan(2.5);
    expect(s.sweep).toBe(1.4);
  });
});

describe('R15: 강화/구매 비용', () => {
  it('낚싯대: 50 × 1.8^(레벨-1)', () => {
    expect(upgradeCost(1)).toBe(50);
    expect(upgradeCost(2)).toBe(85);   // costGrowth 1.7
    expect(upgradeCost(3)).toBe(144);
  });
  it('배 가격은 단조 증가', () => {
    for (let i = 1; i < BOATS.length; i++) {
      expect(BOATS[i].price).toBeGreaterThan(BOATS[i - 1].price);
      expect(BOATS[i].speed).toBeGreaterThan(BOATS[i - 1].speed);
      expect(BOATS[i].bagCap).toBeGreaterThan(BOATS[i - 1].bagCap); // 가방도 함께
    }
    expect(BOATS[0].bagCap).toBeGreaterThan(WALK_BAG_CAP);          // 첫 배 = 맨발보다 크다
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
  const crucian = FISH.find(f => f.id === 'crucian')!;

  it('잡기 → 가방 개체/도감/명성 반영 (불변, 명성 무한 누적)', () => {
    const st = newState();
    const st2 = addCatch(addCatch(st, mk('carp'), carp), mk('carp'), carp);
    expect(st.bag).toHaveLength(0); // 원본 불변
    expect(st2.bag).toHaveLength(2);
    expect(speciesCount(st2, 'carp')).toBe(2);
    expect(dexRecord(st2, 'carp', 'normal')).toMatchObject({ count: 2, maxSize: 20 });
    expect(st2.fame).toBe(RARITY.rare.fame * 2);
  });

  it('전부 판매 = 가격 합만큼 골드 증가, 가방 비움 (도감 기록은 남는다)', () => {
    const st = addCatch(addCatch(newState(), mk('carp'), carp), mk('carp'), carp);
    expect(bagValue(st)).toBe(carp.price * 2);
    const sold = sellAll(st);
    expect(sold.gold).toBe(carp.price * 2);
    expect(sold.bag).toHaveLength(0);
    expect(speciesCount(sold, 'carp')).toBe(2); // 팔아도 기록은 영구
  });

  it('선택 판매: uid로 지목한 개체만 팔리고, 잠근 개체는 uid가 와도 안 팔린다', () => {
    const a = mk('carp'), b = mk('crucian');
    const st = addCatch(addCatch(newState(), a, carp), b, crucian);
    const partial = sellSelected(st, [b.uid]);
    expect(partial.gold).toBe(crucian.price);
    expect(partial.bag.map(i => i.uid)).toEqual([a.uid]);
    // 잠근 개체는 이중 방어 — uid를 넣어도 무시
    const locked = setLocked(st, [a.uid], true);
    const defended = sellSelected(locked, [a.uid, b.uid]);
    expect(defended.gold).toBe(crucian.price);
    expect(defended.bag.map(i => i.uid)).toEqual([a.uid]);
  });

  it('없는 uid는 무시된다 (변조·경합 방어)', () => {
    const st = addCatch(newState(), mk('carp'), carp);
    const out = sellSelected(st, ['ghost-uid']);
    expect(out.gold).toBe(0);
    expect(out.bag).toHaveLength(1);
  });

  it('잠근 개체는 전부 판매에서 제외되고 가방에 남는다 (R1b)', () => {
    const insts = [mk('carp'), mk('carp'), mk('crucian')];
    const st = insts.reduce((acc, i) => addCatch(acc, i, i.fishId === 'carp' ? carp : crucian), newState());
    const carpUids = insts.filter(i => i.fishId === 'carp').map(i => i.uid);
    const locked = setLocked(st, carpUids, true);
    expect(locked.bag.filter(i => i.locked).map(i => i.uid)).toEqual(carpUids);
    expect(sellableValue(locked)).toBe(crucian.price); // 잉어 2마리 제외
    const sold = sellAll(locked);
    expect(sold.gold).toBe(crucian.price);
    expect(sold.bag.map(i => i.fishId)).toEqual(['carp', 'carp']); // 잠긴 개체는 남는다
    // 해제 → 다시 판매 대상
    const unlocked = setLocked(sold, carpUids, false);
    expect(unlocked.bag.every(i => !i.locked)).toBe(true);
    expect(sellableValue(unlocked)).toBe(carp.price * 2);
  });

  it('autoLockUids — 어종×폼별 최대 1마리, 그 최대가 이미 잠기면 그룹은 건너뛴다', () => {
    const bag = [
      mk('crucian', 'normal', 30), mk('crucian', 'normal', 10),
      mk('crucian', 'variant', 99),
      mk('carp', 'normal', 50), mk('carp', 'normal', 70),
    ];
    const uids = autoLockUids(bag);
    expect(uids).toHaveLength(3); // 붕어일반(30) · 붕어변이(99) · 잉어(70)
    const byUid = (uid: string) => bag.find(i => i.uid === uid)!.size;
    expect(uids.map(byUid).sort((a, b) => (b ?? -1) - (a ?? -1))).toEqual([99, 70, 30]);

    // 최대가 이미 잠긴 그룹(잉어)은 제외 — 눌러도 변하지 않는다 (멱등)
    const carpTop = bag.find(i => i.fishId === 'carp' && i.size === 70)!;
    const lockedTop = bag.map(i => (i.uid === carpTop.uid ? { ...i, locked: true } : i));
    expect(autoLockUids(lockedTop)).toHaveLength(2);
  });

  it('autoLockUids — 크기 미상은 최소 취급, 동률이어도 그룹당 1마리', () => {
    const bag = [mk('crucian'), mk('crucian', 'normal', null)];
    const uids = autoLockUids(bag);
    expect(uids).toHaveLength(1); // 미상보다 20cm가 이긴다
    expect(bag.find(i => i.uid === uids[0])!.size).toBe(20);

    const ties = Array.from({ length: 5 }, () => mk('crucian', 'normal', null));
    expect(autoLockUids(ties)).toHaveLength(1);
    expect(autoLockUids([])).toEqual([]);
  });

  it('가방 상한: 안 넘치면 아무것도 안 놓아준다', () => {
    const cap = WALK_BAG_CAP;
    const bag = Array.from({ length: cap }, () => mk('crucian'));
    expect(overflowUids(bag, cap)).toEqual([]);
  });

  it('가방 상한: 넘친 만큼만, 가장 안 특별한 것부터 놓아준다', () => {
    // 등급 → 폼 → 크기 순으로 "덜 특별". 일부러 뒤섞어 넣는다
    const bigCommon = mk('crucian', 'normal', 30);   // 일반, 큼
    const smallCommon = mk('crucian', 'normal', 5);  // 일반, 작음 ← 가장 안 특별
    const variant = mk('crucian', 'variant', 5);     // 변이 (같은 등급·크기면 변이가 더 특별)
    const rare = mk('carp', 'normal', 5);            // 희귀
    const bag = [rare, variant, bigCommon, smallCommon];
    expect(overflowUids(bag, 3)).toEqual([smallCommon.uid]);
    expect(overflowUids(bag, 2)).toEqual([smallCommon.uid, bigCommon.uid]);
    expect(overflowUids(bag, 1)).toEqual([smallCommon.uid, bigCommon.uid, variant.uid]);
  });

  it('가방 상한은 배 속성(bagCap)을 따른다', () => {
    const few = Array.from({ length: 10 }, () => mk('crucian'));
    expect(bagCapacity(0, few)).toBe(WALK_BAG_CAP); // 맨발
    BOATS.forEach(b => expect(bagCapacity(b.tier, few)).toBe(b.bagCap));
  });

  it('가방 상한은 래칫 — 이미 넘겨 들었으면 그 수가 상한이다', () => {
    const many = Array.from({ length: 3000 }, () => mk('crucian'));
    expect(bagCapacity(0, many)).toBe(3000);                 // 넘겨 들었으면 몰수하지 않는다
    expect(overflowUids(many, bagCapacity(0, many))).toEqual([]); // 가만히 있으면 아무것도 안 나간다
  });

  it('가방 상한: 크기 미상(이관 개체)이 가장 먼저 나간다', () => {
    const unknown = mk('crucian', 'normal', null), known = mk('crucian', 'normal', 1);
    expect(overflowUids([known, unknown], 1)).toEqual([unknown.uid]);
  });

  it('가방 상한: 잠근 개체는 후보가 아니고, 전부 잠기면 상한을 넘긴 채 둔다', () => {
    const locked = [mk('crucian', 'normal', 1), mk('crucian', 'normal', 2)]
      .map(i => ({ ...i, locked: true }));
    const free = mk('carp', 'normal', 99); // 더 특별하지만 유일한 후보
    expect(overflowUids([...locked, free], 1)).toEqual([free.uid]);
    // 놓아줄 게 없으면 빈 목록 — 캐치를 거부하지 않는다(실패 페널티 금지)
    expect(overflowUids(locked, 1)).toEqual([]);
  });

  it('방생은 개체만 지운다 — 명성·도감은 잡는 순간 확정이라 안 건드린다', () => {
    const a = mk('carp'), b = mk('crucian');
    const st = addCatch(addCatch(newState(), a, carp), b, crucian);
    const after = release(st, [a.uid]);
    expect(after.bag.map(i => i.uid)).toEqual([b.uid]);
    expect(after.fame).toBe(st.fame);                                  // 명성 유지
    expect(dexRecord(after, 'carp', 'normal')).toEqual(dexRecord(st, 'carp', 'normal'));
    expect(after.gold).toBe(st.gold);                                  // 골드는 안 준다
  });

  it('같은 종이라도 개체마다 따로 잠긴다 — 큰 놈만 남기기', () => {
    const big = mk('carp', 'normal', 40), small = mk('carp', 'normal', 10);
    const st = [big, small].reduce((acc, i) => addCatch(acc, i, carp), newState());
    const kept = setLocked(st, [big.uid], true);
    expect(sellableValue(kept)).toBe(carp.price);      // 작은 놈 하나만 판매 대상
    expect(sellAll(kept).bag.map(i => i.uid)).toEqual([big.uid]);
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

describe('월척(크기)·개체·폼 기록', () => {
  const carp = FISH.find(f => f.id === 'carp')!;
  const crucian = FISH.find(f => f.id === 'crucian')!;
  const kraken = FISH.find(f => f.id === 'kraken')!;

  it('sizeParams: 가격이 비쌀수록 평균 크기가 커진다', () => {
    expect(sizeParams(kraken).mean).toBeGreaterThan(sizeParams(carp).mean);
    expect(sizeParams(carp).std).toBeCloseTo(sizeParams(carp).mean * 0.18);
  });

  it('rollSize: u1=1이면 Box-Muller z=0 → 평균 크기를 그대로 반환', () => {
    expect(rollSize(carp, () => 1)).toBeCloseTo(sizeParams(carp).mean, 5);
  });

  it('sizePercentile: 평균 크기는 상위 50%, 훨씬 크면 0%에 가깝다', () => {
    const { mean, std } = sizeParams(carp);
    expect(sizePercentile(carp, mean)).toBeCloseTo(50, 0);
    expect(sizePercentile(carp, mean + std * 3)).toBeLessThan(1);
    expect(sizePercentile(carp, mean - std * 3)).toBeGreaterThan(99);
  });

  it('rollCatchExtras: 변이 폼 확률은 대략 1/3 (통계적)', () => {
    let variant = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (rollCatchExtras(carp).form === 'variant') variant++;
    expect(variant / n).toBeGreaterThan(0.30);
    expect(variant / n).toBeLessThan(0.36);
  });

  it('addCatch: 폼별로 마릿수/크기가 갈리고 종 합계는 폼 합산으로 파생 (v8)', () => {
    const st1 = addCatch(newState(), mk('carp', 'variant', 40), carp);
    expect(dexRecord(st1, 'carp', 'variant')).toMatchObject({ count: 1, maxSize: 40 });
    expect(dexRecord(st1, 'carp', 'normal')).toBeUndefined(); // 일반 폼 기록은 무변경
    expect(speciesCount(st1, 'carp')).toBe(1);
    expect(variantDiscovered(st1, 'carp')).toBe(true);
    expect(formDiscovered(st1, 'carp', 'normal')).toBe(false); // 변이만 잡았으면 일반은 미발견

    const st2 = addCatch(st1, mk('carp', 'normal', 30), carp);
    expect(speciesCount(st2, 'carp')).toBe(2);                       // 폼 합산
    expect(dexRecord(st2, 'carp', 'normal')?.maxSize).toBe(30);
    expect(dexRecord(st2, 'carp', 'variant')?.maxSize).toBe(40);     // 폼 간 독립
    expect(dexSpeciesCount(st2)).toBe(1);
  });

  it('addCatch: 크기 미상(이관) 개체는 기존 최대 크기를 덮어쓰지 않는다', () => {
    const st = addCatch(newState(), mk('carp', 'normal', 35), carp);
    const withNull = addCatch(st, mk('carp', 'normal', null), carp);
    expect(dexRecord(withNull, 'carp', 'normal')).toMatchObject({ count: 2, maxSize: 35 });
    // 미상 개체만 있으면 최대 크기는 null (UI가 분포 평균으로 폴백)
    const onlyNull = addCatch(newState(), mk('crucian', 'normal', null), crucian);
    expect(dexRecord(onlyNull, 'crucian', 'normal')?.maxSize).toBeNull();
  });

  it('개체 판매가·표시 이름은 폼을 따른다 (변이 ×2)', () => {
    expect(priceOfInstance(mk('carp', 'normal'))).toBe(carp.price);
    expect(priceOfInstance(mk('carp', 'variant'))).toBe(carp.price * 2);
    expect(instanceName(mk('carp', 'variant'))).toBe(carp.variant.name);
    const st = addCatch(addCatch(newState(), mk('carp', 'normal'), carp),
      mk('carp', 'variant'), carp);
    expect(bagValue(st)).toBe(carp.price * 3); // 1배 + 2배
  });

  it('makeInstance: 캐치 문맥(언제/어디서/어떻게)이 개체에 새겨진다', () => {
    const extras: CatchExtras = { size: 33, form: 'variant' };
    const inst = makeInstance(carp, extras, {
      uid: 'u-1', now: '2026-08-22T03:00:00.000Z', spot: 'pond', judgment: 'perfect',
    });
    expect(inst).toEqual({
      uid: 'u-1', fishId: 'carp', form: 'variant', size: 33,
      caughtAt: '2026-08-22T03:00:00.000Z', spot: 'pond', judgment: 'perfect', locked: false,
    });
  });

  it('addCatch: 처음 만난 날은 폼별·최초 1회만 기록되고 이후 캐치로 안 바뀐다', () => {
    const first = addCatch(newState(), mk('carp'), carp, '2026-08-21');
    expect(dexRecord(first, 'carp', 'normal')?.first).toBe('2026-08-21');
    expect(dexRecord(first, 'carp', 'variant')).toBeUndefined(); // 변이 폼은 아직
    const again = addCatch(first, mk('carp'), carp, '2026-09-01');
    expect(dexRecord(again, 'carp', 'normal')?.first).toBe('2026-08-21'); // 불변
    const withVariant = addCatch(again, mk('carp', 'variant'), carp, '2026-09-02');
    expect(dexRecord(withVariant, 'carp', 'variant')?.first).toBe('2026-09-02'); // 폼 독립
    expect(dexRecord(withVariant, 'carp', 'normal')?.first).toBe('2026-08-21');
  });
});

describe('R18b: 세이브 마이그레이션', () => {
  // uid 생성기를 주입해 결정적으로 검증 (기본값은 crypto.randomUUID)
  let n = 0;
  const uid = () => `m${++n}`;
  const mig = (raw: unknown) => { n = 0; return migrate(raw, uid); };

  it('v1 세이브(xp/spot 시절): 자산 보존 + 조각배 증정 + 도감에서 명성 소급 + 개체화', () => {
    const legacy = { gold: 777, xp: 340, rod: 5, bag: ['carp'], caught: { carp: 9 }, spot: 'sea' };
    const st = mig(legacy);
    expect(st.v).toBe(8);
    expect(st.gold).toBe(777);
    expect(st.rod).toBe(5);
    expect(st.boat).toBe(1);
    // 구 문자열 엔트리 → 개체. 문맥은 남아 있지 않으므로 "크기 미상"으로 합성한다
    expect(st.bag).toEqual([{
      uid: 'm1', fishId: 'carp', form: 'normal',
      size: null, caughtAt: null, spot: null, judgment: null, locked: false,
    }]);
    expect(dexRecord(st, 'carp', 'normal')).toEqual({ count: 9, maxSize: null, first: null });
    expect(st.fame).toBe(RARITY.rare.fame * 9); // 잡은 만큼 소급 인정 — 데이터 손실 없음
    expect('xp' in st).toBe(false);
  });

  it('computeFame: 도감 → 등급별 명성 합산 (마이그레이션 전용, 없는 어종 id는 무시)', () => {
    expect(computeFame({})).toBe(0);
    expect(computeFame({ crucian: 2, kraken: 1, ghost: 5 }))
      .toBe(RARITY.common.fame * 2 + RARITY.legendary.fame * 1);
  });

  it('명성이 이미 있는 v4 세이브는 소급 계산하지 않고 그대로', () => {
    expect(mig({ v: 4, fame: 42, caught: { kraken: 3 } }).fame).toBe(42);
  });

  it('v7 → v8: 병렬 Record 6개가 dex(종→폼→기록)로 접힌다 — 일반 = 종 합계 − 변이', () => {
    const st = mig({
      v: 7, fame: 5, gold: 0, bag: ['crucian', 'crucian*'], coupons: [], locked: [],
      caught: { crucian: 5, carp: 2 },
      maxSize: { crucian: 21 }, firstCaught: { crucian: '2026-08-01' },
      variantCaught: { crucian: 2 },
      variantMaxSize: { crucian: 30 }, variantFirstCaught: { crucian: '2026-08-10' },
    });
    expect(st.v).toBe(8);
    expect(dexRecord(st, 'crucian', 'normal')).toEqual({ count: 3, maxSize: 21, first: '2026-08-01' });
    expect(dexRecord(st, 'crucian', 'variant')).toEqual({ count: 2, maxSize: 30, first: '2026-08-10' });
    expect(dexRecord(st, 'carp', 'normal')).toEqual({ count: 2, maxSize: null, first: null });
    expect(speciesCount(st, 'crucian')).toBe(5); // 종 합계 무손실
    // 가방 접미사 분해 — 'id*' = 변이 개체
    expect(st.bag.map(i => `${i.fishId}:${i.form}`)).toEqual(['crucian:normal', 'crucian:variant']);
    expect(st.bag.every(i => i.size === null)).toBe(true);
    expect(st.exhibit).toEqual([]);
    for (const k of ['caught', 'maxSize', 'variantCaught', 'variantMaxSize', 'variantFirstCaught']) {
      expect(k in st).toBe(false); // 구 필드 전멸
    }
  });

  it('v7 → v8: 변이 마릿수가 종 합계를 넘는 손상 세이브도 음수 없이 흡수', () => {
    const st = mig({
      v: 7, caught: { carp: 1 }, variantCaught: { carp: 3 }, bag: [], coupons: [], locked: [],
    });
    expect(dexRecord(st, 'carp', 'normal')).toBeUndefined(); // 음수 클램프 → 행 없음
    expect(dexRecord(st, 'carp', 'variant')?.count).toBe(3);
  });

  it('v6 → v8: mutated(발견 여부)가 변이 1마리 기록으로 승격된다', () => {
    const st = mig({
      v: 6, fame: 5, gold: 0, caught: { crucian: 3 }, bag: [], coupons: [], locked: [],
      maxSize: { crucian: 20 }, mutated: { crucian: true, minnow: false }, firstCaught: {},
    });
    expect(dexRecord(st, 'crucian', 'variant')).toEqual({ count: 1, maxSize: null, first: null });
    expect(dexRecord(st, 'crucian', 'normal')).toMatchObject({ count: 2, maxSize: 20 });
    expect('mutated' in st).toBe(false);
  });

  it('구세이브에 없는 신규 필드는 기본값으로 채워진다 — v를 올리지 않는 근거', () => {
    // migrate가 `{...newState(), …}`로 끝나므로 가산 필드는 마이그레이션 스텝 없이 자가 치유된다.
    // 운영이 아직 v7이라 8→9 스텝을 만들면 아무도 안 거치는 링크가 된다.
    const st = mig({ v: 8, gold: 5, bag: [], dex: {}, coupons: [] });
    expect(st.location).toEqual({ kind: 'base', id: 'home' });
    expect(st.visited).toEqual([]);
    expect(st.artifacts).toEqual([]);
    expect(st.gold).toBe(5); // 기존 값은 그대로
  });

  it('손상된 위치는 집으로 수렴한다', () => {
    expect(mig({ v: 8, location: { kind: 'nowhere', id: 3 } }).location)
      .toEqual({ kind: 'base', id: 'home' });
    expect(mig({ v: 8, location: { kind: 'base', id: '?' } }).location)
      .toEqual({ kind: 'base', id: 'home' });
    expect(mig({ v: 8, location: { kind: 'region', id: 'ocean' } }).location)
      .toEqual({ kind: 'region', id: 'ocean' });
  });

  it('모든 거점 위치는 보존된다 — 콜롬보 상점의 구매처 검증에 필요', () => {
    for (const id of ['home', 'harbor', 'manila', 'colombo'] as const) {
      expect(mig({ v: 8, location: { kind: 'base', id } }).location)
        .toEqual({ kind: 'base', id });
    }
  });

  it('v4 → v8: 어종 잠금 목록은 개체 잠금으로 흡수되고 상태에서 사라진다', () => {
    const st = mig({ v: 4, fame: 0, gold: 10, caught: {}, bag: [], coupons: [] });
    expect(st.v).toBe(8);
    expect('locked' in st).toBe(false);
    expect(st.gold).toBe(10);
  });

  it('v7 → v8: 잠갔던 어종의 개체는 잠긴 채로 이관된다', () => {
    const st = mig({ v: 7, caught: { carp: 1, crucian: 1 },
      bag: ['carp', 'crucian'], coupons: [], locked: ['carp'] });
    expect(st.bag.map(i => [i.fishId, i.locked])).toEqual([['carp', true], ['crucian', false]]);
  });

  it('v8 재적용은 무해 (멱등) — 개체 uid도 보존된다', () => {
    const once = mig({ v: 7, caught: { carp: 1 }, bag: ['carp'], coupons: [], locked: [] });
    const twice = mig(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  it('손상된 개체·도감 항목은 버리고 나머지는 살린다', () => {
    const st = mig({
      v: 8, gold: 5, coupons: [], locked: [],
      bag: [null, { form: 'variant' }, { uid: 'keep', fishId: 'carp', form: 'nonsense', size: 'big' }],
      dex: { carp: { normal: { count: 0 } }, crucian: { normal: { count: 2 } }, bad: 3 },
    });
    expect(st.bag).toEqual([{
      uid: 'keep', fishId: 'carp', form: 'normal', // 모르는 폼은 normal로 수렴
      size: null, caughtAt: null, spot: null, judgment: null, locked: false,
    }]);
    expect(st.dex).toEqual({ crucian: { normal: { count: 2, maxSize: null, first: null } } });
  });

  it('미래 폼 키가 붙은 세이브를 열어도 그 기록은 살아남는다 (전방 호환)', () => {
    const st = mig({
      v: 8, gold: 0, coupons: [], locked: [], bag: [],
      dex: { carp: { normal: { count: 1 }, golden: { count: 4, maxSize: 50 } } },
    });
    expect(st.dex.carp).toMatchObject({ golden: { count: 4, maxSize: 50, first: null } });
    expect(speciesCount(st, 'carp')).toBe(5); // 합산도 폼 개수에 무관
  });

  it('손상된 값은 새 게임으로', () => {
    expect(mig(null)).toEqual(newState());
    expect(mig('garbage')).toEqual(newState());
    expect(mig({ gold: 'hax' }).gold).toBe(0);
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

// dev4 — 규칙 판정을 값으로 
describe('규칙 판정 (rules.ts)', () => {
  it('canBuyBoat: 거부 사유 3종을 구분한다 (구 null 반환은 이걸 뭉갰다)', () => {
    expect(canBuyBoat({ ...newState(), boat: MAX_BOAT, gold: 9e9, fame: 9e9 }))
      .toEqual({ ok: false, reason: 'max-boat' });
    expect(canBuyBoat({ ...newState(), boat: 1, gold: BOATS[1].price, fame: 0 }))
      .toEqual({ ok: false, reason: 'not-enough-fame' });
    expect(canBuyBoat({ ...newState(), boat: 1, gold: 0, fame: BOATS[1].fameReq }))
      .toEqual({ ok: false, reason: 'not-enough-gold' });
    expect(canBuyBoat({ ...newState(), gold: BOATS[0].price })).toEqual({ ok: true });
  });

  it('판정과 적용이 일치한다 — tryBuyBoat/tryUpgrade는 can*에 위임한다', () => {
    for (const st of [
      newState(),
      { ...newState(), gold: BOATS[0].price },
      { ...newState(), boat: 1, gold: BOATS[1].price, fame: BOATS[1].fameReq },
    ]) {
      expect(tryBuyBoat(st) !== null).toBe(canBuyBoat(st).ok);
      expect(tryUpgrade(st) !== null).toBe(canUpgradeRod(st).ok);
    }
  });

  it('canFish: 게이트 사유 + 모든 사유에 유저 문구가 있다', () => {
    expect(canFish(newState(), 'pond')).toEqual({ ok: true });
    expect(canFish(newState(), 'deep')).toEqual({ ok: false, reason: 'spot-locked' });
    for (const [reason, text] of Object.entries(REJECT_TEXT)) {
      expect(text, reason).toBeTruthy();
    }
  });
});

describe('아이템 · 미끼 (세이브 v8 접기 — 가산 필드 자가 치유)', () => {
  const mig = (raw: unknown) => migrate(raw);
  const usableOf = (items: Record<string, number>, active: string | null) =>
    usableBait({ items, activeBait: active });

  it('migrate: items/activeBait 부재 → 기본값으로 채워진다 (마이그레이션 스텝 없음)', () => {
    const st = mig({ v: 8, gold: 5, bag: [], dex: {}, coupons: [] });
    expect(st.items).toEqual({});
    expect(st.activeBait).toBeNull();
    expect(st.v).toBe(8); // 버전 접기 — 어느 링크도 새로 생기지 않는다
  });

  it('migrate: 깨진 items 행은 버리고, 모르는 키는 살린다, 0개 행은 접는다', () => {
    const st = mig({
      v: 8,
      items: { 'bait-common': 2, junk: -1, broken: 1.5, huge: 1e7, 'future-item': 0 },
    } as never);
    expect(st.items).toEqual({ 'bait-common': 2 }); // future-item(모르는 id)은 살아야 하지만 0이라 접힘
  });

  it('migrate: activeBait는 레지스트리에 있는 id만 살린다 — 보유량 검증은 하지 않는다', () => {
    expect(mig({ v: 8, activeBait: 'hax' }).activeBait).toBeNull();
    expect(mig({ v: 8, activeBait: 'bait-epic', items: {} }).activeBait).toBe('bait-epic');
    expect(mig({ v: 8, activeBait: 42 }).activeBait).toBeNull(); // 문자열만 유효
  });

  it('addItem/takeItem — 적립·정확히 1개 차감·하한 방어. 소진돼도 활성 유지', () => {
    let st = newState();
    st = addItem(st, 'bait-common', 3);
    expect(st.items['bait-common']).toBe(3);
    expect(addItem(st, 'bait-common', 0)).toBe(st); // 무효 수량은 무변환
    st = takeItem(st, 'bait-common');
    st = takeItem(st, 'bait-common');
    st = takeItem(st, 'bait-common');
    expect(st.items['bait-common']).toBeUndefined(); // 0은 아예 기록하지 않는다
    expect(takeItem(st, 'bait-common')).toBe(st);     // 더 떨어뜨리지 않는다
    expect(usableOf(st.items, 'bait-common')).toBeUndefined(); // 효과 무음
  });

  it('usableBait — 보유량 > 0인 유효 미끼만 행을 돌려준다 (오버레이·리듀서 단일 출처)', () => {
    expect(usableOf({}, null)).toBeUndefined();
    expect(usableOf({}, 'bait-rare')).toBeUndefined();
    expect(usableOf({ 'bait-legendary': 1 }, 'bait-legendary')?.targetRarity).toBe('legendary');
  });

  it('미끼 효과 = 등급 예산 ×2 — 등급 실질확률이 정확히 상승하고 타 등급은 비례 감소한다', () => {
    // 대상: 잉어(rare). base 예산 합 T, baited 합 T+W → pct(W)=W/T vs pct'=2W/(T+W)
    for (const spotId of ['pond', 'sea', 'barrierreef'] as const) { // 오버라이드 수역 포함
      const pool = FISH.filter(f => f.spot === spotId);
      const rareBaitTarget = pool.some(f => f.rarity === 'rare') ? 'rare' : 'common';
      const W = rarityWeightOf(spotId, rareBaitTarget);
      const present = new Set(pool.map(f => f.rarity));
      const baseTotal = RARITY_ORDER.reduce(
        (s, r) => s + (present.has(r) ? rarityWeightOf(spotId, r) : 0), 0);
      const baseRows = drawRows(spotId);
      const baitedRows = drawRows(spotId, { budgets: { [rareBaitTarget]: W * 2 } });

      const basePct = baseRows.find(r => r.fish.rarity === rareBaitTarget)?.gradePct ?? 0;
      const baitedPct = baitedRows.find(r => r.fish.rarity === rareBaitTarget)?.gradePct ?? 0;
      expect(baitedPct).toBeCloseTo((W * 2) / (baseTotal + W) * 100, 6);   // 목표 등급 상승
      expect(basePct).toBeCloseTo(W / baseTotal * 100, 6);

      // 타 등급 개체는 같은 요소로 균등 축소 (상대 순위 불변)
      for (const row of baitedRows.filter(r => r.fish.rarity !== rareBaitTarget)) {
        const bRow = baseRows.find(b => b.fish.id === row.fish.id)!;
        expect(row.fishPct / bRow.fishPct).toBeCloseTo(baseTotal / (baseTotal + W), 6);
      }
    }
  });
});
