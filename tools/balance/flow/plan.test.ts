import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { entryLevel, rates } from '../model';
import { COOKING_UNLOCK_BOAT } from '../../../src/game/content/cooking';
import { RECIPES, effectPlan, materialLoss } from './cooking';
import { NO_EFFECT, effectRates } from './effects';
import type { Effect } from './effects';
import { daysReport } from './days';
import { gatesReport } from './gateReport';
import { DAY_HOURS, simulate } from './progress';
import type { RatePlan } from './progress';
import { transitionReport } from './transitions';

const fx = (e: Partial<Effect>): Effect => ({ ...NO_EFFECT, ...e });
const last = SPOTS[SPOTS.length - 1].id;
const passthrough: RatePlan = { rateFor: (spot, level, axis) => rates(spot, level, axis), costPerHour: () => 0 };
const finalHours = (r: ReturnType<typeof simulate>) => r.arrivals[r.arrivals.length - 1].hours;

describe('효과 계획', () => {
  it('기본 시작 조건은 인도양을 여는 배 단계다', () => {
    expect(COOKING_UNLOCK_BOAT).toBe(SPOTS.find(s => s.id === 'indian')!.boatTier);
  });

  it('시작 배 단계 미만이면 효과 없음과 같고 이상이면 효과를 넣은 수입이다', () => {
    const plan = effectPlan({ effect: fx({ bite: 0.1 }) });
    const level = entryLevel(last);
    const before = plan.rateFor(last, level, 'idle', COOKING_UNLOCK_BOAT - 1), after = plan.rateFor(last, level, 'idle', COOKING_UNLOCK_BOAT);
    expect(before.goldPerHour).toBeCloseTo(rates(last, level, 'idle').goldPerHour, 9);
    expect(after.goldPerHour).toBeCloseTo(effectRates(last, level, 'idle', fx({ bite: 0.1 })).goldPerHour, 9);
    expect(after.goldPerHour).toBeGreaterThan(before.goldPerHour);
  });

  it('시작 배 단계를 줄 수 있다', () => {
    const plan = effectPlan({ effect: fx({ bite: 0.1 }), fromBoat: 0 });
    const level = entryLevel('pond');
    expect(plan.rateFor('pond', level, 'idle', 0).goldPerHour).toBeGreaterThan(rates('pond', level, 'idle').goldPerHour);
  });

  it('낮 풀을 줄 수 있다', () => {
    const plan = effectPlan({ effect: fx({ rare: 0.1 }), fromBoat: 0 });
    const level = entryLevel(last);
    expect(plan.rateFor(last, level, 'idle', 8, 'day').goldPerHour).toBeCloseTo(effectRates(last, level, 'idle', fx({ rare: 0.1 }), 'day').goldPerHour, 9);
    expect(plan.rateFor(last, level, 'idle', 8, 'day').goldPerHour).not.toBeCloseTo(plan.rateFor(last, level, 'idle', 8).goldPerHour, 3);
  });

  it('레시피를 주면 재료 판매 손실을 8시간 낚시 하루에 한 번으로 나눠 시간당 비용으로 낸다', () => {
    const quick = RECIPES.find(r => r.id === 'cook-lunch-bite')!;
    const plan = effectPlan({ effect: quick.effect, recipe: quick });
    const level = entryLevel(last);
    const m = materialLoss(quick, last, level, 'idle');
    expect(m.feasible).toBe(true);
    expect(plan.costPerHour(last, level, 'idle', COOKING_UNLOCK_BOAT)).toBeCloseTo(m.loss / DAY_HOURS, 9);
    expect(plan.costPerHour(last, level, 'idle', COOKING_UNLOCK_BOAT - 1)).toBe(0);
  });

  it('레시피 없이 쓰면 비용이 없다', () => {
    expect(effectPlan({ effect: fx({ bite: 0.1 }) }).costPerHour(last, entryLevel(last), 'idle', 8)).toBe(0);
  });

  it('재료가 나오지 않는 해역에서는 레시피를 만들 수 없어 효과도 비용도 없다', () => {
    const mixed = RECIPES.find(r => r.id === 'cook-lunch-bundle')!;
    const spot = SPOTS.find(s => !materialLoss(mixed, s.id, entryLevel(s.id), 'idle').feasible)!;
    const plan = effectPlan({ effect: mixed.effect, recipe: mixed, fromBoat: 0 });
    const level = entryLevel(spot.id);
    expect(plan.costPerHour(spot.id, level, 'idle', 0)).toBe(0);
    expect(plan.rateFor(spot.id, level, 'idle', 0).goldPerHour).toBeCloseTo(rates(spot.id, level, 'idle').goldPerHour, 9);
  });
});

describe('진행 시뮬레이션의 효과 계획', () => {
  const run = (plan?: RatePlan) => simulate({ axis: 'idle', bounty: false, maxDays: 365, plan });

  it('효과 없는 계획은 계획이 없는 것과 같은 결과다', () => {
    expect(run(passthrough).arrivals).toEqual(run().arrivals);
  });

  it('입질 대기 단축을 처음부터 걸면 마지막 해역에 더 빨리 닿는다', () => {
    expect(finalHours(run(effectPlan({ effect: fx({ bite: 0.1 }), fromBoat: 0 })))).toBeLessThan(finalHours(run()));
  });

  it('효과가 시작 배 단계 이후에만 걸리면 그 이전 해역의 도착 시간은 그대로다', () => {
    const base = run().arrivals, now = run(effectPlan({ effect: fx({ bite: 0.1 }) })).arrivals;
    const k = SPOTS.findIndex(s => s.boatTier >= COOKING_UNLOCK_BOAT);
    for (let i = 0; i <= k; i++) expect(now[i].hours).toBeCloseTo(base[i].hours, 9);
    expect(now[now.length - 1].hours).toBeLessThan(base[base.length - 1].hours);
  });

  it('시간당 비용은 수입에서 빠져 도착이 늦어진다', () => {
    const costly: RatePlan = { rateFor: (spot, level, axis) => rates(spot, level, axis), costPerHour: () => 300 };
    expect(finalHours(run(costly))).toBeGreaterThan(finalHours(run()));
  });

  it('의뢰 수행에서도 계획이 적용된다', () => {
    const plan = effectPlan({ effect: fx({ rare: 0.2 }), fromBoat: 0 });
    const a = simulate({ axis: 'idle', bounty: true, maxDays: 365, plan }), b = simulate({ axis: 'idle', bounty: true, maxDays: 365 });
    expect(finalHours(a)).not.toBe(finalHours(b));
  });
});

describe('전환, 누적 도달, 게이트의 효과 계획', () => {
  const plan = effectPlan({ effect: fx({ bite: 0.1 }), fromBoat: 0 });

  it('전환 보고는 효과 없음 전환 시간을 함께 담고 계획이 없으면 담지 않는다', () => {
    const w = transitionReport({ axis: 'idle', maxDays: 365, plan });
    const base = transitionReport({ axis: 'idle', maxDays: 365 });
    expect(base.base).toBeUndefined();
    expect(w.base!.map(t => t.hours)).toEqual(base.timings.map(t => t.hours));
    expect(w.timings[w.timings.length - 1].cumulativeHours).toBeLessThan(base.timings[base.timings.length - 1].cumulativeHours);
  });

  it('전환 보고는 의뢰를 모두 수행하는 경우를 고를 수 있다', () => {
    const a = transitionReport({ axis: 'idle', maxDays: 365, bounty: true });
    const b = transitionReport({ axis: 'idle', maxDays: 365 });
    expect(a.timings[a.timings.length - 1].cumulativeHours).toBeLessThan(b.timings[b.timings.length - 1].cumulativeHours);
  });

  it('누적 도달은 효과 없음 값을 함께 담는다', () => {
    const w = daysReport({ axis: 'idle', maxDays: 365, plan });
    const base = daysReport({ axis: 'idle', maxDays: 365 });
    expect(base.base).toBeUndefined();
    expect(w.base!.arrival).toEqual(base.arrival);
    expect(w.base!.levelUp).toEqual(base.levelUp);
    for (let i = 0; i < w.arrival.length; i++) {
      expect(w.arrival[i].spots[w.arrival[i].spots.length - 1].hours!).toBeLessThan(base.arrival[i].spots[base.arrival[i].spots.length - 1].hours!);
    }
    expect(w.levelUp.map(l => l.dailyGold)).not.toEqual(base.levelUp.map(l => l.dailyGold));
  });

  it('게이트 보고는 효과를 넣은 이동 직후 수입과 효과 없음 값, 전환 시간을 담고 PERFECT와 최초 10분은 내지 않는다', () => {
    const opts = { maxDays: 365, legendAts: [15] };
    const w = gatesReport({ ...opts, plan });
    const base = gatesReport(opts);
    expect(w.perfect).toEqual([]);
    expect(w.opening).toEqual([]);
    expect(w.moveBase).toEqual(base.move);
    expect(w.move.map(r => r.after)).not.toEqual(base.move.map(r => r.after));
    expect(w.time.map(t => t.baseHours)).toEqual(base.time.map(t => t.hours));
    expect(base.moveBase).toBeUndefined();
    expect(base.perfect.length).toBeGreaterThan(0);
  });

  it('게이트 이동 직후 수입은 낮 풀과 낮밤 혼합 모두에서 효과를 넣는다', () => {
    const w = gatesReport({ maxDays: 365, legendAts: [15], plan: effectPlan({ effect: fx({ rare: 0.2 }), fromBoat: 0 }) });
    const base = gatesReport({ maxDays: 365, legendAts: [15] });
    for (const pool of ['day', 'mixed'] as const) {
      const a = w.move.filter(r => r.pool === pool), b = base.move.filter(r => r.pool === pool);
      expect(a.length).toBe(b.length);
      expect(a.some((r, i) => r.after !== b[i].after)).toBe(true);
    }
  });

  it('게이트 보고는 의뢰를 모두 수행하는 경우로 전환 시간을 잴 수 있다', () => {
    const a = gatesReport({ maxDays: 365, legendAts: [15], bounty: true });
    const b = gatesReport({ maxDays: 365, legendAts: [15] });
    expect(a.time.map(t => t.hours)).not.toEqual(b.time.map(t => t.hours));
  });
});
