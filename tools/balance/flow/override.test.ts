import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import { FISH } from '../../../src/game/content/fish';
import { entryLevel, rates } from '../model';
import { applyOverride, ladderPrice, loadOverride, parseOverride } from './override';

const boat = (tier: number) => BOATS.find(b => b.tier === tier)!;
const spot = (id: string) => SPOTS.find(s => s.id === id)!;

describe('밸런스 덮어쓰기', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  it('배 가격·명성과 해역 요구 파워를 바꾸고 복원 함수로 되돌린다', () => {
    const before = { ...boat(2) }, entry = entryLevel('sea'), req = spot('sea').powerReq;
    restore = applyOverride({ boats: { '2': { price: 1, fameReq: 2 } }, spots: { sea: { powerReq: 45 } } });
    expect(boat(2).price).toBe(1);
    expect(boat(2).fameReq).toBe(2);
    expect(boat(2).name).toBe(before.name);
    expect(spot('sea').powerReq).toBe(45);
    expect(entryLevel('sea')).toBe(8);
    restore();
    restore = null;
    expect(boat(2)).toEqual(before);
    expect(spot('sea').powerReq).toBe(req);
    expect(entryLevel('sea')).toBe(entry);
  });

  it('일부 필드만 주면 나머지는 그대로다', () => {
    const fame = boat(3).fameReq;
    restore = applyOverride({ boats: { '3': { price: 7 } } });
    expect(boat(3).price).toBe(7);
    expect(boat(3).fameReq).toBe(fame);
  });

  it('빈 덮어쓰기는 아무것도 바꾸지 않는다', () => {
    const snapshot = JSON.stringify([BOATS, SPOTS]);
    restore = applyOverride({});
    expect(JSON.stringify([BOATS, SPOTS])).toBe(snapshot);
  });

  it('없는 배 단계, 없는 해역, 음수와 숫자가 아닌 값, 모르는 키를 거부한다', () => {
    expect(() => parseOverride({ boats: { '99': { price: 1 } } })).toThrow(/배 단계/);
    expect(() => parseOverride({ spots: { nowhere: { powerReq: 1 } } })).toThrow(/해역/);
    expect(() => parseOverride({ boats: { '1': { price: -1 } } })).toThrow(/0 이상/);
    expect(() => parseOverride({ boats: { '1': { price: '3' } } })).toThrow(/숫자/);
    expect(() => parseOverride({ boats: { '1': { speed: 3 } } })).toThrow(/키/);
    expect(() => parseOverride({ wrong: {} })).toThrow(/키/);
    expect(() => parseOverride([])).toThrow(/객체/);
  });

  it('유효한 입력은 그대로 돌려준다', () => {
    const o = { boats: { '1': { price: 10 } }, spots: { sea: { powerReq: 30 } } };
    expect(parseOverride(o)).toEqual(o);
  });

  it('파일에서 읽고, 없는 파일과 깨진 JSON은 알아볼 수 있게 실패한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-override-'));
    const ok = join(dir, 'ok.json'), bad = join(dir, 'bad.json');
    writeFileSync(ok, '{"boats":{"1":{"price":5}}}', 'utf-8');
    writeFileSync(bad, '{', 'utf-8');
    expect(loadOverride(ok)).toEqual({ boats: { '1': { price: 5 } } });
    expect(() => loadOverride(join(dir, 'none.json'))).toThrow(/읽을 수 없습니다/);
    expect(() => loadOverride(bad)).toThrow(/JSON/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('어종 가격 배율 덮어쓰기', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });
  const fishOf = (id: string) => FISH.filter(f => f.spot === id);

  it('가격 사다리: 일반은 정수, 희귀 이상은 두 자리 수면 5 단위, 세 자리 이상이면 앞 두 자리 유효숫자로 가장 가까운 값이다', () => {
    expect(ladderPrice(5.1, 'common')).toBe(5);
    expect(ladderPrice(25.4, 'rare')).toBe(25);
    expect(ladderPrice(27.6, 'epic')).toBe(30);
    expect(ladderPrice(102, 'epic')).toBe(100);
    expect(ladderPrice(425, 'legendary')).toBe(430);
    expect(ladderPrice(12340, 'legendary')).toBe(12000);
    expect(ladderPrice(7.4, 'rare')).toBe(7);
  });

  it('priceMult는 그 해역 어종의 판매가만 배율과 가격 사다리로 바꾸고 복원 함수로 되돌린다', () => {
    const before = FISH.map(f => f.price);
    restore = applyOverride({ spots: { sea: { priceMult: 0.85 } } });
    for (const f of fishOf('sea')) {
      const base = before[FISH.indexOf(f)];
      expect(f.price, f.id).toBe(ladderPrice(base * 0.85, f.rarity));
    }
    FISH.forEach((f, i) => { if (f.spot !== 'sea') expect(f.price, f.id).toBe(before[i]); });
    restore();
    restore = null;
    expect(FISH.map(f => f.price)).toEqual(before);
  });

  it('배율이 들어간 판매가는 시간당 골드 계산에 반영된다', () => {
    const level = 20;
    const base = rates('sea', level, 'idle').goldPerHour;
    restore = applyOverride({ spots: { sea: { priceMult: 0.5 } } });
    const half = rates('sea', level, 'idle').goldPerHour;
    expect(half).toBeLessThan(base * 0.55);
    expect(half).toBeGreaterThan(base * 0.45);
  });

  it('priceMult는 0 이하나 숫자가 아닌 값을 거부하고 powerReq와 함께 쓸 수 있다', () => {
    expect(() => parseOverride({ spots: { sea: { priceMult: 0 } } })).toThrow(/0보다/);
    expect(() => parseOverride({ spots: { sea: { priceMult: '1' } } })).toThrow(/숫자/);
    const o = { spots: { sea: { powerReq: 30, priceMult: 0.9 } } };
    expect(parseOverride(o)).toEqual(o);
  });

  it('nightMult는 밤 어종에만 더 곱하고 복원하면 원래 가격으로 돌아온다', () => {
    const night = FISH.find(f => f.id === 'bigeye')!, day = FISH.find(f => f.id === 'galapagosshark')!;
    const before = [night.price, day.price];
    restore = applyOverride({ spots: { sthelena: { gradeMult: { legendary: 2 }, nightMult: { legendary: 1.5 } } } });
    expect(day.price).toBe(ladderPrice(before[1] * 2, 'legendary'));
    expect(night.price).toBe(ladderPrice(before[0] * 2 * 1.5, 'legendary'));
    restore();
    restore = null;
    expect([night.price, day.price]).toEqual(before);
    expect(parseOverride({ spots: { sthelena: { nightMult: { epic: 1.2 } } } })).toEqual({ spots: { sthelena: { nightMult: { epic: 1.2 } } } });
    expect(() => parseOverride({ spots: { sthelena: { nightMult: { epic: 0 } } } })).toThrow(/0보다/);
  });
});
