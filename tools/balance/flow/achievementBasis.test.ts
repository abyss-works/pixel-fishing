import { afterEach, describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/game/content/boats';
import { entryLevel, rates } from '../model';
import { parseBasisSpec, rewardBasis, rewardPlan, rewardRows } from './achievement';
import type { RewardBasisOptions } from './achievement';
import { applyOverride, parseOverride } from './override';
import { roundReward } from './ev';
import { transitionGold } from './transitions';

const gold = (from: string) => transitionGold().find(r => r.from === from)!;

describe('보상 기준 방식', () => {
  it('total은 옵션이 없을 때와 같다', () => {
    expect(rewardBasis({ mode: 'total' })).toEqual(rewardBasis());
  });

  it('incremental-fame은 명성 기준을 기준 전환의 증분(도착 배 요구치 - 출발 해역 배 요구치)으로 바꾼다', () => {
    const b = rewardBasis({ mode: 'incremental-fame' }).find(x => x.zone === 'indian')!;
    expect(b.next!.totalGold).toBe(gold('southindian').totalGold);
    const increment = BOATS.find(x => x.tier === 7)!.fameReq - BOATS.find(x => x.tier === 6)!.fameReq;
    expect(b.next!.fameReq).toBe(increment);
    const a = rewardRows({ ratios: [0.25], basis: { mode: 'incremental-fame' } }).find(r => r.zone === 'indian')!.amounts[0];
    expect(a.rawFame).toBeCloseTo(increment * 0.25, 9);
    expect(a.rawGold).toBeCloseTo(gold('southindian').totalGold * 0.25, 9);
  });

  it('배를 사지 않는 기준 전환의 증분 명성은 0이다', () => {
    const b = rewardBasis({ mode: 'incremental-fame', transitions: { madagascar: { from: 'mozstrait', to: 'comorodeep' } } }).find(x => x.zone === 'madagascar')!;
    expect(b.next!.fameReq).toBe(0);
  });

  it('ev-hours는 전환 골드를 출발 해역 EV 시간으로 바꿔 구역 대표 EV를 곱한다. 기본 기준 전환에서는 total과 골드가 같다', () => {
    const t = rewardBasis().find(x => x.zone === 'indian')!;
    const e = rewardBasis({ mode: 'ev-hours' }).find(x => x.zone === 'indian')!;
    expect(e.next!.totalGold).toBeCloseTo(t.next!.totalGold, 4);
    expect(e.next!.fameReq).toBe(BOATS.find(x => x.tier === 7)!.fameReq - BOATS.find(x => x.tier === 6)!.fameReq);
  });

  it('ev-hours는 구역 마지막이 아닌 해역에서 출발하는 기준 전환이면 구역 대표 EV로 환산해 달라진다', () => {
    const o = { transitions: { indian: { from: 'indian', to: 'southindian' } } } as const;
    const t = rewardBasis(o).find(x => x.zone === 'indian')!;
    const e = rewardBasis({ ...o, mode: 'ev-hours' }).find(x => x.zone === 'indian')!;
    const evFrom = rates('indian', entryLevel('indian'), 'idle').goldPerHour, evRep = rates('southindian', entryLevel('southindian'), 'idle').goldPerHour;
    expect(e.next!.totalGold).toBeCloseTo(t.next!.totalGold * evRep / evFrom, 4);
  });

  it('기준 전환을 지정하면 그 전환의 값으로 바꾼다', () => {
    const b = rewardBasis({ transitions: { madagascar: { from: 'mozstrait', to: 'comorodeep' } } }).find(x => x.zone === 'madagascar')!;
    expect(b.from).toBe('mozstrait');
    expect(b.to).toBe('comorodeep');
    expect(b.next).toEqual({ totalGold: gold('mozstrait').totalGold, fameReq: gold('mozstrait').fameReq });
  });

  describe('가상 전환', () => {
    let restore: (() => void) | null = null;
    afterEach(() => { restore?.(); restore = null; });

    it('가상 해역으로 가는 전환을 기준 전환으로 지정할 수 있다', () => {
      restore = applyOverride(parseOverride({ addSpots: [{ id: 'next', like: 'sthelena', powerReq: 170, zone: 'z', growth: 0.45, boat: { price: 5000000, fameReq: 400000 } }] }));
      const o = { transitions: { southatlantic: { from: 'sthelena', to: 'next' } } } as unknown as RewardBasisOptions;
      const b = rewardBasis(o).find(x => x.zone === 'southatlantic')!;
      expect(b.to).toBe('next');
      const g = gold('sthelena');
      expect(b.next).toEqual({ totalGold: g.totalGold, fameReq: 400000 });
      const a = rewardRows({ ratios: [0.25], basis: o }).find(r => r.zone === 'southatlantic')!.amounts[0];
      expect(a.gold).toBe(roundReward(g.totalGold * 0.25));
      expect(a.fame).toBe(roundReward(400000 * 0.25));
      expect(rewardPlan(0.25, 0.5, o).reward('southatlantic', 'basic')).not.toBeNull();
    });

    it('덮어쓰기가 없으면 지정할 수 없다', () => {
      expect(() => rewardBasis({ transitions: { southatlantic: { from: 'sthelena', to: 'next' as never } } })).toThrow('전환');
    });
  });

  it('이어지지 않는 전환과 의뢰 구역이 아닌 이름을 거부한다', () => {
    expect(() => rewardBasis({ transitions: { indian: { from: 'indian', to: 'mozstrait' } } })).toThrow('이어지는');
    expect(() => rewardBasis({ transitions: { nowhere: { from: 'indian', to: 'southindian' } } as never })).toThrow('구역');
  });

  it('기준 전환 인자를 구역=출발:도착으로 읽는다', () => {
    expect(parseBasisSpec('southatlantic=sthelena:next')).toEqual({ zone: 'southatlantic', from: 'sthelena', to: 'next' });
    expect(() => parseBasisSpec('southatlantic')).toThrow('형식');
    expect(() => parseBasisSpec('southatlantic=sthelena')).toThrow('형식');
  });
});
