import { describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { applyOverride } from './override';
import { transitionGold, transitionReport, transitionTimings } from './transitions';
import type { Arrival } from './progress';

const row = (to: string) => transitionGold().find(r => r.to === to)!;
const price = (tier: number) => BOATS.find(b => b.tier === tier)!.price;

describe('전환 골드', () => {
  it('해역 수보다 하나 적은 전환이 순서대로 있다', () => {
    const rows = transitionGold();
    expect(rows).toHaveLength(SPOTS.length - 1);
    expect(rows.map(r => r.to)).toEqual(SPOTS.slice(1).map(s => s.id));
    expect(rows.map(r => r.from)).toEqual(SPOTS.slice(0, -1).map(s => s.id));
  });

  it('배가 필요 없는 전환은 강화비만이다', () => {
    const r = row('river');
    expect(r.boats).toEqual([]);
    expect(r.boatGold).toBe(0);
    expect(r.upgradeGold).toBe(upgradeCost(1) + upgradeCost(2));
    expect(r.upgradeShare).toBe(1);
    expect(r.boatShare).toBe(0);
  });

  it('새 배를 사는 전환은 배 가격과 강화비의 합이고 비중의 합이 1이다', () => {
    const r = row('sea');
    expect(r.boats.map(b => b.tier)).toEqual([1]);
    expect(r.boatGold).toBe(price(1));
    expect(r.upgradeGold).toBe(upgradeCost(3) + upgradeCost(4));
    expect(r.totalGold).toBe(r.boatGold + r.upgradeGold);
    expect(r.boatShare + r.upgradeShare).toBeCloseTo(1, 12);
    expect(r.boatShare).toBeCloseTo(price(1) / r.totalGold, 12);
  });

  it('해역 없이 지나가는 배도 함께 산다', () => {
    const r = row('indian');
    expect(r.boats.map(b => b.tier)).toEqual([4, 5]);
    expect(r.boatGold).toBe(price(4) + price(5));
    expect(r.fameReq).toBe(BOATS.find(b => b.tier === 5)!.fameReq);
  });

  it('요구 파워를 올리는 덮어쓰기는 강화비를 늘린다', () => {
    const base = row('coron').upgradeGold;
    const restore = applyOverride({ spots: { coron: { powerReq: 70 } } });
    try { expect(row('coron').upgradeGold).toBeGreaterThan(base); } finally { restore(); }
    expect(row('coron').upgradeGold).toBe(base);
  });

  it('배 가격 덮어쓰기는 배 비중을 바꾼다', () => {
    const base = row('sea').boatShare;
    const restore = applyOverride({ boats: { '1': { price: 3000 } } });
    try { expect(row('sea').boatShare).toBeGreaterThan(base); } finally { restore(); }
  });
});

describe('전환 소요', () => {
  const arrival = (spot: string, hours: number, w: [number, number, number]): Arrival =>
    ({ spot: spot as Arrival['spot'], day: 1, hours, waitGold: w[0], waitFame: w[1], waitBoth: w[2] });

  it('도착 시각 차이가 소요 시간이고 명성 대기에는 둘 다 모자란 시간이 든다', () => {
    const t = transitionTimings([
      arrival('pond', 0, [0, 0, 0]), arrival('river', 2, [0, 2, 0]), arrival('sea', 3, [0, 0.5, 0.25]),
    ]);
    expect(t.map(x => x.hours)).toEqual([2, 1]);
    expect(t[1].cumulativeHours).toBe(3);
    expect(t[1].fameWait).toBeCloseTo(0.75, 12);
    expect(t[1].goldWait).toBeCloseTo(0.25, 12);
    expect(t[1].fameOverGold).toBeCloseTo(3, 12);
    expect(t[0].fameWait).toBe(2);
    expect(t[0].fameOverGold).toBeNull();
  });
});

describe('전환 보고', () => {
  const report = transitionReport({ axis: 'idle', loss4h: 25, maxDays: 365 });

  it('연속 방치와 네 유형의 전환 소요를 모두 담는다', () => {
    expect(report.rows).toHaveLength(SPOTS.length - 1);
    expect(report.continuous).toHaveLength(SPOTS.length - 1);
    expect(report.types.map(t => t.type.id)).toEqual(['h16', 'h8', 'h4', 'h2']);
    expect(report.types.every(t => t.complete)).toBe(true);
  });

  it('낚는 시간이 짧은 유형일수록 도착 일차가 같거나 늦다', () => {
    const last = (id: string) => report.types.find(t => t.type.id === id)!.steps.at(-1)!.day;
    expect(last('h2')).toBeGreaterThanOrEqual(last('h4'));
    expect(last('h4')).toBeGreaterThanOrEqual(last('h8'));
    expect(last('h8')).toBeGreaterThanOrEqual(last('h16'));
  });

  it('유형별 소요 일수는 도착 일차 차이다', () => {
    for (const t of report.types) {
      let prev = 1;
      for (const s of t.steps) { expect(s.days).toBe(s.day - prev); prev = s.day; }
    }
  });
});
