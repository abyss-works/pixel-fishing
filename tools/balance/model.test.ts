import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../src/game/content/spots';
import { axisAvailable, entryLevel, headroom, inversions, rates, rodSpec } from './model';
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
    expect(spec.idleBoost).toBe(10);
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
});
