import { afterEach, describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/game/content/boats';
import { FISH } from '../../../src/game/content/fish';
import { SPOTS } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { entryLevel, rates, zoneOf } from '../model';
import { simulate } from './progress';
import { transitionGold, transitionReport } from './transitions';
import { applyOverride, ladderPrice, parseOverride } from './override';

describe('가상 해역과 지역 추가', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  const idle = (spot: string) => rates(spot as never, entryLevel(spot as never), 'idle').goldPerHour;
  const fishOf = (spot: string) => FISH.filter(f => f.spot === spot);

  it('가상 해역을 끝에 더하고 새 배를 더하며, 복원하면 모두 사라진다', () => {
    const spots = SPOTS.length, boats = BOATS.length, fish = FISH.length;
    restore = applyOverride(parseOverride({
      addSpots: [{ id: 'next', name: '다음 해역', like: 'sthelena', powerReq: 170, zone: 'newregion', priceMult: 1.5, boat: { price: 5000000, fameReq: 400000 } }],
    }));
    expect(SPOTS.length).toBe(spots + 1);
    expect(BOATS.length).toBe(boats + 1);
    const last = SPOTS.at(-1)!, boat = BOATS.at(-1)!;
    expect(last.id).toBe('next');
    expect(last.powerReq).toBe(170);
    expect(last.boatTier).toBe(boat.tier);
    expect(boat.price).toBe(5000000);
    expect(boat.fameReq).toBe(400000);
    expect(fishOf('next').length).toBe(fishOf('sthelena').length);
    expect(zoneOf('next' as never)).toBe('newregion');
    restore();
    restore = null;
    expect(SPOTS.length).toBe(spots);
    expect(BOATS.length).toBe(boats);
    expect(FISH.length).toBe(fish);
    expect(zoneOf('next' as never)).toBe('unknown');
  });

  it('EV 배율은 기준 해역과 같은 어종 구성의 가격에 곱한다', () => {
    restore = applyOverride(parseOverride({ addSpots: [{ id: 'next', like: 'sthelena', powerReq: 140, priceMult: 1.4 }] }));
    // 같은 요구 파워이므로 같은 레벨에서 수입이 정확히 배율만큼 다르다
    expect(idle('next') / idle('sthelena')).toBeCloseTo(1.4, 10);
  });

  it('증가율 g는 기준 해역 딱렙 EV의 (1+g)배가 되도록 가격을 맞춘다', () => {
    restore = applyOverride(parseOverride({ addSpots: [{ id: 'next', like: 'sthelena', ref: 'sthelena', powerReq: 170, growth: 0.45 }] }));
    expect(idle('next')).toBeCloseTo(idle('sthelena') * 1.45, 4);
  });

  it('기준 해역을 생략하면 증가율의 기준은 그때 마지막 해역이다', () => {
    restore = applyOverride(parseOverride({ addSpots: [{ id: 'next', like: 'sthelena', powerReq: 170, growth: 0.5 }] }));
    expect(idle('next')).toBeCloseTo(idle('sthelena') * 1.5, 4);
  });

  it('가상 해역이 여럿이면 앞에서 뒤로 더하고 뒤 해역은 앞 가상 해역을 기준으로 삼을 수 있다', () => {
    restore = applyOverride(parseOverride({
      addSpots: [
        { id: 'a1', like: 'sthelena', powerReq: 170, growth: 0.4, boat: { price: 5000000, fameReq: 300000 } },
        { id: 'a2', like: 'a1', powerReq: 185, growth: 0.3 },
      ],
    }));
    expect(SPOTS.slice(-2).map(s => s.id)).toEqual(['a1', 'a2']);
    expect(idle('a2')).toBeCloseTo(idle('a1') * 1.3, 4);
    expect(SPOTS.at(-1)!.boatTier).toBe(SPOTS.at(-2)!.boatTier);
  });

  it('전환 골드와 진행 시뮬레이션이 가상 해역까지 이어진다', () => {
    restore = applyOverride(parseOverride({
      addSpots: [{ id: 'next', like: 'sthelena', powerReq: 170, zone: 'newregion', growth: 0.45, boat: { price: 5000000, fameReq: 400000 } }],
    }));
    const row = transitionGold().at(-1)!;
    expect(row.from).toBe('sthelena');
    expect(row.to).toBe('next');
    expect(row.boatGold).toBe(5000000);
    let up = 0;
    for (let lv = entryLevel('sthelena' as never); lv < entryLevel('next' as never); lv++) up += upgradeCost(lv);
    expect(row.upgradeGold).toBe(up);
    expect(row.fameReq).toBe(400000);
    const sim = simulate({ axis: 'idle', bounty: false, maxDays: 365 });
    expect(sim.arrivals.at(-1)!.spot).toBe('next');
    expect(sim.complete).toBe(true);
    const t = transitionReport({ axis: 'idle', maxDays: 365 });
    expect(t.timings.length).toBe(t.rows.length);
    expect(t.timings.at(-1)!.hours).toBeGreaterThan(0);
  });

  it('가상 배(제품 배 상한 위)도 골드와 명성 조건을 채워야 산다', () => {
    const base = { id: 'next', like: 'sthelena', powerReq: 170, zone: 'z' };
    restore = applyOverride(parseOverride({ addSpots: [{ ...base, boat: { price: 5000000, fameReq: 1e12 } }] }));
    expect(simulate({ axis: 'idle', bounty: false, maxDays: 365 }).complete).toBe(false);
    restore();
    restore = applyOverride(parseOverride({ addSpots: [{ ...base, boat: { price: 1e15, fameReq: 400000 } }] }));
    expect(simulate({ axis: 'idle', bounty: false, maxDays: 365 }).complete).toBe(false);
    restore();
    restore = applyOverride(parseOverride({ addSpots: [{ ...base, boat: { price: 5000000, fameReq: 400000 } }] }));
    expect(simulate({ axis: 'idle', bounty: false, maxDays: 365 }).complete).toBe(true);
  });

  it('가상 해역이 없으면 같은 조건의 결과가 변하지 않는다', () => {
    const before = JSON.stringify(transitionReport({ axis: 'idle', maxDays: 365 }));
    restore = applyOverride(parseOverride({ addSpots: [{ id: 'next', like: 'sthelena', powerReq: 170, growth: 0.45 }] }));
    restore();
    restore = null;
    expect(JSON.stringify(transitionReport({ axis: 'idle', maxDays: 365 }))).toBe(before);
  });

  it('잘못된 입력을 거부한다', () => {
    const bad = (spot: object) => () => parseOverride({ addSpots: [spot] });
    expect(bad({ like: 'sthelena', powerReq: 170 })).toThrow('id');
    expect(bad({ id: 'sea', like: 'sthelena', powerReq: 170 })).toThrow('이미');
    expect(bad({ id: 'x', like: 'nope', powerReq: 170 })).toThrow('없는 해역');
    expect(bad({ id: 'x', like: 'sthelena' })).toThrow('powerReq');
    expect(bad({ id: 'x', like: 'sthelena', powerReq: 170, priceMult: 1.2, growth: 0.1 })).toThrow('함께');
    expect(bad({ id: 'x', like: 'sthelena', powerReq: 170, growth: -1 })).toThrow('growth');
    expect(bad({ id: 'x', like: 'sthelena', powerReq: 170, priceMult: 0 })).toThrow('priceMult');
    expect(bad({ id: 'x', like: 'sthelena', powerReq: 170, boat: { price: 1 } })).toThrow('fameReq');
    expect(bad({ id: 'x', like: 'sthelena', powerReq: 170, nope: 1 })).toThrow('알 수 없는 키');
    expect(() => parseOverride({ addSpots: [{ id: 'x', like: 'sthelena', powerReq: 170 }, { id: 'x', like: 'sthelena', powerReq: 180 }] })).toThrow('두 번');
  });
});

describe('해역별 등급별 가격 배율', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });
  const prices = (spot: string) => FISH.filter(f => f.spot === spot).map(f => f.price);

  it('등급마다 다른 배율을 그 해역 어종에만 곱하고 가격 사다리로 맞춘다', () => {
    const before = prices('sea'), other = prices('deep');
    restore = applyOverride(parseOverride({ spots: { sea: { gradeMult: { common: 2, legendary: 0.5 } } } }));
    const sea = FISH.filter(f => f.spot === 'sea');
    for (const f of sea) {
      const orig = before[sea.indexOf(f)];
      if (f.rarity === 'common') expect(f.price).toBe(Math.round(orig * 2));
      else if (f.rarity === 'legendary') expect(f.price).toBe(ladderPrice(orig * 0.5, 'legendary'));
      else expect(f.price).toBe(orig);
    }
    expect(sea.some(f => f.rarity === 'common')).toBe(true);
    expect(sea.some(f => f.rarity === 'legendary')).toBe(true);
    expect(prices('deep')).toEqual(other);
    restore();
    restore = null;
    expect(prices('sea')).toEqual(before);
  });

  it('priceMult와 함께 주면 두 배율을 곱한 뒤 한 번만 사다리로 맞춘다', () => {
    const before = FISH.filter(f => f.spot === 'sea').map(f => ({ id: f.id, price: f.price, rarity: f.rarity }));
    restore = applyOverride(parseOverride({ spots: { sea: { priceMult: 1.5, gradeMult: { common: 2 } } } }));
    const commons = before.filter(x => x.rarity === 'common');
    expect(commons.length).toBeGreaterThan(0);
    for (const b of commons) expect(FISH.find(f => f.id === b.id)!.price).toBe(Math.round(b.price * 3));
  });

  it('알 수 없는 등급과 0 이하 배율을 거부한다', () => {
    expect(() => parseOverride({ spots: { sea: { gradeMult: { mythic: 2 } } } })).toThrow('등급');
    expect(() => parseOverride({ spots: { sea: { gradeMult: { common: 0 } } } })).toThrow('0보다');
  });
});

describe('낚싯대 규칙 덮어쓰기 입력', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  it('rod를 덮어쓰기에서 받아 진입 레벨과 강화비에 반영하고 복원한다', () => {
    const entry = entryLevel('sea');
    restore = applyOverride(parseOverride({ rod: { powerPerLevel: 2.5, costGrowth: 1.5 } }));
    expect(entryLevel('sea')).toBeGreaterThan(entry);
    restore();
    restore = null;
    expect(entryLevel('sea')).toBe(entry);
  });
});
