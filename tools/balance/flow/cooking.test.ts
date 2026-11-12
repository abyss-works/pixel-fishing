import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import { entryLevel, rng } from '../model';
import { NO_EFFECT, dexTimes, effectRates } from './effects';
import type { Effect } from './effects';
import { axisOf } from './progress';
import { COOKING_UNLOCK_BOAT, COOK_KIND_RULES, ENERGY_PER_INDIVIDUAL, ENERGY_UNIT, RECIPES as COOK_RECIPES } from '../../../src/game/content/cooking';
import { NO_COOK_EFFECTS, energyDefaultExcluded } from '../../../src/game/rules/cooking';
import type { ActiveCookEffects } from '../../../src/game/rules/cooking';
import { FISH } from '../../../src/game/content/fish';
import { VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { canFishSpot, capOfBoat, compareBlandness, newState, priceOf } from '../../../src/game/rules/logic';
import {
  BAIT_EFFECTS, BAIT_WINDOW_MIN, LUNCH_HOURS, RECIPES, baitEffect, bagSupplyRows, effectOf, effectOfRecipe, evictionOrder, fillBag, materialLossFor, recipeRows, recipesCovered, windowRows,
} from './cooking';

const fx = (e: Partial<Effect>): Effect => ({ ...NO_EFFECT, ...e });
const last = SPOTS[SPOTS.length - 1].id;
const recipeBy = (id: string) => RECIPES.find(r => r.id === id)!;
const bonusOf = (id: string) => COOK_RECIPES.find(r => r.id === id)!.effects.rarityWeight!.bonus;

describe('등급 미끼 효과', () => {
  it('요리 콘텐츠의 등급 미끼 레시피 값과 같고 창은 미끼 슬롯 지속이다', () => {
    expect(BAIT_EFFECTS).toEqual({
      rare: fx({ rare: bonusOf('cook-bait-rare') }), epic: fx({ epic: bonusOf('cook-bait-epic') }), legendary: fx({ legendary: bonusOf('cook-bait-legendary') }),
    });
    expect(BAIT_WINDOW_MIN).toBe(COOK_KIND_RULES.bait.slotMs / 60_000);
    expect(baitEffect('epic')).toEqual(fx({ epic: bonusOf('cook-bait-epic') }));
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
  it('요리 콘텐츠의 레시피를 모두 같은 id로 불러온다', () => {
    expect(RECIPES.map(r => r.id)).toEqual(COOK_RECIPES.map(r => r.id));
  });

  it('이름, 종류, 기운 요구가 요리 콘텐츠와 같다', () => {
    for (const r of RECIPES) {
      const c = COOK_RECIPES.find(x => x.id === r.id)!;
      expect(r.name).toBe(c.name);
      expect(r.kind).toBe(c.kind);
      expect(r.cost).toEqual(c.cost);
    }
  });

  it('효과는 요리 콘텐츠의 효과 값을 매개변수로 옮긴 것이다', () => {
    for (const r of RECIPES) {
      expect(r.effect).toEqual(effectOfRecipe(COOK_RECIPES.find(x => x.id === r.id)!));
    }
    expect(recipeBy('cook-lunch-bite').effect).toEqual(fx({ bite: COOK_RECIPES.find(x => x.id === 'cook-lunch-bite')!.effects.biteWaitCut }));
    expect(recipeBy('cook-lunch-mutation').effect.variant).toBe(COOK_RECIPES.find(x => x.id === 'cook-lunch-mutation')!.effects.mutationWeight);
    expect(recipeBy('cook-lunch-named').effect.named).toBe(COOK_RECIPES.find(x => x.id === 'cook-lunch-named')!.effects.namedWeight);
    expect(recipeBy('cook-lunch-bundle').effect.rare).toBe(bonusOf('cook-lunch-bundle'));
  });

  it('도시락은 도시락 슬롯 지속의 방치, 미끼 요리는 미끼 슬롯 지속의 수동이다', () => {
    expect(LUNCH_HOURS).toBe(COOK_KIND_RULES.lunch.slotMs / 3_600_000);
    for (const r of RECIPES) {
      expect(r.hours).toBe(COOK_KIND_RULES[r.kind].slotMs / 3_600_000);
      expect(r.axis).toBe(r.kind === 'lunch' ? 'idle' : 'manual');
    }
  });

  it('등급 가중은 그 등급부터 전설까지 거는 효과만 옮기고 그 밖은 오류다', () => {
    const active = (o: Partial<ActiveCookEffects>): ActiveCookEffects => ({ ...NO_COOK_EFFECTS, ...o });
    expect(effectOf(active({ rarityWeight: { epic: 0.3, legendary: 0.3 } }))).toEqual(fx({ epic: 0.3 }));
    expect(() => effectOf(active({ rarityWeight: { rare: 0.3, legendary: 0.3 } }))).toThrow(/범위/);
    expect(() => effectOf(active({ rarityWeight: { common: 0.3, rare: 0.3, epic: 0.3, legendary: 0.3 } }))).toThrow(/범위/);
  });
});

describe('레시피 순손익', () => {
  const quick = recipeBy('cook-lunch-bite'), mixed = recipeBy('cook-lunch-bundle');
  /** 개체 하나가 내는 기운(화면 단위) */
  const perFish = ENERGY_PER_INDIVIDUAL / ENERGY_UNIT;
  /** 레시피가 요구하는 그 등급의 개체 수 */
  const need = (r: typeof quick, g: 'common') => r.cost[g]! / perFish;

  it('재료로 쓴 물고기의 판매 손실은 등급별 개수 x 그 등급의 평균 판매가(돌연변이 기댓값 포함)다', () => {
    for (const r of recipeRows({ axis: 'idle', margin: 0, recipes: [quick] })) {
      const base = effectRates(r.spot, r.level, 'idle', NO_EFFECT);
      const rows = base.rows.filter(x => x.fish.rarity === 'common');
      const avg = rows.reduce((a, x) => a + x.prob * x.fish.price, 0) / rows.reduce((a, x) => a + x.prob, 0);
      const ev = 1 + base.variantShare * (VARIANT_PRICE_MULT - 1);
      expect(r.loss).toBeCloseTo(need(quick, 'common') * avg * ev, 6);
    }
  });

  it('효과 지속 동안의 수입 증가는 그 낚시 방식의 시간당 골드 차이 x 지속이다', () => {
    for (const r of recipeRows({ axis: 'idle', margin: 0, recipes: [quick] })) {
      const base = effectRates(r.spot, r.level, 'idle', NO_EFFECT), now = effectRates(r.spot, r.level, 'idle', quick.effect);
      expect(r.gain).toBeCloseTo((now.goldPerHour - base.goldPerHour) * quick.hours, 6);
      expect(r.net).toBeCloseTo(r.gain - r.loss, 6);
    }
  });

  it('재료를 모으는 시간은 필요한 등급 중 가장 느리게 모이는 등급이 정한다', () => {
    for (const r of recipeRows({ axis: 'idle', margin: 0, recipes: [mixed] })) {
      const base = effectRates(r.spot, r.level, 'idle', NO_EFFECT);
      const perHour = (g: 'common' | 'rare' | 'epic' | 'legendary') => (base.rarity[g] ?? 0) * base.catchesPerHour * perFish;
      const cost = mixed.cost;
      if (perHour('legendary') === 0 || perHour('epic') === 0) { expect(r.collectHours).toBeNull(); expect(r.net).toBeNull(); continue; }
      const expected = Math.max(...(Object.keys(cost) as (keyof typeof cost)[]).map(g => cost[g]! / perHour(g)));
      expect(r.collectHours).toBeCloseTo(expected, 9);
    }
  });

  it('개체 하나가 내는 기운이 달라지면 필요한 개체 수가 반비례로 늘어 손실과 모으는 시간이 그 배율만큼 달라진다', () => {
    const spot = SPOTS[SPOTS.length - 1].id, level = entryLevel(spot);
    const one = materialLossFor(mixed, spot, level, 'idle', 1), half = materialLossFor(mixed, spot, level, 'idle', 0.5);
    expect(one.feasible).toBe(half.feasible);
    expect(half.loss).toBeCloseTo(one.loss * 2, 9);
    expect(half.collect).toBeCloseTo(one.collect * 2, 9);
    const quickAt = materialLossFor(quick, spot, level, 'idle', 0.25);
    expect(quickAt.loss).toBeCloseTo(materialLossFor(quick, spot, level, 'idle', 1).loss * 4, 9);
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

  it('미끼 요리는 수동 축으로 미끼 슬롯 지속의 수입 증가를 센다', () => {
    const bait = recipeBy('cook-bait-mutation');
    const r = recipeRows({ axis: 'idle', margin: 0, recipes: [bait] }).find(x => x.spot === last)!;
    const level = entryLevel(last), axis = axisOf('manual', last, level);
    const base = effectRates(last, level, axis, NO_EFFECT), now = effectRates(last, level, axis, bait.effect);
    expect(r.gain).toBeCloseTo((now.goldPerHour - base.goldPerHour) * bait.hours, 6);
  });
});

describe('집 기운 얻기 공급', () => {
  const fishOf = (grade: 'common' | 'rare' | 'epic' | 'legendary') => FISH.filter(f => f.rarity === grade);
  const c = (fishId: string, variant = false) => ({ fishId, variant });
  const sum = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0);

  it('내보내는 순서는 게임의 개체 비교 함수와 같고 등급이 낮은 쪽이 먼저다', () => {
    const order = evictionOrder();
    expect(order.length).toBe(FISH.length * 2);
    const proto = (fishId: string, variant: boolean) => ({ uid: '', fishId, form: variant ? 'variant' as const : 'normal' as const, size: 0, caughtAt: null, spot: null, judgment: null, locked: false });
    for (let i = 1; i < order.length; i++) {
      expect(compareBlandness(proto(order[i - 1].fishId, order[i - 1].variant), proto(order[i].fishId, order[i].variant))).toBeLessThanOrEqual(0);
    }
    expect(order[0].grade).toBe('common');
    expect(order[order.length - 1].grade).toBe('legendary');
  });

  it('같은 등급 안에서는 판매가 순이라 값싼 어종의 돌연변이가 비싼 어종의 일반 폼보다 먼저 나간다', () => {
    const order = evictionOrder();
    for (const g of RARITY_ORDER) {
      const prices = order.filter(s => s.grade === g).map(s => s.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    }
    // 고정 어종: 같은 등급 안에서 가장 싼 어종과 가장 비싼 어종. 아래 전제가 깨지면 이 검사의 의미가 없어 먼저 확인한다
    const rareFish = [...FISH].filter(f => f.rarity === 'rare').sort((a, b) => a.price - b.price);
    const cheap = rareFish[0], costly = rareFish[rareFish.length - 1];
    expect(priceOf(cheap, 'variant')).toBeLessThan(priceOf(costly, 'normal'));
    const at = (fishId: string, variant: boolean) => order.findIndex(s => s.fishId === fishId && s.variant === variant);
    expect(at(cheap.id, true)).toBeLessThan(at(costly.id, false));
  });

  it('상한 안에서는 아무것도 놓아주지 않는다', () => {
    const r = fillBag([c(fishOf('common')[0].id), c(fishOf('epic')[0].id)], 2);
    expect(sum(r.released)).toBe(0);
    expect(r.kept.epic).toBe(1);
  });

  it('가방이 차면 가장 안 특별한 개체부터 놓아주고 새 개체도 후보에 든다', () => {
    const epic = fishOf('epic')[0], legend = fishOf('legendary')[0], rare = fishOf('rare')[0], common = fishOf('common')[0];
    const r = fillBag([c(epic.id), c(common.id), c(rare.id), c(common.id), c(legend.id)], 2);
    expect(r.released).toEqual({ common: 2, rare: 1, epic: 0, legendary: 0 });
    expect(r.kept).toEqual({ common: 0, rare: 0, epic: 1, legendary: 1 });
    expect(r.releasedGold).toBeCloseTo(2 * priceOf(common, 'normal') + priceOf(rare, 'normal'), 9);
    expect(r.keptGold).toBeCloseTo(priceOf(epic, 'normal') + priceOf(legend, 'normal'), 9);
  });

  it('같은 등급에서는 판매가가 낮은 개체를 먼저 놓아준다', () => {
    const [cheap, costly] = [...fishOf('rare')].sort((a, b) => a.price - b.price).filter((f, k, all) => k === 0 || f.price > all[0].price);
    const r = fillBag([c(costly.id), c(cheap.id), c(costly.id)], 2);
    expect(r.releasedGold).toBeCloseTo(priceOf(cheap, 'normal'), 9);
    expect(r.keptGold).toBeCloseTo(2 * priceOf(costly, 'normal'), 9);
  });

  it('상한이 0이면 모두 놓아주고 모르는 어종은 오류다', () => {
    expect(fillBag([c(fishOf('rare')[0].id, true)], 0).released.rare).toBe(1);
    expect(() => fillBag([c('nope')], 3)).toThrow(/어종/);
  });

  it('기본 선택에서 빠지는 해역은 그 배로 갈 수 있는 해역 중 해역 순서로 가장 앞선 하나다', () => {
    for (const boat of [0, 1, 3, 5, 6, 7, 8]) {
      const reachable = SPOTS.filter(s => canFishSpot({ ...newState(), boat }, s.id)).map(s => s.id);
      expect(energyDefaultExcluded(boat)).toEqual(reachable.slice(-1));
    }
  });

  it('요리 해금 배 단계 이상의 배 단계마다 그 배로 갈 수 있는 해역을 낸다', () => {
    const rows = bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 2, seed: 1 });
    const boats = [...new Set(rows.map(r => r.boat))];
    expect(boats[0]).toBe(COOKING_UNLOCK_BOAT);
    expect(Math.min(...boats)).toBeGreaterThanOrEqual(COOKING_UNLOCK_BOAT);
    for (const r of rows) {
      expect(SPOTS.find(s => s.id === r.spot)!.boatTier).toBeLessThanOrEqual(r.boat);
      expect(r.cap).toBe(capOfBoat(r.boat));
    }
    expect(rows.filter(r => r.boat === COOKING_UNLOCK_BOAT).map(r => r.spot)).toContain('indian');
    expect(rows.filter(r => r.boat === COOKING_UNLOCK_BOAT).map(r => r.spot)).not.toContain('benguela');
    expect(bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 1, seed: 1, unlockBoat: 7 }).every(r => r.boat >= 7)).toBe(true);
  });

  it('가장 앞선 해역 어종의 공급은 0이고 그보다 앞 해역은 가방에 남은 개체가 기운이 된다', () => {
    const rows = bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 3, seed: 5 });
    for (const r of rows) {
      expect(r.frontmost).toBe(energyDefaultExcluded(r.boat).includes(r.spot));
      if (r.frontmost) { expect(sum(r.energy)).toBe(0); expect(r.energyGold).toBe(0); }
      else { expect(r.energy).toEqual(r.kept); expect(r.energyGold).toBe(r.keptGold); }
    }
    expect(rows.some(r => r.frontmost)).toBe(true);
    expect(rows.some(r => !r.frontmost && sum(r.energy) > 0)).toBe(true);
    const at8 = (spot: string) => rows.find(r => r.boat === 8 && r.spot === spot)!;
    expect(sum(at8('sthelena').energy)).toBe(0);
    expect(sum(at8('benguela').energy)).toBeGreaterThan(0);
  });

  it('낚은 수, 남은 수, 놓아준 수가 맞고 해역의 개체만 낚는다', () => {
    for (const r of bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 4, seed: 11 })) {
      expect(sum(r.kept)).toBeCloseTo(Math.min(r.cap, r.catches), 9);
      expect(sum(r.released)).toBeCloseTo(Math.max(0, r.catches - r.cap), 9);
      const level = r.level, rates = effectRates(r.spot, level, axisOf('idle', r.spot, level), NO_EFFECT);
      expect(rates.rows.every(x => x.fish.spot === r.spot)).toBe(true);
    }
  });

  it('같은 시드는 같은 결과이고 시도 횟수와 시간이 잘못되면 오류다', () => {
    const a = bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 3, seed: 2 });
    expect(a).toEqual(bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 3, seed: 2 }));
    expect(a).not.toEqual(bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 3, seed: 3 }));
    expect(() => bagSupplyRows({ axis: 'idle', margin: 0, hours: 9, trials: 0, seed: 2 })).toThrow(/시도/);
    expect(() => bagSupplyRows({ axis: 'idle', margin: 0, hours: 0, trials: 2, seed: 2 })).toThrow(/시간/);
  });

  it('집 기운으로 만들 수 있는 개수는 가장 모자란 등급이 정한다', () => {
    const q = recipeBy('cook-lunch-bite'), m = recipeBy('cook-lunch-bundle');
    const supply = { common: 1200, rare: 10, epic: 2, legendary: 0.5 };
    expect(recipesCovered(supply, q)).toBeCloseTo(2, 12);
    expect(recipesCovered(supply, m)).toBeCloseTo(0.5, 12);
    expect(recipesCovered(supply, { ...q, cost: {} })).toBe(Number.POSITIVE_INFINITY);
  });
});
