import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../src/game/content/spots';
import { JUDGMENT_MULT } from '../../src/game/rules/balance';
import { rodStats } from '../../src/game/rules/logic';
import { topZoneOfSpot } from '../../src/game/content/zones';
import {
  SPEC_MARGIN, axisAvailable, axisOptions, entryLevel, headroom, inversions, moveGap, perfectOverIdle, rates, rodSpec,
} from './model';
import { simulateJourney } from './journey';

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
    const from = SPOTS.findIndex(s => s.id === 'sea');
    expect(SPOTS.map(s => s.id)).toEqual(expect.arrayContaining(['comorodeep', 'benguela', 'sthelena']));
    // 확정 밸런스의 알려진 역전, 관측 이슈로 추적. 값은 해역별 이동 직후 수입 차이(새 해역 - 비교 해역)다.
    const known: Partial<Record<string, Record<'day' | 'mixed', number>>> = {
      barrierreef: { day: -604.36, mixed: -577.26 },
      southindian: { day: -1921.52, mixed: -5455.33 },
      comorodeep: { day: -42614.75, mixed: -60618.06 },
    };
    for (let i = from; i < SPOTS.length; i++) {
      for (const pool of ['day', 'mixed'] as const) {
        const g = moveGap(i, pool);
        const expected = known[SPOTS[i].id]?.[pool];
        if (expected === undefined) expect(g.diff, `${SPOTS[i].id} ${pool}`).toBeGreaterThanOrEqual(0);
        else expect(g.diff, `${SPOTS[i].id} ${pool}`).toBeCloseTo(expected, 0);
      }
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
