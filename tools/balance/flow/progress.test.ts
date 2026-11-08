import { describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import { entryLevel } from '../model';
import { applyOverride } from './override';
import { DEFAULT_LOSS4H, ALWAYS_ON, playTypes, simulate, sleepAccrual, sleepFishSeconds } from './progress';
import type { PlayType } from './progress';

const TYPES = playTypes(DEFAULT_LOSS4H);
const type = (id: string): PlayType => TYPES.find(t => t.id === id)!;
const last = <T>(xs: T[]) => xs[xs.length - 1];

describe('플레이 유형', () => {
  it('유형이 16, 8, 4, 2, 1시간이고 16시간만 잠든 동안 낚는다', () => {
    expect(TYPES.map(t => t.id)).toEqual(['h16', 'h8', 'h4-75', 'h2', 'h1']);
    expect(TYPES.map(t => t.awakeHours)).toEqual([8, 8, 3, 2, 1]);
    expect(TYPES.map(t => t.sleepHours)).toEqual([8, 0, 0, 0, 0]);
  });

  it('낚지 못하는 비율을 생략하면 4시간 유형을 낚시 100%, 75%, 50% 세 가지로 낸다', () => {
    const all = playTypes();
    expect(all.map(t => t.id)).toEqual(['h16', 'h8', 'h4-100', 'h4-75', 'h4-50', 'h2', 'h1']);
    expect(all.filter(t => t.id.startsWith('h4')).map(t => t.awakeHours)).toEqual([4, 3, 2]);
  });

  it('4시간 유형은 낚지 못하는 비율만큼 실제 낚시 시간이 준다', () => {
    expect(playTypes(0).find(t => t.id === 'h4-100')!.awakeHours).toBe(4);
    expect(playTypes(50).find(t => t.id === 'h4-50')!.awakeHours).toBe(2);
    expect(playTypes(100).find(t => t.id === 'h4-0')!.awakeHours).toBe(0);
  });

  it('범위 밖 비율은 거부한다', () => {
    expect(() => playTypes(-1)).toThrow(/0에서 100/);
    expect(() => playTypes(101)).toThrow(/0에서 100/);
    expect(() => playTypes(Number.NaN)).toThrow(/0에서 100/);
  });
});

describe('잠든 동안의 낚시', () => {
  it('가방이 찰 때까지만 센다', () => {
    expect(sleepFishSeconds(8, 800, 8 * 3600)).toBeCloseTo(4000 / 800 * 3600, 6);
    expect(sleepFishSeconds(0, 400, 8 * 3600)).toBeCloseTo(60 / 400 * 3600, 6);
  });

  it('가방이 넉넉하면 잠든 시간 전체다', () => {
    expect(sleepFishSeconds(8, 100, 3600)).toBe(3600);
  });
});

describe('잠든 동안의 수입 집계', () => {
  it('가방이 차면 골드는 멈추지만 명성과 도감은 잠든 시간 내내 쌓인다', () => {
    const a = sleepAccrual(8, 800, 8 * 3600);
    expect(a.goldSec).toBeCloseTo(4000 / 800 * 3600, 6);
    expect(a.sec).toBe(8 * 3600);
    expect(a.goldSec).toBeLessThan(a.sec);
  });

  it('가방이 넉넉하면 골드도 잠든 시간 전체다', () => {
    expect(sleepAccrual(8, 100, 3600)).toEqual({ goldSec: 3600, sec: 3600 });
  });
});

describe('깨어 있는 동안 가방 한도', () => {
  const end = (bagCapAwake: boolean) =>
    last(simulate({ type: type('h8'), axis: 'idle', bounty: false, maxDays: 365, bagCapAwake }).arrivals).day;

  it('한도를 적용하면 8시간 유형이 더 늦게 끝난다', () => {
    expect(end(true)).toBeGreaterThan(end(false));
  });

  it('한도를 적용하지 않은 결과는 옵션을 생략한 결과와 같다', () => {
    const a = simulate({ type: type('h8'), axis: 'idle', bounty: false, maxDays: 365 });
    const b = simulate({ type: type('h8'), axis: 'idle', bounty: false, maxDays: 365, bagCapAwake: false });
    expect(b).toEqual(a);
  });
});

describe('레벨별 보유 라이선스', () => {
  const lastSpot = SPOTS[SPOTS.length - 1].id;
  const l0 = entryLevel(lastSpot);

  it('마지막 해역에 닿은 뒤 정한 레벨까지 강화하며 레벨마다 기록한다', () => {
    const r = simulate({ type: type('h4-75'), axis: 'idle', bounty: true, maxDays: 365, growTo: l0 + 4 });
    expect(r.marks.map(m => m.level)).toEqual([l0, l0 + 1, l0 + 2, l0 + 3, l0 + 4]);
    expect(r.marks[0].day).toBe(last(r.arrivals).day);
    for (let i = 1; i < r.marks.length; i++) expect(r.marks[i].day).toBeGreaterThanOrEqual(r.marks[i - 1].day);
  });

  it('4시간 유형은 세인트헬레나 도착 시 남대서양 네임드 라이선스가 없고 이후 늘어나기만 한다', () => {
    const r = simulate({ type: type('h4-75'), axis: 'idle', bounty: true, maxDays: 365, growTo: l0 + 4 });
    expect(r.marks[0].licenses).not.toContain('southatlantic:named');
    expect(r.marks[0].licenses).toContain('indian:기본');
    for (const l of r.marks[0].licenses) expect(r.marks.at(-1)!.licenses).toContain(l);
  });

  it('의뢰를 수행하지 않으면 라이선스 기록이 비어 있고, growTo를 주지 않으면 기록이 없다', () => {
    expect(simulate({ type: type('h8'), axis: 'idle', bounty: false, maxDays: 365, growTo: l0 }).marks[0].licenses).toEqual([]);
    expect(simulate({ type: type('h8'), axis: 'idle', bounty: true, maxDays: 365 }).marks).toEqual([]);
  });

  it('growTo는 도착 기록을 바꾸지 않는다', () => {
    const a = simulate({ type: type('h8'), axis: 'idle', bounty: true, maxDays: 365 });
    const b = simulate({ type: type('h8'), axis: 'idle', bounty: true, maxDays: 365, growTo: l0 + 4 });
    expect(b.arrivals).toEqual(a.arrivals);
  });
});

describe('진행 시뮬레이션', () => {
  const always = () => simulate({ type: ALWAYS_ON, axis: 'idle', bounty: false, maxDays: 365 });

  it('연속 방치로 모든 해역에 순서대로 도착한다', () => {
    const r = always();
    expect(r.complete).toBe(true);
    expect(r.arrivals.map(a => a.spot)).toEqual(SPOTS.map(s => s.id));
    expect(r.arrivals[0]).toMatchObject({ day: 1, hours: 0 });
    for (let i = 1; i < r.arrivals.length; i++) {
      expect(r.arrivals[i].hours).toBeGreaterThanOrEqual(r.arrivals[i - 1].hours);
      expect(r.arrivals[i].day).toBeGreaterThanOrEqual(r.arrivals[i - 1].day);
    }
  });

  it('기다린 시간은 도착 사이 낚시 시간을 넘지 않는다', () => {
    const r = always();
    for (let i = 1; i < r.arrivals.length; i++) {
      const a = r.arrivals[i], gap = a.hours - r.arrivals[i - 1].hours;
      expect(a.waitGold + a.waitFame + a.waitBoth, SPOTS[i].id).toBeLessThanOrEqual(gap + 1e-9);
    }
  });

  it('같은 입력은 같은 결과다', () => {
    expect(always()).toEqual(always());
  });

  it('낚는 시간이 짧은 유형일수록 늦게 끝난다', () => {
    const end = (id: string) => last(simulate({ type: type(id), axis: 'idle', bounty: false, maxDays: 365 }).arrivals).day;
    const days = ['h16', 'h8', 'h4-75', 'h2', 'h1'].map(end);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
    expect(days[4]).toBeGreaterThan(days[0]);
  });

  it('의뢰와 토벌을 수행하면 어느 해역에도 더 늦게 도착하지 않고 마지막은 더 빠르다', () => {
    const off = simulate({ type: type('h4-75'), axis: 'idle', bounty: false, maxDays: 365 });
    const on = simulate({ type: type('h4-75'), axis: 'idle', bounty: true, maxDays: 365 });
    expect(on.complete).toBe(true);
    for (let i = 0; i < off.arrivals.length; i++) expect(on.arrivals[i].day, SPOTS[i].id).toBeLessThanOrEqual(off.arrivals[i].day);
    expect(last(on.arrivals).day).toBeLessThan(last(off.arrivals).day);
    expect(on.bountyGold).toBeGreaterThan(0);
    expect(off.bountyGold).toBe(0);
  });

  it('수동 축은 같은 연속 낚시에서 방치보다 빨리 끝난다', () => {
    const manual = simulate({ type: ALWAYS_ON, axis: 'manual', bounty: false, maxDays: 365 });
    expect(last(manual.arrivals).hours).toBeLessThan(last(always().arrivals).hours);
  });

  it('최대 일수 안에 끝나지 않으면 완료가 아니라고 알린다', () => {
    const r = simulate({ type: type('h2'), axis: 'idle', bounty: false, maxDays: 2 });
    expect(r.complete).toBe(false);
    expect(r.arrivals.length).toBeLessThan(SPOTS.length);
  });

  it('배 가격 덮어쓰기는 도착을 늦춘다', () => {
    const base = last(always().arrivals).hours;
    const tier = String(BOATS[BOATS.length - 1].tier);
    const restore = applyOverride({ boats: { [tier]: { price: BOATS[BOATS.length - 1].price * 10 } } });
    try {
      expect(last(always().arrivals).hours).toBeGreaterThan(base);
    } finally { restore(); }
    expect(last(always().arrivals).hours).toBe(base);
  });
});
