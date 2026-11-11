import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import { entryLevel, rng } from '../model';
import { NO_EFFECT, dexTimes, effectRates } from './effects';
import type { Effect } from './effects';
import { axisOf } from './progress';
import { VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { capOfBoat } from '../../../src/game/rules/logic';
import {
  BAIT_EFFECTS, BAIT_WINDOW_MIN, LUNCH_HOURS, RECIPES, baitEffect, bagSupplyRows, evictionRanks, fillBag, recipeRows, recipesCovered, windowRows,
} from './cooking';
import type { Recipe } from './cooking';

const fx = (e: Partial<Effect>): Effect => ({ ...NO_EFFECT, ...e });
const last = SPOTS[SPOTS.length - 1].id;

describe('구매 미끼 효과', () => {
  it('희귀 이상 +20%, 영웅 이상 +40%, 전설 +60%이고 창은 30분이다', () => {
    expect(BAIT_EFFECTS).toEqual({ rare: fx({ rare: 0.2 }), epic: fx({ epic: 0.4 }), legendary: fx({ legendary: 0.6 }) });
    expect(BAIT_WINDOW_MIN).toBe(30);
    expect(baitEffect('epic')).toEqual(fx({ epic: 0.4 }));
  });

  it('모르는 미끼 이름은 오류다', () => {
    expect(() => baitEffect('common')).toThrow(/미끼/);
  });
});

describe('도감 완성의 앞 구간 효과', () => {
  const rows = effectRates(last, entryLevel(last), 'good', NO_EFFECT);
  const boosted = effectRates(last, entryLevel(last), 'good', fx({ legendary: 0.6, epic: 0.4 }));

  it('구간이 0분이면 구간이 없는 것과 같다', () => {
    const plain = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 20, rng(3));
    const zero = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 20, rng(3), {
      minutes: 0, rows: boosted.rows, share: boosted.variantShare, catchesPerHour: boosted.catchesPerHour,
    });
    expect(zero).toEqual(plain);
  });

  it('구간이 끝날 때까지 이어지면 그 효과만으로 낚은 것과 같다', () => {
    const win = { minutes: 1e6, rows: boosted.rows, share: boosted.variantShare, catchesPerHour: 60 };
    const full = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 20, rng(4), win);
    const only = dexTimes(boosted.rows, boosted.variantShare, 60, 20, rng(4));
    expect(full).toEqual(only);
  });

  it('등급 가중 구간은 그 등급 도감 완성 시간을 줄인다', () => {
    const win = { minutes: 30, rows: boosted.rows, share: boosted.variantShare, catchesPerHour: boosted.catchesPerHour };
    const base = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 200, rng(5));
    const withWin = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 200, rng(5), win);
    expect(withWin.legendary!.mean!).toBeLessThan(base.legendary!.mean!);
    expect(withWin.epic!.mean!).toBeLessThan(base.epic!.mean!);
  });

  it('같은 시드는 같은 결과다', () => {
    const win = { minutes: 30, rows: boosted.rows, share: boosted.variantShare, catchesPerHour: boosted.catchesPerHour };
    const a = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 10, rng(6), win);
    expect(a).toEqual(dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 10, rng(6), win));
  });
});

describe('시간 제한 효과 창', () => {
  const opts = { axis: 'manual' as const, effect: BAIT_EFFECTS.epic, margin: 0, minutes: 30, trials: 20, seed: 7 };

  it('창 안의 등급별 기대 캐치 수는 캐치 속도 × 창 길이 × 등급 비율이다', () => {
    for (const r of windowRows(opts)) {
      const axis = axisOf('manual', r.spot, r.level);
      const base = effectRates(r.spot, r.level, axis, NO_EFFECT), now = effectRates(r.spot, r.level, axis, opts.effect);
      for (const g of RARITY_ORDER) {
        expect(r.catches[g].base).toBeCloseTo((base.rarity[g] ?? 0) * base.catchesPerHour / 2, 9);
        expect(r.catches[g].with).toBeCloseTo((now.rarity[g] ?? 0) * now.catchesPerHour / 2, 9);
      }
      expect(r.totalBase).toBeCloseTo(base.catchesPerHour / 2, 9);
    }
  });

  it('창 안의 골드와 명성 증가는 시간당 차이 × 창 길이다', () => {
    for (const r of windowRows({ ...opts, minutes: 45 })) {
      const axis = axisOf('manual', r.spot, r.level);
      const base = effectRates(r.spot, r.level, axis, NO_EFFECT), now = effectRates(r.spot, r.level, axis, opts.effect);
      expect(r.goldGain).toBeCloseTo((now.goldPerHour - base.goldPerHour) * 0.75, 6);
      expect(r.fameGain).toBeCloseTo((now.famePerHour - base.famePerHour) * 0.75, 6);
    }
  });

  it('효과 없음이면 증가와 도감 단축이 0에 가깝고 캐치 수가 같다', () => {
    for (const r of windowRows({ ...opts, effect: NO_EFFECT })) {
      expect(r.goldGain).toBeCloseTo(0, 9);
      for (const g of RARITY_ORDER) expect(r.catches[g].with).toBeCloseTo(r.catches[g].base, 12);
    }
  });

  it('도감 단축은 효과 없이 낚는 도감 완성 시간에서 창 하나를 쓴 시간을 뺀 값이고 시드가 같으면 같다', () => {
    const a = windowRows(opts), b = windowRows(opts);
    expect(a).toEqual(b);
    for (const r of a) for (const k of ['epic', 'legendary'] as const) {
      const base = r.dex.base[k], w = r.dex.with[k];
      if (base?.mean != null && w?.mean != null) expect(r.saved[k]).toBeCloseTo(base.mean - w.mean, 12);
      else expect(r.saved[k]).toBeNull();
    }
  });

  it('창 길이와 시도 횟수가 잘못되면 오류다', () => {
    expect(() => windowRows({ ...opts, minutes: 0 })).toThrow(/분/);
    expect(() => windowRows({ ...opts, minutes: -5 })).toThrow(/분/);
    expect(() => windowRows({ ...opts, trials: 0 })).toThrow(/시도/);
  });

  it('음수 여유는 레벨 1 미만 해역을 건너뛴다', () => {
    const ids = windowRows({ ...opts, margin: -4 }).map(r => r.spot);
    expect(ids).not.toContain('pond');
    expect(ids).toContain(last);
  });
});

describe('레시피 표', () => {
  const byId = (id: string) => RECIPES.find(r => r.id === id)!;

  it('도시락은 9시간 방치, 미끼 요리는 30분 수동이다', () => {
    expect(LUNCH_HOURS).toBe(9);
    for (const r of RECIPES) {
      expect(r.hours).toBe(r.kind === 'lunch' ? 9 : 0.5);
      expect(r.axis).toBe(r.kind === 'lunch' ? 'idle' : 'manual');
    }
  });

  it('기운 요구와 효과가 설계 초안과 같다', () => {
    expect(byId('quick').cost).toEqual({ common: 200 });
    expect(byId('quick').effect).toEqual(fx({ bite: 0.1 }));
    expect(byId('shimmer').cost).toEqual({ common: 100, rare: 20 });
    expect(byId('shimmer').effect).toEqual(fx({ rare: 0.1 }));
    expect(byId('mutant').cost).toEqual({ rare: 20, epic: 4 });
    expect(byId('mutant').effect).toEqual(fx({ variant: 0.5 }));
    expect(byId('trace').cost).toEqual({ epic: 8 });
    expect(byId('trace').effect).toEqual(fx({ named: 0.5 }));
    expect(byId('mixed').cost).toEqual({ common: 50, rare: 5, epic: 1, legendary: 1 });
    expect(byId('mixed').effect).toEqual(fx({ bite: 0.05, rare: 0.05 }));
    expect(byId('mutantBait').cost).toEqual({ epic: 4, legendary: 2 });
    expect(byId('mutantBait').effect).toEqual(fx({ variant: 1 }));
  });
});

describe('레시피 순손익', () => {
  const quick = RECIPES.find(r => r.id === 'quick')!, mixed = RECIPES.find(r => r.id === 'mixed')!;

  it('재료로 쓴 물고기의 판매 손실은 등급별 개수 x 그 등급의 평균 판매가(돌연변이 기댓값 포함)다', () => {
    for (const r of recipeRows({ axis: 'idle', margin: 0, recipes: [quick] })) {
      const base = effectRates(r.spot, r.level, 'idle', NO_EFFECT);
      const rows = base.rows.filter(x => x.fish.rarity === 'common');
      const avg = rows.reduce((a, x) => a + x.prob * x.fish.price, 0) / rows.reduce((a, x) => a + x.prob, 0);
      const ev = 1 + base.variantShare * (VARIANT_PRICE_MULT - 1);
      expect(r.loss).toBeCloseTo(200 * avg * ev, 6);
    }
  });

  it('효과 지속 동안의 수입 증가는 그 낚시 방식의 시간당 골드 차이 x 지속이다', () => {
    for (const r of recipeRows({ axis: 'idle', margin: 0, recipes: [quick] })) {
      const base = effectRates(r.spot, r.level, 'idle', NO_EFFECT), now = effectRates(r.spot, r.level, 'idle', quick.effect);
      expect(r.gain).toBeCloseTo((now.goldPerHour - base.goldPerHour) * 9, 6);
      expect(r.net).toBeCloseTo(r.gain - r.loss, 6);
    }
  });

  it('재료를 모으는 시간은 필요한 등급 중 가장 느리게 모이는 등급이 정한다', () => {
    for (const r of recipeRows({ axis: 'idle', margin: 0, recipes: [mixed] })) {
      const base = effectRates(r.spot, r.level, 'idle', NO_EFFECT);
      const perHour = (g: 'common' | 'rare' | 'epic' | 'legendary') => (base.rarity[g] ?? 0) * base.catchesPerHour;
      const need = mixed.cost;
      if (perHour('legendary') === 0 || perHour('epic') === 0) { expect(r.collectHours).toBeNull(); expect(r.net).toBeNull(); continue; }
      const expected = Math.max(...(Object.keys(need) as (keyof typeof need)[]).map(g => need[g]! / perHour(g)));
      expect(r.collectHours).toBeCloseTo(expected, 9);
    }
  });

  it('필요한 등급이 나오지 않는 해역은 모을 수 없다고 낸다', () => {
    const rows = recipeRows({ axis: 'idle', margin: 0, recipes: [mixed] });
    expect(rows.some(r => r.collectHours === null)).toBe(true);
    for (const r of rows.filter(x => x.collectHours === null)) { expect(r.net).toBeNull(); expect(r.ratio).toBeNull(); }
  });

  it('레시피마다 모든 해역을 한 줄씩 내고 음수 여유는 레벨 1 미만 해역을 건너뛴다', () => {
    expect(recipeRows({ axis: 'idle', margin: 0, recipes: [quick] }).length).toBe(SPOTS.length);
    expect(recipeRows({ axis: 'idle', margin: -4, recipes: [quick] }).map(r => r.spot)).not.toContain('pond');
    expect(recipeRows({ axis: 'idle', margin: 0 }).length).toBe(SPOTS.length * RECIPES.length);
  });

  it('미끼 요리는 수동 축으로 30분 수입 증가를 센다', () => {
    const bait = RECIPES.find(r => r.id === 'mutantBait') as Recipe;
    const r = recipeRows({ axis: 'idle', margin: 0, recipes: [bait] }).find(x => x.spot === last)!;
    const level = entryLevel(last), axis = axisOf('manual', last, level);
    const base = effectRates(last, level, axis, NO_EFFECT), now = effectRates(last, level, axis, bait.effect);
    expect(r.gain).toBeCloseTo((now.goldPerHour - base.goldPerHour) * 0.5, 6);
  });
});

describe('가방 한도와 자동 기운 얻기', () => {
  const c = (grade: 'common' | 'rare' | 'epic' | 'legendary', price: number, variant = false) => ({ grade, variant, price });

  it('내보내는 순서는 등급이 낮은 쪽이 먼저이고 같은 등급은 일반 폼이 먼저다', () => {
    const ranks = evictionRanks();
    expect(ranks.length).toBe(RARITY_ORDER.length * 2);
    expect(ranks[0]).toEqual({ grade: 'common', variant: false });
    expect(ranks[1]).toEqual({ grade: 'common', variant: true });
    expect(ranks[ranks.length - 1]).toEqual({ grade: 'legendary', variant: true });
  });

  it('상한 안에서는 아무것도 내보내지 않는다', () => {
    const r = fillBag([c('common', 1), c('epic', 9)], 2);
    expect(r.auto.common + r.auto.rare + r.auto.epic + r.auto.legendary).toBe(0);
    expect(r.kept.epic).toBe(1);
  });

  it('가방이 차면 가장 안 특별한 개체부터 기운이 되고 새 개체도 후보에 든다', () => {
    const r = fillBag([c('epic', 100), c('common', 1), c('rare', 10), c('common', 2), c('legendary', 1000)], 2);
    expect(r.auto).toEqual({ common: 2, rare: 1, epic: 0, legendary: 0 });
    expect(r.kept).toEqual({ common: 0, rare: 0, epic: 1, legendary: 1 });
    expect(r.autoGold).toBeCloseTo(1 + 2 + 10, 9);
    expect(r.keptGold).toBeCloseTo(1100, 9);
  });

  it('같은 등급에서는 돌연변이 개체를 더 오래 지킨다', () => {
    const r = fillBag([c('rare', 10, true), c('rare', 4), c('rare', 5)], 2);
    expect(r.auto.rare).toBe(1);
    expect(r.autoGold).toBeCloseTo(4.5, 9);
  });

  it('상한이 0이면 모두 내보낸다', () => {
    expect(fillBag([c('rare', 5, true)], 0).auto.rare).toBe(1);
  });

  it('해역별 가방은 배 단계의 용량이고 낚은 수와 보관 수, 내보낸 수가 맞는다', () => {
    const rows = bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 4, seed: 11 });
    for (const r of rows) {
      const spot = SPOTS.find(s => s.id === r.spot)!;
      expect(r.cap).toBe(capOfBoat(spot.boatTier));
      const sum = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0);
      expect(sum(r.kept)).toBeCloseTo(Math.min(r.cap, r.catches), 9);
      expect(sum(r.auto)).toBeCloseTo(Math.max(0, r.catches - r.cap), 9);
    }
  });

  it('같은 시드는 같은 결과이고 시도 횟수와 시간이 잘못되면 오류다', () => {
    const a = bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 3, seed: 2 });
    expect(a).toEqual(bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 3, seed: 2 }));
    expect(() => bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 0, seed: 2 })).toThrow(/시도/);
    expect(() => bagSupplyRows({ axis: 'idle', margin: 0, hours: 0, trials: 2, seed: 2 })).toThrow(/시간/);
  });

  it('자동으로 모인 기운으로 만들 수 있는 개수는 가장 모자란 등급이 정한다', () => {
    const q = RECIPES.find(r => r.id === 'quick')!, m = RECIPES.find(r => r.id === 'mixed')!;
    const auto = { common: 400, rare: 10, epic: 2, legendary: 0.5 };
    expect(recipesCovered(auto, q)).toBeCloseTo(2, 12);
    expect(recipesCovered(auto, m)).toBeCloseTo(0.5, 12);
    expect(recipesCovered(auto, { ...q, cost: {} })).toBe(Number.POSITIVE_INFINITY);
  });
});
