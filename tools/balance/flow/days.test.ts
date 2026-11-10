import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { capOfBoat } from '../../../src/game/rules/logic';
import { upgradeCost } from '../../../src/game/rules/balance';
import { BOATS } from '../../../src/game/content/boats';
import { entryLevel, rates } from '../model';
import { arrivalDays, levelUpDays, steadyDaily } from './days';

const o = { axis: 'idle' as const, loss4h: 25, maxDays: 365 };
const last = SPOTS[SPOTS.length - 1].id;

describe('도착 일수', () => {
  const rows = arrivalDays(o);
  const pick = (type: string, bounty: boolean) => rows.find(r => r.type.id === type && r.bounty === bounty)!;

  it('네 유형을 의뢰 안 함, 모두 수행 순서로 낸다', () => {
    expect(rows.map(r => `${r.type.id}:${r.bounty}`)).toEqual([
      'h16:false', 'h16:true', 'h8:false', 'h8:true', 'h4-75:false', 'h4-75:true', 'h2:false', 'h2:true', 'h1:false', 'h1:true',
    ]);
    expect(rows.every(r => r.complete)).toBe(true);
  });

  it('모든 해역에 도착 일차가 있고 첫 해역은 1일째이며 순서대로 줄지 않는다', () => {
    for (const r of rows) {
      expect(r.days.map(d => d.spot)).toEqual(SPOTS.map(s => s.id));
      expect(r.days[0].day).toBe(1);
      for (let i = 1; i < r.days.length; i++) expect(r.days[i].day!).toBeGreaterThanOrEqual(r.days[i - 1].day!);
    }
  });

  it('의뢰와 토벌을 수행하면 마지막 해역에 더 빨리 도착한다', () => {
    for (const t of ['h16', 'h8', 'h4-75', 'h2', 'h1']) {
      expect(pick(t, true).days.at(-1)!.day!, t).toBeLessThanOrEqual(pick(t, false).days.at(-1)!.day!);
    }
    expect(pick('h4-75', true).days.at(-1)!.day!).toBeLessThan(pick('h4-75', false).days.at(-1)!.day!);
  });

  it('낚는 시간이 짧을수록 늦게 도착한다', () => {
    const end = (t: string) => pick(t, false).days.at(-1)!.day!;
    expect(end('h16')).toBeLessThanOrEqual(end('h8'));
    expect(end('h8')).toBeLessThanOrEqual(end('h4-75'));
    expect(end('h4-75')).toBeLessThanOrEqual(end('h2'));
    expect(end('h2')).toBeLessThanOrEqual(end('h1'));
  });

  it('최대 일수 안에 못 닿은 해역은 null이고 완료가 아니다', () => {
    const short = arrivalDays({ ...o, maxDays: 3 }).find(r => r.type.id === 'h1' && !r.bounty)!;
    expect(short.complete).toBe(false);
    expect(short.days.at(-1)!.day).toBeNull();
    expect(short.days[0].day).toBe(1);
  });
});

describe('마지막 해역 레벨업 일수', () => {
  const rows = levelUpDays(o);
  const pick = (type: string, bounty: boolean, level: number) =>
    rows.find(r => r.type.id === type && r.bounty === bounty && r.level === level)!;
  const l0 = entryLevel(last), l4 = l0 + 4;

  it('마지막 해역 진입 레벨과 +4를 유형과 수행 여부마다 낸다', () => {
    expect(rows).toHaveLength(2 * 2 * 5);
    expect(new Set(rows.map(r => r.level))).toEqual(new Set([l0, l4]));
  });

  it('의뢰 없이 8시간이면 강화비를 하루 낚시 8시간 수입으로 나눈 값이다', () => {
    const r = pick('h8', false, l0);
    expect(r.days!).toBeCloseTo(upgradeCost(l0) / (8 * rates(last, l0, 'idle').goldPerHour), 9);
    expect(r.bountyShare).toBe(0);
  });

  it('16시간은 잠든 동안 가방이 찰 때까지의 방치 수입이 더해진다', () => {
    const g = rates(last, l0, 'idle');
    const cap = capOfBoat(BOATS.length);
    const sleepHours = Math.min(8, cap / g.catchesPerHour);
    expect(pick('h16', false, l0).dailyGold).toBeCloseTo(g.goldPerHour * (8 + sleepHours), 6);
    expect(sleepHours).toBeLessThan(8);
  });

  it('의뢰와 토벌을 수행하면 일수가 줄고 보상 비중이 있다. 단 짧은 유형의 +4 레벨은 의뢰 보상이 강화비를 줄이지 못해 같다', () => {
    const same = (t: string, l: number) => ['h2', 'h1'].includes(t) && l === l4;
    for (const t of ['h16', 'h8', 'h4-75', 'h2', 'h1']) {
      for (const l of [l0, l4]) {
        const on = pick(t, true, l), off = pick(t, false, l);
        if (same(t, l)) {
          expect(on.days!, `${t} ${l}`).toBe(off.days!);
          expect(on.bountyShare!, `${t} ${l}`).toBe(0);
        } else {
          expect(on.days!, `${t} ${l}`).toBeLessThan(off.days!);
          expect(on.bountyShare!, `${t} ${l}`).toBeGreaterThan(0);
        }
        expect(on.bountyShare!).toBeLessThan(1);
      }
    }
  });

  it('레벨업은 그 시점에 시뮬레이션에서 실제로 가진 라이선스로 계산한다', () => {
    const r = pick('h4-75', true, l0);
    expect(r.licenses).not.toContain('southatlantic:named');
    expect(r.licenses.length).toBeGreaterThan(0);
    expect(pick('h4-75', false, l0).licenses).toEqual([]);
    expect(pick('h4-75', true, l4).licenses.length).toBeGreaterThanOrEqual(r.licenses.length);
  });

  it('모든 라이선스를 가정한 값보다 일수가 길다', () => {
    const real = pick('h4-75', true, l0);
    const all = steadyDaily({ level: l0, type: real.type, licensed: () => true, axis: 'idle', bagCapAwake: false });
    expect(real.dailyGold!).toBeLessThan(all.dailyGold);
    expect(real.days!).toBeGreaterThan(real.upgradeGold / all.dailyGold);
  });

  it('깨어 있는 동안 가방 한도를 적용하면 의뢰 없는 일수가 늘어난다', () => {
    const capped = levelUpDays({ ...o, bagCapAwake: true }).find(x => x.type.id === 'h8' && !x.bounty && x.level === l0)!;
    expect(capped.days!).toBeGreaterThan(pick('h8', false, l0).days!);
  });

  it('낚는 시간이 짧을수록 일수가 늘고 +4 레벨이 더 오래 걸린다', () => {
    expect(pick('h2', false, l0).days!).toBeGreaterThan(pick('h4-75', false, l0).days!);
    expect(pick('h4-75', false, l0).days!).toBeGreaterThan(pick('h8', false, l0).days!);
    expect(pick('h8', false, l4).days!).toBeGreaterThan(pick('h8', false, l0).days!);
  });
});

describe('이동 보정', () => {
  const real = levelUpDays(o).find(x => x.type.id === 'h8' && !x.bounty)!;

  it('이동 비중만큼 깨어 있는 낚시 골드가 준다', () => {
    const at = (travelShare: number) => steadyDaily({ level: real.level, type: real.type, licensed: null, axis: 'idle', bagCapAwake: false, travelShare });
    expect(at(0.1).dailyGold / at(0).dailyGold).toBeCloseTo(0.9, 9);
  });

  it('이동 비중을 주면 레벨업 일수가 늘어난다', () => {
    const moved = levelUpDays({ ...o, travelShare: 0.1 }).find(x => x.type.id === 'h8' && !x.bounty && x.level === real.level)!;
    expect(moved.days! / real.days!).toBeCloseTo(1 / 0.9, 2);
  });
});
