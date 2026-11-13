import { describe, expect, it } from 'vitest';
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import { SPOTS } from '../../../src/game/content/spots';
import { spotsOfZone, zoneOf } from '../model';
import { roundReward } from './ev';
import { rewardAmounts, rewardBasis, rewardPlan, rewardRows, splitReward } from './achievement';
import { transitionGold } from './transitions';

describe('보상 기준 전환', () => {
  it('구역마다 한 행이고 구역 순서는 의뢰 구역 순서와 같다', () => {
    expect(rewardBasis().map(b => b.zone)).toEqual([...BOUNTY_ZONES]);
  });

  it('구역의 마지막 해역에서 다음 지역 첫 해역으로 넘어가는 전환의 골드와 배 명성 요구치를 쓴다', () => {
    const gold = transitionGold();
    for (const b of rewardBasis().filter(x => x.next !== null)) {
      const last = spotsOfZone(b.zone).at(-1)!;
      const idx = SPOTS.findIndex(s => s.id === last.id);
      const row = gold.find(r => r.from === last.id)!;
      expect(b.from).toBe(last.id);
      expect(b.to).toBe(SPOTS[idx + 1].id);
      expect(zoneOf(SPOTS[idx + 1].id)).not.toBe(b.zone);
      expect(b.next).toEqual({ totalGold: row.totalGold, fameReq: row.fameReq });
    }
  });

  it('다음 지역이 없는 구역은 기준 전환이 없다', () => {
    const last = rewardBasis().at(-1)!;
    expect(last.zone).toBe('southatlantic');
    expect(last.to).toBeNull();
    expect(last.next).toBeNull();
  });
});

describe('보상 금액', () => {
  const basis = rewardBasis().filter(b => b.next !== null);

  it('전환 골드와 배 명성 요구치에 같은 비율을 곱해 의뢰 보상과 같은 자릿수 반올림을 한다', () => {
    for (const b of basis) {
      const a = rewardAmounts(b, 0.25)!;
      expect(a.rawGold).toBeCloseTo(b.next!.totalGold * 0.25, 9);
      expect(a.rawFame).toBeCloseTo(b.next!.fameReq * 0.25, 9);
      expect(a.gold).toBe(roundReward(a.rawGold));
      expect(a.fame).toBe(roundReward(a.rawFame));
    }
  });

  it('기준 전환이 없는 구역은 null이다', () => {
    expect(rewardAmounts(rewardBasis().at(-1)!, 0.25)).toBeNull();
  });

  it('비율은 0보다 크고 1 이하여야 한다', () => {
    const b = basis[0];
    expect(() => rewardAmounts(b, 0)).toThrow();
    expect(() => rewardAmounts(b, 1.2)).toThrow();
    expect(() => rewardAmounts(b, Number.NaN)).toThrow();
  });

  it('비율이 크면 보상도 크거나 같다', () => {
    for (const b of basis) {
      const lo = rewardAmounts(b, 0.2)!, hi = rewardAmounts(b, 0.3)!;
      expect(hi.gold).toBeGreaterThanOrEqual(lo.gold);
      expect(hi.fame).toBeGreaterThanOrEqual(lo.fame);
    }
  });
});

describe('두 업적 나눔', () => {
  it('원값을 비율로 나눠 각각 반올림한다', () => {
    const a = rewardAmounts(rewardBasis()[1], 0.25)!;
    const s = splitReward(a, 0.4);
    expect(s.basic.gold).toBe(roundReward(a.rawGold * 0.4));
    expect(s.named.gold).toBe(roundReward(a.rawGold * 0.6));
    expect(s.basic.fame).toBe(roundReward(a.rawFame * 0.4));
    expect(s.named.fame).toBe(roundReward(a.rawFame * 0.6));
  });

  it('몫이 0이거나 1이면 한쪽이 전부 받는다', () => {
    const a = rewardAmounts(rewardBasis()[0], 0.25)!;
    expect(splitReward(a, 1).named).toEqual({ gold: 0, fame: 0 });
    expect(splitReward(a, 0).basic).toEqual({ gold: 0, fame: 0 });
  });

  it('몫이 범위 밖이면 거부한다', () => {
    const a = rewardAmounts(rewardBasis()[0], 0.25)!;
    expect(() => splitReward(a, -0.1)).toThrow();
    expect(() => splitReward(a, 1.1)).toThrow();
  });
});

describe('보상 행', () => {
  it('비율마다 구역 행에 금액을 담고 나눔을 주면 업적별 금액도 담는다', () => {
    const rows = rewardRows({ ratios: [0.2, 0.3], split: 0.5 });
    expect(rows).toHaveLength(BOUNTY_ZONES.length);
    const first = rows[0];
    expect(first.amounts.map(a => a.ratio)).toEqual([0.2, 0.3]);
    expect(first.amounts[0].split).toBeDefined();
    expect(rewardRows({ ratios: [0.2] })[0].amounts[0].split).toBeUndefined();
  });

  it('기준 전환이 없는 구역은 금액이 비어 있다', () => {
    const last = rewardRows({ ratios: [0.25] }).at(-1)!;
    expect(last.amounts).toEqual([]);
  });

  it('비율이 없으면 거부한다', () => {
    expect(() => rewardRows({ ratios: [] })).toThrow();
  });
});

describe('진행에 넣는 보상', () => {
  it('구역과 업적 종류에 맞는 나눔 금액을 낸다', () => {
    const basis = rewardBasis()[3];
    const split = splitReward(rewardAmounts(basis, 0.25)!, 0.4);
    const plan = rewardPlan(0.25, 0.4);
    expect(plan.reward(basis.zone, 'basic')).toEqual(split.basic);
    expect(plan.reward(basis.zone, 'named')).toEqual(split.named);
  });

  it('기준 전환이 없는 구역은 지급하지 않는다', () => {
    expect(rewardPlan(0.25, 0.5).reward('southatlantic', 'basic')).toBeNull();
  });

  it('범위 밖 비율과 나눔을 거부한다', () => {
    expect(() => rewardPlan(0, 0.5)).toThrow();
    expect(() => rewardPlan(0.25, 2)).toThrow();
  });
});
