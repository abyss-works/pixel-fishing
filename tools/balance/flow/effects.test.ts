import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import { BOUNTIES } from '../../../src/game/content/bounties';
import { CATCH_MS, VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { variantBoostOf } from '../../../src/game/rules/artifactLevel';
import { mutationWeightsOf, namedEncounterCandidates, variantShare } from '../../../src/game/rules/logic';
import { entryLevel, meanCycleSec, rates, rng } from '../model';
import type { Row } from '../model';
import { FISH } from '../../../src/game/content/fish';
import { axisOf } from './progress';
import {
  DEFAULT_UNITS, NO_EFFECT, checkEffect, dexRows, dexTimes, effectRates, incomeRows, supplyRows, variantShareOf,
} from './effects';
import type { Effect, TripTime } from './effects';

const fx = (e: Partial<Effect>): Effect => ({ ...NO_EFFECT, ...e });
const lastSpot = SPOTS[SPOTS.length - 1].id;
const levelOf = (s: SpotId) => entryLevel(s);

describe('효과 없음', () => {
  it('측정 모델의 수입과 같다', () => {
    for (const s of SPOTS) {
      for (const axis of ['idle', 'good'] as const) {
        const level = levelOf(s.id);
        const a = effectRates(s.id, level, axis, NO_EFFECT), b = rates(s.id, level, axis);
        expect(a.goldPerHour).toBeCloseTo(b.goldPerHour, 6);
        expect(a.famePerHour).toBeCloseTo(b.famePerHour, 6);
        expect(a.catchesPerHour).toBeCloseTo(b.catchesPerHour, 9);
      }
    }
  });

  it('수입 변화는 모두 0이다', () => {
    for (const r of incomeRows({ axis: 'idle', effect: NO_EFFECT, margin: 0 })) {
      expect(r.goldChange).toBeCloseTo(0, 12);
      expect(r.fameChange).toBeCloseTo(0, 12);
      if (r.named) expect(r.named.hoursWith).toBeCloseTo(r.named.hoursBase, 9);
    }
  });
});

describe('매개변수 검사', () => {
  it('범위를 벗어난 값을 거부한다', () => {
    expect(() => checkEffect(fx({ bite: 1 }))).toThrow(/입질/);
    expect(() => checkEffect(fx({ bite: -0.1 }))).toThrow(/입질/);
    expect(() => checkEffect(fx({ rare: -0.1 }))).toThrow(/희귀/);
    expect(() => checkEffect(fx({ variant: -0.1 }))).toThrow(/돌연변이/);
    expect(() => checkEffect(fx({ size: -1 }))).toThrow(/크기/);
    expect(() => checkEffect(fx({ move: -1 }))).toThrow(/이동/);
    expect(() => checkEffect(fx({ named: -0.5 }))).toThrow(/네임드/);
    expect(() => incomeRows({ axis: 'idle', effect: fx({ bite: 2 }), margin: 0 })).toThrow(/입질/);
  });
});

describe('입질 대기 단축', () => {
  it('캐치 주기의 대기 부분만 줄고 확률은 그대로라 시간당 수입이 캐치 속도 비로 늘어난다', () => {
    const level = levelOf(lastSpot);
    const base = effectRates(lastSpot, level, 'idle', NO_EFFECT), now = effectRates(lastSpot, level, 'idle', fx({ bite: 0.2 }));
    const c = base.cycle;
    const expected = (c.biteMin + c.biteMax) / 2 * 0.8 + c.biteExtra * 0.8 + c.reaction + CATCH_MS / 1000;
    expect(meanCycleSec(now.cycle)).toBeCloseTo(expected, 9);
    expect(now.catchesPerHour / base.catchesPerHour).toBeCloseTo(meanCycleSec(base.cycle) / meanCycleSec(now.cycle), 9);
    expect(now.goldPerHour / base.goldPerHour).toBeCloseTo(now.catchesPerHour / base.catchesPerHour, 9);
    expect(now.rows.map(r => r.prob)).toEqual(base.rows.map(r => r.prob));
  });
});

describe('희귀 이상 가중', () => {
  it('희귀 이상 등급 비율이 늘고 일반 비율이 줄며 수입이 는다', () => {
    for (const s of SPOTS) {
      const level = levelOf(s.id);
      const base = effectRates(s.id, level, 'idle', NO_EFFECT), now = effectRates(s.id, level, 'idle', fx({ rare: 0.1 }));
      const up = (r: typeof base) => 1 - (r.rarity.common ?? 0);
      expect(up(now)).toBeGreaterThanOrEqual(up(base));
      expect(now.goldPerHour).toBeGreaterThanOrEqual(base.goldPerHour - 1e-9);
      expect(now.rows.reduce((a, r) => a + r.prob, 0)).toBeCloseTo(1, 9);
    }
  });

  it('일반 등급의 가중치는 그대로이고 희귀 이상에만 (1 + 효과)가 곱해진다', () => {
    // 같은 해역에서 두 등급의 확률 비가 (1 + 효과) 배로 바뀐다
    const s = lastSpot, level = levelOf(s);
    const base = effectRates(s, level, 'idle', NO_EFFECT), now = effectRates(s, level, 'idle', fx({ rare: 0.5 }));
    const grades = RARITY_ORDER.filter(g => (base.rarity[g] ?? 0) > 0);
    expect(grades).toContain('common');
    const higher = grades.find(g => g !== 'common')!;
    const ratio = (r: typeof base) => r.rarity[higher] / r.rarity.common;
    expect(ratio(now) / ratio(base)).toBeCloseTo(1.5, 9);
  });
});

describe('돌연변이 가중치 증가', () => {
  it('제품의 폼 가중치와 같은 경로다: 돌연변이 가중치를 올리는 유물의 폼 가중치와 같은 확률을 낸다', () => {
    const holder = { artifacts: ['elder-scale'] };
    const boost = variantBoostOf(holder);
    expect(boost).toBeGreaterThan(0);
    for (const s of SPOTS) expect(variantShareOf(s.id, boost)).toBeCloseTo(variantShare(mutationWeightsOf(holder, s.id)), 12);
  });

  it('증가가 없으면 제품의 해역 폼 가중치와 같다', () => {
    for (const s of SPOTS) expect(variantShareOf(s.id, 0)).toBeCloseTo(variantShare(mutationWeightsOf({ artifacts: [] }, s.id)), 12);
  });

  it('판매가 기댓값만 달라지고 명성과 캐치 속도는 그대로다', () => {
    const level = levelOf(lastSpot);
    const base = effectRates(lastSpot, level, 'idle', NO_EFFECT), now = effectRates(lastSpot, level, 'idle', fx({ variant: 1 }));
    const ev = (share: number) => 1 + share * (VARIANT_PRICE_MULT - 1);
    expect(now.variantShare).toBeGreaterThan(base.variantShare);
    expect(now.goldPerHour / base.goldPerHour).toBeCloseTo(ev(now.variantShare) / ev(base.variantShare), 9);
    expect(now.famePerHour).toBeCloseTo(base.famePerHour, 9);
    expect(now.catchesPerHour).toBeCloseTo(base.catchesPerHour, 9);
  });

  it('가중치 증가가 커도 확률은 1을 넘지 않는다', () => {
    expect(effectRates(lastSpot, levelOf(lastSpot), 'idle', fx({ variant: 1e6 })).variantShare).toBeLessThan(1);
  });
});

describe('크기 증가와 이동 속도와 네임드 조우', () => {
  it('크기 증가는 수입과 재료를 바꾸지 않는다', () => {
    const rows = incomeRows({ axis: 'idle', effect: fx({ size: 2 }), margin: 0 });
    for (const r of rows) expect(r.goldChange).toBeCloseTo(0, 12);
    for (const r of supplyRows({ axis: 'idle', effect: fx({ size: 2 }), margin: 0, units: DEFAULT_UNITS })) expect(r.scoreWith).toBeCloseTo(r.score, 9);
  });

  it('이동 속도는 낚시 시간당 수입을 바꾸지 않고 판매 왕복을 넣은 수입만 늘린다', () => {
    const trips = new Map<SpotId, TripTime>(SPOTS.map(s => [s.id, { bagCap: 10, tripSec: 120 }]));
    const rows = incomeRows({ axis: 'idle', effect: fx({ move: 0.5 }), margin: 0, trips });
    for (const r of rows) {
      expect(r.goldChange).toBeCloseTo(0, 12);
      const fill = 10 / effectRates(r.spot, r.level, 'idle', NO_EFFECT).catchesPerHour * 3600;
      expect(r.tripChange).toBeCloseTo((fill / (fill + 80)) / (fill / (fill + 120)) - 1, 9);
    }
    expect(incomeRows({ axis: 'idle', effect: fx({ move: 0.5 }), margin: 0 })[0].tripChange).toBeNull();
  });

  it('이동 속도가 0이어도 입질 대기 단축은 가방 채움 시간을 줄여 왕복을 넣은 수입 변화를 낸다', () => {
    const trips = new Map<SpotId, TripTime>(SPOTS.map(s => [s.id, { bagCap: 10, tripSec: 120 }]));
    const [a] = incomeRows({ axis: 'idle', effect: fx({ bite: 0.2 }), margin: 0, trips });
    expect(a.tripChange!).toBeGreaterThan(0);
    expect(a.tripChange!).toBeLessThan(a.goldChange);
    for (const r of incomeRows({ axis: 'idle', effect: NO_EFFECT, margin: 0, trips })) expect(r.tripChange).toBeCloseTo(0, 12);
  });

  it('가방 채움 시간은 낚싯대 레벨과 낚시 방식의 캐치 속도로 계산한다', () => {
    const trips = new Map<SpotId, TripTime>(SPOTS.map(s => [s.id, { bagCap: 10, tripSec: 120 }]));
    const at = (margin: number) => incomeRows({ axis: 'idle', effect: fx({ move: 0.5 }), margin, trips })[0].tripChange!;
    expect(at(4)).not.toBeCloseTo(at(0), 6);
  });

  it('네임드 조우는 제품 규칙대로 네임드 의뢰가 있고 출현 해역이 맞는 해역만 낸다', () => {
    const ids = BOUNTIES.filter(q => q.difficulty === 'named').map(q => q.id);
    const rows = incomeRows({ axis: 'idle', effect: fx({ named: 0.5 }), margin: 0 });
    expect(rows.some(r => r.named === null)).toBe(true);
    expect(rows.some(r => r.named !== null)).toBe(true);
    for (const r of rows) {
      expect(r.goldChange).toBeCloseTo(0, 12);
      expect(r.named !== null).toBe(namedEncounterCandidates(ids, r.spot).length > 0);
      if (r.named) {
        expect(r.named.shareWith).toBeGreaterThan(r.named.shareBase);
        expect(r.named.hoursWith).toBeLessThan(r.named.hoursBase);
      }
    }
  });
});

describe('수동 축', () => {
  it('수동은 GOOD 판정 축(없으면 무판정)으로 잰다', () => {
    const rows = incomeRows({ axis: 'manual', effect: fx({ bite: 0.1 }), margin: 0 });
    for (const r of rows) {
      const axis = axisOf('manual', r.spot, r.level);
      expect(r.goldBase).toBeCloseTo(rates(r.spot, r.level, axis).goldPerHour, 6);
    }
  });
});

describe('도감 완성 시간 몬테카를로', () => {
  const fish = (id: string, rarity: 'common' | 'legendary'): Row => ({ fish: { ...FISH[0], id, rarity }, prob: 0 });
  const two = (a: number, b: number): Row[] => [{ ...fish('a', 'common'), prob: a }, { ...fish('b', 'legendary'), prob: b }];

  it('두 어종이 반반이면 일반 폼 전부의 평균이 쿠폰 수집 기댓값 3캐치다', () => {
    const t = dexTimes(two(0.5, 0.5), 0, 3600, 4000, rng(1));
    expect(t.all!.mean! * 3600).toBeCloseTo(3, 0);
    expect(t.noLegend!.mean! * 3600).toBeCloseTo(2, 0);
  });

  it('돌연변이가 없으면 돌연변이 도감은 끝나지 않고, 전부 돌연변이면 일반 도감이 끝나지 않는다', () => {
    expect(dexTimes(two(0.5, 0.5), 0, 3600, 20, rng(1)).variant).toBeNull();
    const all = dexTimes(two(0.5, 0.5), 1, 3600, 20, rng(1));
    expect(all.all).toBeNull();
    expect(all.variant).not.toBeNull();
  });

  it('같은 시드는 같은 결과, 다른 시드는 다른 결과를 낸다', () => {
    const a = dexTimes(two(0.9, 0.1), 0.25, 3600, 200, rng(5)), b = dexTimes(two(0.9, 0.1), 0.25, 3600, 200, rng(5));
    expect(a).toEqual(b);
    expect(dexTimes(two(0.9, 0.1), 0.25, 3600, 200, rng(6)).all!.mean).not.toBe(a.all!.mean);
  });

  it('확률이 0인 어종이 있으면 끝나지 않은 시도로 센다', () => {
    const t = dexTimes(two(1, 0), 0.25, 3600, 10, rng(1));
    expect(t.all).toBeNull();
    expect(t.noLegend).toBeNull();
  });

  it('빈 풀이면 끝난 시도가 없다', () => {
    expect(dexTimes([], 0.25, 3600, 10, rng(1)).all).toBeNull();
  });

  it('입질 대기 단축은 같은 시드에서 완성 시간을 캐치 속도 비로 줄인다', () => {
    const rows = dexRows({ axis: 'idle', effect: fx({ bite: 0.2 }), margin: 0, trials: 20, seed: 7 });
    expect(rows).toHaveLength(SPOTS.length);
    for (const r of rows) {
      const level = r.level;
      const ratio = effectRates(r.spot, level, 'idle', fx({ bite: 0.2 })).catchesPerHour / effectRates(r.spot, level, 'idle', NO_EFFECT).catchesPerHour;
      expect(r.with.all!.mean! * ratio).toBeCloseTo(r.base.all!.mean!, 9);
    }
  });

  it('크기 증가는 도감 완성 시간을 바꾸지 않는다', () => {
    for (const r of dexRows({ axis: 'idle', effect: fx({ size: 1 }), margin: 0, trials: 10, seed: 7 })) expect(r.with).toEqual(r.base);
  });

  it('돌연변이 가중치 증가는 돌연변이 도감 시간을 줄인다', () => {
    const rows = dexRows({ axis: 'idle', effect: fx({ variant: 1 }), margin: 0, trials: 40, seed: 7 });
    const faster = rows.filter(r => r.with.variant!.mean! < r.base.variant!.mean!).length;
    expect(faster).toBeGreaterThan(rows.length / 2);
  });

  it('시도 횟수가 1보다 작으면 거부한다', () => {
    expect(() => dexRows({ axis: 'idle', effect: NO_EFFECT, margin: 0, trials: 0, seed: 1 })).toThrow(/1 이상/);
  });
});

describe('분해 재료 공급', () => {
  it('등급별 개수의 합이 시간당 캐치 수이고 점수는 단위를 곱한 합이다', () => {
    for (const r of supplyRows({ axis: 'idle', effect: NO_EFFECT, margin: 0, units: DEFAULT_UNITS })) {
      const cph = rates(r.spot, r.level, 'idle').catchesPerHour;
      expect(RARITY_ORDER.reduce((s, g) => s + r.counts[g], 0)).toBeCloseTo(cph, 9);
      expect(r.score).toBeCloseTo(r.counts.common + 5 * r.counts.rare + 25 * r.counts.epic + 125 * r.counts.legendary, 9);
      expect(r.gold).toBeCloseTo(rates(r.spot, r.level, 'idle').goldPerHour, 6);
      expect(r.scoreWith).toBeCloseTo(r.score, 9);
    }
  });

  it('단위를 바꾸면 점수가 바뀐다', () => {
    const [a] = supplyRows({ axis: 'idle', effect: NO_EFFECT, margin: 0, units: DEFAULT_UNITS });
    const [b] = supplyRows({ axis: 'idle', effect: NO_EFFECT, margin: 0, units: { common: 2, rare: 2, epic: 2, legendary: 2 } });
    expect(b.score).toBeCloseTo(2 * RARITY_ORDER.reduce((s, g) => s + a.counts[g], 0), 9);
  });

  it('희귀 이상 가중은 점수를 늘린다', () => {
    for (const r of supplyRows({ axis: 'idle', effect: fx({ rare: 0.1 }), margin: 0, units: DEFAULT_UNITS })) {
      expect(r.scoreWith).toBeGreaterThanOrEqual(r.score - 1e-9);
    }
  });

  it('여유 레벨을 주면 그 레벨로 잰다', () => {
    const [a] = supplyRows({ axis: 'idle', effect: NO_EFFECT, margin: 4, units: DEFAULT_UNITS });
    expect(a.level).toBe(entryLevel(SPOTS[0].id) + 4);
  });
});
