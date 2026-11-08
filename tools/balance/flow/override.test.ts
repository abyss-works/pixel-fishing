import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import { entryLevel } from '../model';
import { applyOverride, loadOverride, parseOverride } from './override';

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
