import { describe, expect, it } from 'vitest';
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import { SPOTS } from '../../../src/game/content/spots';
import { entryLevel, rates, zoneOf } from '../model';
import {
  DEFAULT_ACHIEVEMENT_HOURS, DEFAULT_BASIC_SHARE, DEFAULT_SPOT_ACHIEVEMENT_HOURS, DEFAULT_SPOT_TRANSITION_CAP,
  rewardAmounts, rewardPlan, rewardRows, splitReward,
  spotEvs, spotRewardPlan, spotRewardRows,
} from './achievement';
import { roundReward, zoneEvs } from './ev';
import { transitionGold } from './transitions';

describe('진행 업적 구역 보상 산식', () => {
  it('기본 목표 시간은 4시간, 기본 분배 몫은 0.5다', () => {
    expect(DEFAULT_ACHIEVEMENT_HOURS).toBe(4);
    expect(DEFAULT_BASIC_SHARE).toBe(0.5);
  });

  it('구역 대표 방치 EV는 ev 모듈의 구역별 EV를 그대로 사용한다', () => {
    const evs = zoneEvs();
    const rows = rewardRows();
    expect(rows.map(r => r.zone)).toEqual([...BOUNTY_ZONES]);
    expect(rows.map(r => ({ zone: r.zone, ev: r.ev }))).toEqual(evs);
  });

  it('4시간어치, 기본 분배 0.5일 때 6개 구역 산출값이 현재 방치 EV 기준과 일치한다', () => {
    const rows = rewardRows({ hours: [4], split: 0.5 });
    const table = rows.map(r => {
      const a = r.amounts[0];
      return { zone: r.zone, zoneGold: a.gold, basic: a.split!.basic.gold, named: a.split!.named.gold };
    });
    expect(table).toEqual([
      { zone: 'pacific', zoneGold: 50_000, basic: 25_000, named: 25_000 },
      { zone: 'seasia', zoneGold: 250_000, basic: 100_000, named: 150_000 },
      { zone: 'indian', zoneGold: 700_000, basic: 350_000, named: 350_000 },
      { zone: 'madagascar', zoneGold: 2_500_000, basic: 1_000_000, named: 1_500_000 },
      { zone: 'southatlantic', zoneGold: 10_000_000, basic: 5_000_000, named: 5_000_000 },
      { zone: 'northatlantic', zoneGold: 55_000_000, basic: 25_000_000, named: 30_000_000 },
    ]);
  });

  it('마지막 구역(northatlantic)도 뒷지역에 의존하지 않고 현재 구역 대표 방치 EV 기준으로 산출된다', () => {
    const last = rewardRows({ hours: [4], split: 0.5 }).at(-1)!;
    expect(last.zone).toBe('northatlantic');
    expect(last.amounts[0].gold).toBe(55_000_000);
    expect(rewardPlan(4, 0.5).reward('northatlantic', 'basic')).toEqual({ gold: 25_000_000 });
    expect(rewardPlan(4, 0.5).reward('northatlantic', 'named')).toEqual({ gold: 30_000_000 });
  });

  it('시간어치가 커지면 보상도 크거나 같다', () => {
    for (const z of zoneEvs()) {
      const lo = rewardAmounts(z.ev, 2), hi = rewardAmounts(z.ev, 6);
      expect(lo.rawGold).toBeCloseTo(z.ev * 2, 9);
      expect(lo.gold).toBe(roundReward(lo.rawGold));
      expect(hi.gold).toBeGreaterThanOrEqual(lo.gold);
    }
  });
});

describe('반례 및 입력 검증', () => {
  it('hours가 0 이하이거나 유한하지 않으면 오류를 던진다', () => {
    const ev = zoneEvs()[0].ev;
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => rewardAmounts(ev, bad)).toThrow();
      expect(() => rewardRows({ hours: [bad] })).toThrow();
      expect(() => rewardPlan(bad, 0.5)).toThrow();
    }
  });

  it('basicShare가 0 미만, 1 초과이거나 유한하지 않으면 오류를 던진다', () => {
    const a = rewardAmounts(zoneEvs()[0].ev, 4);
    for (const bad of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => splitReward(a, bad)).toThrow();
      expect(() => rewardRows({ hours: [4], split: bad })).toThrow();
      expect(() => rewardPlan(4, bad)).toThrow();
    }
  });

  it('hours 목록이 비어 있으면 거부한다', () => {
    expect(() => rewardRows({ hours: [] })).toThrow();
  });
});

describe('두 업적 분배 불변식', () => {
  it('두 업적의 합은 모든 구역, 시간어치, 몫에서 구역 보상 합계와 정확히 같고 어느 쪽도 음수가 아니다', () => {
    for (const z of zoneEvs()) {
      for (const hours of [1, 2, 4, 6, 8]) {
        const a = rewardAmounts(z.ev, hours);
        for (const share of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
          const s = splitReward(a, share);
          expect(s.basic.gold + s.named.gold).toBe(a.gold);
          expect(Math.min(s.basic.gold, s.named.gold)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('몫이 0이거나 1이면 한쪽이 전부 받는다', () => {
    const a = rewardAmounts(zoneEvs()[0].ev, 4);
    expect(splitReward(a, 1).named).toEqual({ gold: 0 });
    expect(splitReward(a, 0).basic).toEqual({ gold: 0 });
  });
});

describe('진행에 넣는 보상 계획', () => {
  it('구역과 업적 종류에 맞는 분할 골드만 낸다', () => {
    const plan = rewardPlan(4, 0.4);
    const seasia = rewardRows({ hours: [4], split: 0.4 }).find(r => r.zone === 'seasia')!;
    expect(plan.reward('seasia', 'basic')).toEqual(seasia.amounts[0].split!.basic);
    expect(plan.reward('seasia', 'named')).toEqual(seasia.amounts[0].split!.named);
    expect('fame' in plan.reward('seasia', 'basic')!).toBe(false);
  });
});

describe('해역 단위(spot) 진행 업적 보상 산식', () => {
  it('전체 15개 해역 각각에 대해 min(entryEV × 시간어치, 다음 해역 전환 골드 × 0.30)을 반올림한 뒤 기초·숙련에 나눈다', () => {
    expect(DEFAULT_SPOT_ACHIEVEMENT_HOURS).toBe(1);
    expect(DEFAULT_SPOT_TRANSITION_CAP).toBe(0.3);
    const evs = spotEvs();
    expect(evs.map(e => e.spot)).toEqual(SPOTS.map(s => s.id));
    for (const e of evs) {
      expect(e.entryLevel).toBe(entryLevel(e.spot));
      expect(e.ev).toBeCloseTo(rates(e.spot, entryLevel(e.spot), 'idle').goldPerHour, 9);
      expect(e.zone).toBe(zoneOf(e.spot));
    }
    const nextGold = new Map(transitionGold().map(t => [t.from, t.totalGold]));
    const rows = spotRewardRows({ hours: [1], split: 0.5 });
    expect(rows).toHaveLength(15);
    for (const r of rows) {
      const a = r.amounts[0];
      const next = nextGold.get(r.spot);
      const expectedRaw = next !== undefined ? Math.min(r.ev, next * 0.3) : r.ev;
      expect(a.rawGold).toBeCloseTo(expectedRaw, 9);
      expect(a.gold).toBe(roundReward(a.rawGold));
      expect(a.split!.basic.gold + a.split!.named.gold).toBe(a.gold);
      expect(Math.min(a.split!.basic.gold, a.split!.named.gold)).toBeGreaterThanOrEqual(0);
    }
    const last = rows.at(-1)!;
    expect(last.spot).toBe('bermuda');
    expect(last.amounts[0].rawGold).toBeCloseTo(last.ev, 9);
  });

  it('spotRewardPlan은 unit이 spot이고 해역과 기초·숙련에 맞는 골드를 돌려준다', () => {
    const plan = spotRewardPlan(1, 0.4);
    expect(plan.unit).toBe('spot');
    const rows = spotRewardRows({ hours: [1], split: 0.4 });
    for (const r of rows) {
      expect(plan.spotReward!(r.spot, 'basic')).toEqual(r.amounts[0].split!.basic);
      expect(plan.spotReward!(r.spot, 'named')).toEqual(r.amounts[0].split!.named);
    }
  });
});
