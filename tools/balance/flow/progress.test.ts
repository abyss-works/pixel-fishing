import { describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import { entryLevel } from '../model';
import { applyOverride } from './override';
import { DAY_HOURS, fishingDays, simulate } from './progress';

const last = <T>(xs: T[]) => xs[xs.length - 1];
const run = (o: Partial<Parameters<typeof simulate>[0]> = {}) => simulate({ axis: 'idle', bounty: false, maxDays: 365, ...o });

describe('8시간 환산', () => {
  it('환산 기준은 8시간 하나다', () => {
    expect(DAY_HOURS).toBe(8);
  });

  it('실질 낚시 시간을 8로 나눈 값이 일수다', () => {
    expect(fishingDays(12)).toBe(1.5);
    expect(fishingDays(40)).toBe(5);
    expect(fishingDays(0)).toBe(0);
  });
});

describe('기본 상수 회귀', () => {
  it('스냅샷: 마지막 해역까지 약 34시간 걸린다(밸런스가 바뀌면 갱신)', () => {
    const hours = last(run().arrivals).hours;
    expect(hours).toBeGreaterThan(33);
    expect(hours).toBeLessThan(35);
  });

  it('스냅샷: 의뢰와 토벌을 수행하면 마지막 해역에 약 28시간에 닿는다(밸런스가 바뀌면 갱신)', () => {
    const hours = last(run({ bounty: true }).arrivals).hours;
    expect(hours).toBeGreaterThan(27);
    expect(hours).toBeLessThan(29);
  });
});

describe('레벨별 보유 라이선스', () => {
  const lastSpot = SPOTS[SPOTS.length - 1].id;
  const l0 = entryLevel(lastSpot);

  it('마지막 해역에 닿은 뒤 정한 레벨까지 강화하며 레벨마다 기록한다', () => {
    const r = run({ bounty: true, growTo: l0 + 4 });
    expect(r.marks.map(m => m.level)).toEqual([l0, l0 + 1, l0 + 2, l0 + 3, l0 + 4]);
    expect(r.marks[0].hours).toBe(last(r.arrivals).hours);
    for (let i = 1; i < r.marks.length; i++) expect(r.marks[i].hours).toBeGreaterThanOrEqual(r.marks[i - 1].hours);
  });

  it('쓸 수 있는 라이선스는 이후 늘어나기만 한다', () => {
    const r = run({ bounty: true, growTo: l0 + 4 });
    expect(r.marks[0].licenses).toContain('indian:기본');
    for (const l of r.marks[0].licenses) expect(r.marks.at(-1)!.licenses).toContain(l);
  });

  it('의뢰를 수행하지 않으면 라이선스 기록이 비어 있고, growTo를 주지 않으면 기록이 없다', () => {
    expect(run({ growTo: l0 }).marks[0].licenses).toEqual([]);
    expect(run({ bounty: true }).marks).toEqual([]);
  });

  it('growTo는 도착 기록을 바꾸지 않는다', () => {
    expect(run({ bounty: true, growTo: l0 + 4 }).arrivals).toEqual(run({ bounty: true }).arrivals);
  });
});

describe('진행 시뮬레이션', () => {
  it('모든 해역에 순서대로 도착한다', () => {
    const r = run();
    expect(r.complete).toBe(true);
    expect(r.arrivals.map(a => a.spot)).toEqual(SPOTS.map(s => s.id));
    expect(r.arrivals[0].hours).toBe(0);
    for (let i = 1; i < r.arrivals.length; i++) expect(r.arrivals[i].hours).toBeGreaterThanOrEqual(r.arrivals[i - 1].hours);
  });

  it('기다린 시간은 도착 사이 낚시 시간을 넘지 않는다', () => {
    const r = run();
    for (let i = 1; i < r.arrivals.length; i++) {
      const a = r.arrivals[i], gap = a.hours - r.arrivals[i - 1].hours;
      expect(a.waitGold + a.waitFame + a.waitBoth, SPOTS[i].id).toBeLessThanOrEqual(gap + 1e-9);
    }
  });

  it('같은 입력은 같은 결과다', () => {
    expect(run()).toEqual(run());
  });

  it('의뢰와 토벌을 수행하면 어느 해역에도 5%를 넘겨 늦게 도착하지 않고 마지막은 더 빠르다', () => {
    const off = run(), on = run({ bounty: true });
    expect(on.complete).toBe(true);
    for (let i = 0; i < off.arrivals.length; i++) expect(on.arrivals[i].hours, SPOTS[i].id).toBeLessThanOrEqual(off.arrivals[i].hours * 1.05 + 1e-9);
    expect(last(on.arrivals).hours).toBeLessThan(last(off.arrivals).hours);
    expect(on.bountyGold).toBeGreaterThan(0);
    expect(off.bountyGold).toBe(0);
  });

  it('수동 축은 같은 낚시 시간에서 방치보다 빨리 끝난다', () => {
    expect(last(run({ axis: 'manual' }).arrivals).hours).toBeLessThan(last(run().arrivals).hours);
  });

  it('최대 일수 안에 끝나지 않으면 완료가 아니라고 알린다', () => {
    const r = run({ maxDays: 2 });
    expect(r.complete).toBe(false);
    expect(r.arrivals.length).toBeLessThan(SPOTS.length);
    expect(last(r.arrivals).hours).toBeLessThanOrEqual(2 * DAY_HOURS);
  });

  it('배 가격 덮어쓰기는 도착을 늦춘다', () => {
    const base = last(run().arrivals).hours;
    // 마지막 해역을 여는 배의 가격을 올린다
    const opener = BOATS.find(b => b.tier === SPOTS[SPOTS.length - 1].boatTier)!;
    const restore = applyOverride({ boats: { [String(opener.tier)]: { price: opener.price * 10 } } });
    try {
      expect(last(run().arrivals).hours).toBeGreaterThan(base);
    } finally { restore(); }
    expect(last(run().arrivals).hours).toBe(base);
  });
});
