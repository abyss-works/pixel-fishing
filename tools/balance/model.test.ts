import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../src/game/content/spots';
import { JUDGMENT_MULT } from '../../src/game/rules/balance';
import { rodStats } from '../../src/game/rules/logic';
import { topZoneOfSpot } from '../../src/game/content/zones';
import {
  SPEC_MARGIN, axisAvailable, axisOptions, entryLevel, headroom, inversions, moveGap, perfectOverIdle, rates, rodSpec,
} from './model';
import { simulateJourney } from './journey';
import { GATE_FROM_SPOT, GATE_POOLS, KNOWN_INVERSIONS, gateRows } from './gates';

describe('밸런스 측정 모델', () => {
  it('이웃 역전은 뒤가 앞보다 작은 쌍만 잡는다', () => {
    expect(inversions([1, 3, 2, 5, 4], v => v)).toEqual([
      { from: 3, to: 2, drop: 2 / 3 - 1 },
      { from: 5, to: 4, drop: 4 / 5 - 1 },
    ]);
    expect(inversions([1, 2, 3], v => v)).toEqual([]);
  });

  it('완화 여유는 다음 값까지의 비율이고 역전이면 음수다', () => {
    expect(headroom(100, 120)).toBeCloseTo(0.2);
    expect(headroom(100, 90)).toBeCloseTo(-0.1);
  });

  it('진입 레벨 스펙은 노란 존만 있고 방치 배수는 최대다', () => {
    const spot = SPOTS[2].id;
    const spec = rodSpec(spot, entryLevel(spot));
    expect(spec.yellow).toBe(10);
    expect(spec.red).toBe(0);
    expect(spec.idleBoost).toBe(5);
    expect(axisAvailable(spec, 'good')).toBe(true);
    expect(axisAvailable(spec, 'perfect')).toBe(false);
  });

  it('수동 GOOD은 같은 해역의 무판정·방치보다 시간당 골드가 많다', () => {
    const spot = SPOTS[0].id, lv = entryLevel(spot);
    const good = rates(spot, lv, 'good').goldPerHour;
    expect(good).toBeGreaterThan(rates(spot, lv, 'normal').goldPerHour);
    expect(good).toBeGreaterThan(rates(spot, lv, 'idle').goldPerHour);
  });

  it('새 계정 진행은 해역 순서대로 도착하고 도착 시간이 줄지 않는다', () => {
    const j = simulateJourney('good');
    expect(j.arrivals.map(a => a.spot)).toEqual(SPOTS.map(s => s.id));
    for (let i = 1; i < j.arrivals.length; i++) expect(j.arrivals[i].hours).toBeGreaterThanOrEqual(j.arrivals[i - 1].hours);
  });

  it('여유 스펙은 진입 레벨 +4이고 태평양 이후 해역의 방치 배수는 진입 5, 플래토 3이다', () => {
    expect(SPEC_MARGIN).toBe(4);
    for (const s of SPOTS.filter(s => topZoneOfSpot(s.id) !== 'village')) {
      expect(rodSpec(s.id, entryLevel(s.id)).idleBoost, s.id).toBe(5);
      expect(rodSpec(s.id, entryLevel(s.id) + SPEC_MARGIN).idleBoost, s.id).toBe(3);
    }
  });

  it('수동 축의 다이얼은 판정 배수 그대로이고 파워 초과 보정이 없다', () => {
    const spot = SPOTS[2].id;
    const spec = rodSpec(spot, entryLevel(spot) + 20);
    expect(axisOptions(spec, 'perfect')).toEqual({ rareMult: JUDGMENT_MULT.perfect });
    expect(axisOptions(spec, 'good')).toEqual({ rareMult: JUDGMENT_MULT.good });
  });

  it('입질 대기는 파워 초과로 줄지 않는다', () => {
    const spot = SPOTS[2].id;
    const lv = entryLevel(spot) + 20;
    expect(rodSpec(spot, lv).biteMin).toBe(rodStats(lv).biteMin);
    expect(rodSpec(spot, lv).biteMax).toBe(rodStats(lv).biteMax);
  });

  it('이동 직후 수입: 태평양부터 남대서양까지 옮기면 낮 풀과 낮밤 혼합 모두 같은 레벨의 가장 좋은 이전 해역 이상이다(알려진 역전 제외)', () => {
    expect(SPOTS.map(s => s.id)).toEqual(expect.arrayContaining(['comorodeep', 'benguela', 'sthelena']));
    const rows = gateRows();
    expect(rows.length).toBe((SPOTS.length - SPOTS.findIndex(s => s.id === GATE_FROM_SPOT)) * GATE_POOLS.length);
    for (const r of rows) {
      const where = `${r.spot} ${r.pool}`;
      expect(r.verdict, where).not.toBe('위반');
      if (r.verdict === '통과') expect(r.diff, where).toBeGreaterThanOrEqual(0);
      else expect(r.diff, where).toBeCloseTo(KNOWN_INVERSIONS[r.spot]![r.pool], 0);
    }
  });

  it('이동 직후 비교 대상은 같은 레벨로 낚을 수 있는 이전 해역뿐이다', () => {
    const i = SPOTS.findIndex(s => s.id === 'dragonhole');
    const g = moveGap(i, 'day');
    const lv = entryLevel(SPOTS[i].id);
    expect(g.from).toBeDefined();
    expect(SPOTS.slice(0, i).some(s => s.id === g.from)).toBe(true);
    expect(SPOTS.find(s => s.id === g.from)!.powerReq ?? 0).toBeLessThanOrEqual(rodSpec(SPOTS[i].id, lv).power);
  });

  it('PERFECT는 같은 스펙의 방치보다 시간당 골드가 10배를 넘지 않는다', () => {
    for (const s of SPOTS) {
      for (const m of [0, SPEC_MARGIN]) {
        expect(perfectOverIdle(s.id, entryLevel(s.id) + m), `${s.id} +${m}`).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe('파워 미달 페널티', () => {
  const spot = 'sea' as const;

  it('진입 레벨 이상은 페널티가 없다', () => {
    const spec = rodSpec(spot, entryLevel(spot));
    expect(spec.gateMult).toBe(1);
    expect(spec.biteExtra).toBe(0);
  });

  it('미달 레벨마다 일반 가중치 배수가 2배가 되고 4레벨부터 16배 상한이다', () => {
    const entry = entryLevel(spot);
    expect(rodSpec(spot, entry - 1).gateMult).toBe(2);
    expect(rodSpec(spot, entry - 2).gateMult).toBe(4);
    expect(rodSpec(spot, entry - 4).gateMult).toBe(16);
    expect(rodSpec(spot, entry - 4).biteExtra).toBe(5);
  });

  it('미달이면 존이 없고 수동 축은 무판정만 가능하다', () => {
    const spec = rodSpec(spot, entryLevel(spot) - 1);
    expect(spec.yellow).toBe(0);
    expect(axisAvailable(spec, 'good')).toBe(false);
  });

  it('미달 다이얼은 방치 배수에 페널티를 곱하고 수동 축에는 일반 가중치로 얹는다', () => {
    const spec = rodSpec(spot, entryLevel(spot) - 2);
    expect(axisOptions(spec, 'idle')).toEqual({ commonMult: spec.idleBoost * 4 });
    expect(axisOptions(spec, 'normal')).toEqual({ rareMult: 1, commonMult: 4 });
  });

  it('미달이 깊을수록 시간당 골드가 줄고 일반 비율이 늘며 사이클이 길어진다', () => {
    const entry = entryLevel(spot);
    const at = (d: number) => rates(spot, entry - d, 'idle');
    for (let d = 1; d <= 4; d++) {
      expect(at(d).goldPerHour, `-${d}`).toBeLessThan(at(d - 1).goldPerHour);
      expect(at(d).rarity.common, `-${d}`).toBeGreaterThan(at(d - 1).rarity.common);
      expect(at(d).catchesPerHour, `-${d}`).toBeLessThan(at(d - 1).catchesPerHour);
    }
  });
});
