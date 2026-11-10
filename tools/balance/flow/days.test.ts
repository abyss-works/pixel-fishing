import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { entryLevel, rates } from '../model';
import { daysReport, steadyDaily } from './days';
import { DAY_HOURS } from './progress';

const o = { axis: 'idle' as const, maxDays: 365 };
const last = SPOTS[SPOTS.length - 1].id;

describe('해역별 누적 도달', () => {
  const rows = daysReport(o).arrival;
  const pick = (bounty: boolean) => rows.find(r => r.bounty === bounty)!;

  it('의뢰 안 함, 모두 수행 두 경우만 낸다', () => {
    expect(rows.map(r => r.bounty)).toEqual([false, true]);
    expect(rows.every(r => r.complete)).toBe(true);
  });

  it('모든 해역에 누적 실질 낚시 시간이 있고 첫 해역은 0이며 순서대로 줄지 않는다', () => {
    for (const r of rows) {
      expect(r.spots.map(d => d.spot)).toEqual(SPOTS.map(s => s.id));
      expect(r.spots[0].hours).toBe(0);
      for (let i = 1; i < r.spots.length; i++) expect(r.spots[i].hours!).toBeGreaterThanOrEqual(r.spots[i - 1].hours!);
    }
  });

  it('일수는 누적 실질 낚시 시간을 8로 나눈 값 하나다', () => {
    for (const r of rows) for (const d of r.spots) expect(d.days).toBe(d.hours! / DAY_HOURS);
  });

  it('의뢰와 토벌을 수행하면 마지막 해역에 더 빨리 도착한다', () => {
    expect(pick(true).spots.at(-1)!.hours!).toBeLessThan(pick(false).spots.at(-1)!.hours!);
  });

  it('최대 일수 안에 못 닿은 해역은 null이고 완료가 아니다', () => {
    const short = daysReport({ ...o, maxDays: 1 }).arrival.find(r => !r.bounty)!;
    expect(short.complete).toBe(false);
    expect(short.spots.at(-1)).toMatchObject({ hours: null, days: null });
    expect(short.spots[0].hours).toBe(0);
  });
});

describe('마지막 해역 레벨업 시간', () => {
  const rows = daysReport(o).levelUp;
  const pick = (bounty: boolean, level: number) => rows.find(r => r.bounty === bounty && r.level === level)!;
  const l0 = entryLevel(last), l4 = l0 + 4;

  it('마지막 해역 진입 레벨과 +4를 수행 여부마다 낸다', () => {
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map(r => r.level))).toEqual(new Set([l0, l4]));
  });

  it('의뢰 없이 낚으면 강화비를 시간당 방치 수입으로 나눈 시간이고 일수는 그 시간 ÷ 8이다', () => {
    const r = pick(false, l0);
    expect(r.hours!).toBeCloseTo(upgradeCost(l0) / rates(last, l0, 'idle').goldPerHour, 9);
    expect(r.days!).toBeCloseTo(r.hours! / DAY_HOURS, 9);
    expect(r.bountyShare).toBe(0);
  });

  it('의뢰와 토벌을 수행하면 시간이 줄고 보상 비중이 있다', () => {
    for (const l of [l0, l4]) {
      const on = pick(true, l), off = pick(false, l);
      expect(on.hours!, `${l}`).toBeLessThan(off.hours!);
      expect(on.bountyShare!, `${l}`).toBeGreaterThan(0);
      expect(on.bountyShare!).toBeLessThan(1);
    }
  });

  it('레벨업은 그 시점에 시뮬레이션에서 실제로 가진 라이선스로 계산한다', () => {
    const r = pick(true, l0);
    expect(r.licenses.length).toBeGreaterThan(0);
    expect(pick(false, l0).licenses).toEqual([]);
    expect(pick(true, l4).licenses.length).toBeGreaterThanOrEqual(r.licenses.length);
  });

  it('모든 라이선스를 가정한 값보다 시간이 길다', () => {
    const real = pick(true, l0);
    const all = steadyDaily({ level: l0, licensed: () => true, axis: 'idle' });
    expect(real.dailyGold!).toBeLessThan(all.dailyGold);
    expect(real.days!).toBeGreaterThan(real.upgradeGold / all.dailyGold);
  });

  it('+4 레벨이 더 오래 걸린다', () => {
    expect(pick(false, l4).hours!).toBeGreaterThan(pick(false, l0).hours!);
  });
});
