import { afterEach, describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { entryLevel, rates } from '../model';
import { powerOfLevel } from '../rodRules';
import { applyOverride, parseOverride } from './override';
import { fameRows, levelRows, purchaseRows } from './tables';
import { transitionGold } from './transitions';

describe('레벨별 강화 표', () => {
  it('강화비와 누적 비용은 제품 강화비 함수의 합이다', () => {
    const rows = levelRows(1, 30);
    expect(rows.length).toBe(30);
    let cum = 0;
    for (const r of rows) {
      expect(r.cost).toBe(upgradeCost(r.level));
      expect(r.cumulative).toBe(cum);
      expect(r.power).toBe(powerOfLevel(r.level));
      cum += upgradeCost(r.level);
    }
  });

  it('그 레벨에서 열린 가장 뒤 해역의 방치 EV와 다음 레벨 EV 변화, 강화비 ÷ EV를 낸다', () => {
    const r = levelRows(18, 18)[0];
    expect(r.spot).toBe('southindian');
    const ev = rates('southindian', 18, 'idle').goldPerHour;
    expect(r.ev).toBe(ev);
    expect(r.evGain).toBeCloseTo(rates('southindian', 19, 'idle').goldPerHour / ev - 1, 12);
    expect(r.costHours).toBeCloseTo(upgradeCost(18) / ev, 12);
  });

  it('첫 해역의 요구 파워 미만 레벨은 첫 해역으로 잰다', () => {
    expect(levelRows(1, 1)[0].spot).toBe('pond');
  });

  it('범위가 거꾸로이거나 정수가 아니면 거부한다', () => {
    expect(() => levelRows(5, 4)).toThrow('범위');
    expect(() => levelRows(0, 4)).toThrow('1 이상');
    expect(() => levelRows(1.5, 4)).toThrow('정수');
  });
});

describe('전환당 구매 횟수', () => {
  it('전환마다 강화 횟수(진입 레벨 차), 배 수, 합계와 누적을 낸다', () => {
    const rows = purchaseRows();
    const gold = transitionGold();
    expect(rows.length).toBe(gold.length);
    let cum = 0;
    rows.forEach((r, i) => {
      expect(r.upgrades).toBe(entryLevel(SPOTS[i + 1].id) - entryLevel(SPOTS[i].id));
      expect(r.boats).toBe(gold[i].boats.length);
      expect(r.total).toBe(r.upgrades + r.boats);
      cum += r.total;
      expect(r.cumulative).toBe(cum);
    });
  });
});

describe('누적 명성 곡선', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  it('전환마다 도착 시 보유 배의 명성 요구치(누적)와 직전 대비 증분, 증분을 모으는 시간을 낸다', () => {
    const rows = fameRows();
    expect(rows.length).toBe(SPOTS.length - 1);
    const t1 = rows.find(r => r.from === 'southindian')!;
    expect(t1.cumulative).toBe(BOATS.find(b => b.tier === 7)!.fameReq);
    expect(t1.previous).toBe(BOATS.find(b => b.tier === 6)!.fameReq);
    expect(t1.increment).toBe(t1.cumulative - t1.previous);
    const fph = rates('southindian', entryLevel('southindian'), 'idle').famePerHour;
    expect(t1.famePerHour).toBe(fph);
    expect(t1.hours).toBeCloseTo(t1.increment / fph, 12);
  });

  it('배를 사지 않는 전환은 증분이 0이다', () => {
    const r = fameRows().find(x => x.from === 'mozstrait')!;
    expect(r.increment).toBe(0);
    expect(r.hours).toBe(0);
  });

  it('골드 시간(전환 골드 ÷ 직전 해역 딱렙 EV)과 명성 시간 비율을 같이 낸다', () => {
    const r = fameRows().find(x => x.from === 'southindian')!;
    const g = transitionGold().find(x => x.from === 'southindian')!;
    expect(r.goldHours).toBeCloseTo(g.totalGold / rates('southindian', entryLevel('southindian'), 'idle').goldPerHour, 12);
    expect(r.fameOverGold).toBeCloseTo(r.hours / r.goldHours, 12);
  });

  it('가상 해역과 새 배를 더하면 그 전환까지 곡선이 이어진다', () => {
    restore = applyOverride(parseOverride({ addSpots: [{ id: 'next', like: 'sthelena', powerReq: 170, zone: 'z', boat: { price: 5000000, fameReq: 400000 } }] }));
    const last = fameRows().at(-1)!;
    expect(last.to).toBe('next');
    expect(last.cumulative).toBe(400000);
    expect(last.previous).toBe(200000);
    expect(last.increment).toBe(200000);
  });
});
