import { describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/game/content/boats';
import { upgradeCost } from '../../../src/game/rules/balance';
import { entryLevel, rates } from '../model';
import { powerOfLevel } from '../rodRules';
import { roundReward } from './ev';
import { BOAT_SHARE, currentRows, parseTarget, solveTargets } from './solve';
import { transitionGold } from './transitions';

describe('목표 시간에서 전환 값 역산', () => {
  const evOf = (spot: string) => rates(spot as never, entryLevel(spot as never), 'idle');

  it('전환 골드는 골드 시간 x 출발 해역 딱렙 방치 EV다', () => {
    const [r] = solveTargets([{ from: 'sthelena', goldHours: 24, fameHours: 30 }]);
    expect(r.evFrom).toBe(evOf('sthelena').goldPerHour);
    expect(r.totalGold).toBeCloseTo(24 * evOf('sthelena').goldPerHour, 6);
  });

  it('배 가격은 전환 골드의 15%를 보상 반올림으로 맞춘 값이고 나머지가 강화 골드다', () => {
    const [r] = solveTargets([{ from: 'sthelena', goldHours: 24, fameHours: 30 }]);
    expect(BOAT_SHARE).toBe(0.15);
    expect(r.boatPrice).toBe(roundReward(0.15 * r.totalGold));
    expect(r.upgradeGold).toBeCloseTo(r.totalGold - r.boatPrice, 6);
  });

  it('배 비중을 주면 그 비중으로 계산한다', () => {
    const [r] = solveTargets([{ from: 'sthelena', goldHours: 24, fameHours: 30 }], { boatShare: 0.1 });
    expect(r.boatPrice).toBe(roundReward(0.1 * r.totalGold));
  });

  it('강화 골드를 채우는 레벨 간격은 아래와 위 두 후보로 낸다', () => {
    const [r] = solveTargets([{ from: 'sthelena', goldHours: 24, fameHours: 30 }]);
    const e = entryLevel('sthelena' as never);
    const cost = (gap: number) => { let s = 0; for (let lv = e; lv < e + gap; lv++) s += upgradeCost(lv); return s; };
    expect(r.levels.below.cost).toBe(cost(r.levels.below.gap));
    expect(r.levels.below.cost).toBeLessThanOrEqual(r.upgradeGold);
    expect(cost(r.levels.below.gap + 1)).toBeGreaterThan(r.upgradeGold);
    expect(r.levels.above.gap).toBe(r.levels.below.gap + 1);
    expect(r.levels.above.cost).toBe(cost(r.levels.above.gap));
    expect(r.levels.above.power).toBe(powerOfLevel(e + r.levels.above.gap));
    expect(r.levels.above.level).toBe(e + r.levels.above.gap);
  });

  it('명성 요구치는 출발 해역을 여는 배의 요구치에 시간당 명성 x 명성 시간을 더한 값이다', () => {
    const [r] = solveTargets([{ from: 'sthelena', goldHours: 24, fameHours: 30 }]);
    const held = BOATS.find(b => b.tier === 8)!.fameReq;
    expect(r.fameFrom).toBe(held);
    expect(r.famePerHour).toBe(evOf('sthelena').famePerHour);
    expect(r.fameIncrement).toBeCloseTo(30 * evOf('sthelena').famePerHour, 6);
    expect(r.fameReq).toBeCloseTo(held + r.fameIncrement, 6);
    expect(r.fameReqRounded).toBe(roundReward(r.fameReq));
    expect(r.fameOverGold).toBeCloseTo(30 / 24, 12);
  });

  it('현행 전환의 시간을 그대로 넣으면 현행 전환 골드와 명성 요구치가 나온다', () => {
    const withBoat = currentRows().filter(x => x.boatCount > 0);
    expect(withBoat.length).toBeGreaterThan(0);
    for (const c of withBoat) {
      const [r] = solveTargets([{ from: c.from, goldHours: c.goldHours, fameHours: c.fameHours }]);
      const g = transitionGold().find(x => x.from === c.from)!;
      expect(r.totalGold).toBeCloseTo(g.totalGold, 4);
      expect(r.fameReq).toBeCloseTo(g.fameReq, 4);
    }
  });

  it('원양어선과 대양 트롤선의 배 가격은 현행 전환 골드의 15% 규칙과 같다', () => {
    const big = currentRows().filter(x => x.boatTiers.some(t => t >= 7));
    expect(big.length).toBe(2);
    for (const c of big) {
      expect(c.ruleBoatPrice).toBe(c.actualBoatPrice);
    }
  });

  it('명성 시간이 골드 시간의 1.3배를 넘는지 비율로 낸다', () => {
    const [r] = solveTargets([{ from: 'sthelena', goldHours: 10, fameHours: 20 }]);
    expect(r.fameOverGold).toBe(2);
  });

  it('잘못된 입력을 거부한다', () => {
    expect(() => solveTargets([{ from: 'nope' as never, goldHours: 1, fameHours: 1 }])).toThrow('없는 해역');
    expect(() => solveTargets([{ from: 'sthelena', goldHours: 0, fameHours: 1 }])).toThrow('0보다');
    expect(() => solveTargets([{ from: 'sthelena', goldHours: 1, fameHours: -1 }])).toThrow('0 이상');
    expect(() => solveTargets([{ from: 'sthelena', goldHours: 1, fameHours: 1 }], { boatShare: 1 })).toThrow('배 비중');
  });

  it('목표 인자를 해역=골드시간/명성시간으로 읽는다', () => {
    expect(parseTarget('sthelena=24/30')).toEqual({ from: 'sthelena', goldHours: 24, fameHours: 30 });
    expect(() => parseTarget('sthelena')).toThrow('형식');
    expect(() => parseTarget('sthelena=a/b')).toThrow('숫자');
  });
});
