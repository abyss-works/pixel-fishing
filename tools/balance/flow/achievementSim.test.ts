import { describe, expect, it } from 'vitest';
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import { FISH } from '../../../src/game/content/fish';
import { rng } from '../model';
import { simulate } from './progress';
import { rewardPlan } from './achievement';
import type { Reward } from './achievement';
import { daysReport } from './days';
import { transitionReport } from './transitions';
import { createSampler } from './sample';
import type { Sampler } from './sample';

const run = (o: Partial<Parameters<typeof simulate>[0]> = {}) => simulate({ axis: 'idle', bounty: false, maxDays: 365, ...o });
const none = () => null;
const big = (zone: string): Reward | null => (zone === 'indian' ? { gold: 1_000_000, fame: 0 } : null);

describe('업적 달성 기록', () => {
  it('옵션이 없으면 달성 기록이 비어 있다', () => {
    expect(run().achieved).toEqual([]);
  });

  it('달성 시각만 기록하면 도착 기록을 바꾸지 않는다', () => {
    const r = run({ achievements: { reward: none } });
    expect(r.arrivals).toEqual(run().arrivals);
    expect(r.achieved.length).toBeGreaterThan(0);
    for (const a of r.achieved) expect(a.granted).toBeNull();
  });

  it('달성 기록은 시각 순이고 구역 안에서 기본 조건이 네임드 조건보다 먼저이거나 같다', () => {
    const r = run({ achievements: { reward: none } });
    for (let i = 1; i < r.achieved.length; i++) expect(r.achieved[i].hours).toBeGreaterThanOrEqual(r.achieved[i - 1].hours);
    for (const zone of new Set(r.achieved.map(a => a.zone))) {
      const basic = r.achieved.find(a => a.zone === zone && a.tier === 'basic');
      const named = r.achieved.find(a => a.zone === zone && a.tier === 'named');
      if (basic && named) expect(basic.hours).toBeLessThanOrEqual(named.hours);
    }
  });

  it('같은 업적을 두 번 기록하지 않는다', () => {
    const r = run({ achievements: { reward: none } });
    const keys = r.achieved.map(a => `${a.zone}:${a.tier}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('업적 보상 지급', () => {
  it('지급한 보상을 기록하고 보상이 큰 구역을 지난 도착이 빨라진다', () => {
    const base = run();
    const r = run({ achievements: { reward: big } });
    const target = r.achieved.filter(a => a.zone === 'indian');
    expect(target.length).toBeGreaterThan(0);
    for (const a of target) expect(a.granted).toEqual({ gold: 1_000_000, fame: 0 });
    // 보상 시각 이후의 도착만 빨라질 수 있다
    const at = Math.min(...target.map(a => a.hours));
    for (let i = 0; i < r.arrivals.length; i++) {
      if (base.arrivals[i].hours <= at) expect(r.arrivals[i].hours).toBe(base.arrivals[i].hours);
      else expect(r.arrivals[i].hours).toBeLessThanOrEqual(base.arrivals[i].hours);
    }
  });

  it('지급 전까지는 보상 없는 진행과 같다', () => {
    const base = run({ achievements: { reward: none } });
    const r = run({ achievements: { reward: big } });
    const first = r.achieved.find(a => a.granted !== null);
    expect(first).toBeDefined();
    const same = base.achieved.find(a => a.zone === first!.zone && a.tier === first!.tier)!;
    expect(first!.hours).toBe(same.hours);
  });

  it('명성 보상은 배 명성 대기를 줄인다', () => {
    const base = run();
    const r = run({ achievements: { reward: zone => (zone === 'indian' ? { gold: 0, fame: 1_000_000 } : null) } });
    const fameWait = (xs: typeof base.arrivals) => xs.reduce((sum, a) => sum + a.waitFame + a.waitBoth, 0);
    expect(fameWait(r.arrivals)).toBeLessThanOrEqual(fameWait(base.arrivals));
  });
});

describe('표본 경로의 업적 달성', () => {
  const trial = (seed: number, reward: (zone: string) => Reward | null) =>
    run({ sampler: createSampler(rng(seed)), achievements: { reward } });

  it('같은 시드는 같은 달성 시각을 낸다', () => {
    expect(trial(7, none).achieved).toEqual(trial(7, none).achieved);
  });

  it('달성 시각만 기록하면 같은 시드의 도착 기록을 바꾸지 않는다', () => {
    const base = run({ sampler: createSampler(rng(7)) });
    expect(trial(7, none).arrivals).toEqual(base.arrivals);
  });

  /** 모든 어종을 한 번에 낚았다고 알리는 표본기 — variant가 참이면 돌연변이 폼만 낚은 것이다 */
  const allFish = (variant: boolean): Sampler => ({
    rng: () => 0.5,
    cycleSec: () => 1,
    catchOf: () => { throw new Error('사용하지 않는다'); },
    valueOf: () => { throw new Error('사용하지 않는다'); },
    accrue: (_r, _sec, onCatch) => {
      for (const fish of FISH) onCatch?.({ fish, gold: 0, fame: 0, variant });
      return { gold: 0, fame: 0, catches: FISH.length };
    },
  });

  it('표본 경로에서는 일반 폼을 모두 모으면 모든 진행 업적을 달성한다', () => {
    const r = run({ sampler: allFish(false), achievements: { reward: none }, maxDays: 1 });
    expect(r.achieved.map(a => `${a.zone}:${a.tier}`).sort()).toEqual(BOUNTY_ZONES.flatMap(z => [`${z}:basic`, `${z}:named`]).sort());
  });

  it('표본 경로에서는 돌연변이 폼만 모아서는 진행 업적을 달성하지 못한다', () => {
    const r = run({ sampler: allFish(true), achievements: { reward: none }, maxDays: 1 });
    expect(r.achieved).toEqual([]);
  });

  it('시드가 다르면 달성 시각이 달라진다', () => {
    const a = trial(1, none).achieved.map(x => x.hours), b = trial(2, none).achieved.map(x => x.hours);
    expect(a).not.toEqual(b);
  });
});

describe('보상을 넣은 전환과 도달 보고서', () => {
  const reward = rewardPlan(0.25, 0.5);

  it('전환 보고서는 보상을 주면 보상 없는 값을 base로, 지급 내역을 achieved로 담는다', () => {
    const plain = transitionReport({ axis: 'idle', maxDays: 365 });
    const r = transitionReport({ axis: 'idle', maxDays: 365, reward });
    expect(plain.base).toBeUndefined();
    expect(plain.achieved).toBeUndefined();
    expect(r.base).toEqual(plain.timings);
    expect(r.achieved!.some(a => a.granted !== null)).toBe(true);
    expect(r.timings.at(-1)!.cumulativeHours).toBeLessThanOrEqual(plain.timings.at(-1)!.cumulativeHours);
  });

  it('도달 보고서는 보상을 주면 보상 없는 값을 base로 담고 구분마다 지급 내역을 담는다', () => {
    const plain = daysReport({ axis: 'idle', maxDays: 365 });
    const r = daysReport({ axis: 'idle', maxDays: 365, reward });
    expect(plain.base).toBeUndefined();
    expect(plain.arrival.every(a => a.achieved === undefined)).toBe(true);
    expect(r.base!.arrival).toEqual(plain.arrival);
    expect(r.arrival.every(a => a.achieved !== undefined)).toBe(true);
  });
});
