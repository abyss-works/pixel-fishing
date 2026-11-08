// 방치 배수 표 — 해역 요구 파워 대비 낚싯대 레벨 차(파워 5당 1)로 정한다.
import { describe, expect, it } from 'vitest';
import { SPOTS } from '../content/spots';
import { topZoneOfSpot } from '../content/zones';
import { newState, rodStats } from './logic';
import { catchDrawOptions } from './actions';
import { effectiveBite, powerZones, rodPower } from './stats';
import { JUDGMENT_MULT } from './balance';
import { idleDialsOf, relativeIdleBoost } from './power';

describe('방치 배수 — 태평양 이후 해역', () => {
  const req = 35; // 태평양

  it('레벨 차 0, 1, 2, 3, 4 이상에 5, 5, 4, 4, 3', () => {
    const at = (levels: number) => relativeIdleBoost(req + levels * 5, 'sea');
    expect([0, 1, 2, 3, 4].map(at)).toEqual([5, 5, 4, 4, 3]);
  });

  it('레벨 차 안의 파워는 같은 칸이다', () => {
    expect(relativeIdleBoost(req + 9, 'sea')).toBe(5);
    expect(relativeIdleBoost(req + 14, 'sea')).toBe(4);
    expect(relativeIdleBoost(req + 19, 'sea')).toBe(4);
  });

  it('하한 3에 닿은 뒤로는 더 줄지 않는다', () => {
    expect(relativeIdleBoost(req + 20, 'sea')).toBe(3);
    expect(relativeIdleBoost(req + 500, 'sea')).toBe(3);
  });

  it('요구 파워 미달은 진입 배수와 같다', () => {
    expect(relativeIdleBoost(10, 'sea')).toBe(5);
  });
});

describe('방치 배수 — 마을 해역은 현행(10에서 1씩, 하한 4)', () => {
  it('연못', () => {
    const at = (levels: number) => relativeIdleBoost(10 + levels * 5, 'pond');
    expect([0, 1, 2, 3, 4, 5, 6, 7, 30].map(at)).toEqual([10, 9, 8, 7, 6, 5, 4, 4, 4]);
  });

  it('강', () => {
    expect(relativeIdleBoost(20, 'river')).toBe(10);
    expect(relativeIdleBoost(45, 'river')).toBe(5);
    expect(relativeIdleBoost(200, 'river')).toBe(4);
  });

  it('마을 구분은 구역 데이터에서 파생된다 — 모든 해역의 진입 배수가 구역으로 갈린다', () => {
    for (const s of SPOTS) {
      const expected = topZoneOfSpot(s.id) === 'village' ? 10 : 5;
      expect(relativeIdleBoost(s.powerReq ?? 0, s.id), s.id).toBe(expected);
    }
  });
});

describe('삭제된 보정은 판정에 영향이 없다', () => {
  const phase = { phase: 'day' as const };

  it('수동 판정의 희귀 배수는 판정 배수 그대로다 — 파워 초과가 곱해지지 않는다', () => {
    for (const power of [10, 60, 255, 1000]) {
      for (const j of ['perfect', 'good', 'normal'] as const) {
        const o = catchDrawOptions(j, power, 'pond', 1, phase);
        expect(o.rareMult).toBe(JUDGMENT_MULT[j]);
        expect(o.commonMult).toBe(1);
      }
    }
  });

  it('방치 판정은 해역 배수 표를 쓴다', () => {
    expect(catchDrawOptions('auto', 35, 'sea', 1, phase).commonMult).toBe(5);
    expect(catchDrawOptions('auto', 55, 'sea', 2, phase).commonMult).toBe(6);
    expect(catchDrawOptions('auto', 10, 'pond', 1, phase).commonMult).toBe(10);
  });

  it('파워 초과는 입질 대기를 줄이지 않는다', () => {
    for (const rod of [1, 10, 30, 80]) {
      const st = { ...newState(), rod };
      const b = effectiveBite(st, 'pond');
      expect(b.min.value).toBe(rodStats(rod).biteMin);
      expect(b.max.value).toBe(rodStats(rod).biteMax);
      expect(b.min.mods).toEqual([]);
    }
  });

  it('파워 미달은 입질 대기가 늘어난다(유지)', () => {
    const st = newState();
    const b = effectiveBite(st, 'coron');
    expect(rodPower(st)).toBeLessThan(60);
    expect(b.min.value).toBeCloseTo(rodStats(1).biteMin + powerZones(st, 'coron').biteExtra, 10);
  });
});

describe('방치 두 축의 배수(진입, 플래토)', () => {
  it('태평양 이후 해역은 5와 3, 마을 해역은 10과 4다', () => {
    expect(idleDialsOf('sea')).toEqual({ entry: 5, plateau: 3 });
    expect(idleDialsOf('comorodeep')).toEqual({ entry: 5, plateau: 3 });
    expect(idleDialsOf('pond')).toEqual({ entry: 10, plateau: 4 });
    expect(idleDialsOf('river')).toEqual({ entry: 10, plateau: 4 });
  });

  it('진입 배수는 요구 파워 정각의 방치 배수와 같다', () => {
    for (const s of SPOTS) expect(idleDialsOf(s.id).entry).toBe(relativeIdleBoost(s.powerReq ?? 0, s.id));
  });
});
