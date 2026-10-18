import { describe, expect, it } from 'vitest';
import { FISH, newState, sizeParams, sizePercentile } from '../../../game/rules/logic';
import { selectSizeDistribution } from './sizeDistribution';

const fish = FISH[0];

describe('어종 크기 분포', () => {
  it('평균을 가운데 둔 종 모양 곡선이고, 높이는 평균에서 1이다', () => {
    const d = selectSizeDistribution(newState(), fish);
    const { mean } = sizeParams(fish);
    expect(d.min).toBeLessThan(mean);
    expect(d.max).toBeGreaterThan(mean);
    const peak = d.points.reduce((a, b) => (b.y > a.y ? b : a));
    expect(Math.abs(peak.x - mean)).toBeLessThan((d.max - d.min) / 20);
    expect(peak.y).toBeCloseTo(1, 2);
    expect(d.points[0].y).toBeLessThan(0.05);
  });

  it('기록이 없으면 내 위치가 없다', () => {
    expect(selectSizeDistribution(newState(), fish).me).toBeNull();
  });

  it('내 위치는 폼과 무관한 어종 최대 기록이고 상위 백분율을 함께 준다', () => {
    const { mean } = sizeParams(fish);
    const game = { ...newState(), dex: { [fish.id]: {
      normal: { count: 2, maxSize: mean, first: null },
      variant: { count: 1, maxSize: mean * 1.2, first: null },
    } } };
    const d = selectSizeDistribution(game, fish);
    expect(d.me?.size).toBeCloseTo(mean * 1.2);
    expect(d.me?.topPercent).toBe(sizePercentile(fish, mean * 1.2));
    expect(d.me!.t).toBeGreaterThan(0.5);
    expect(d.me!.t).toBeLessThanOrEqual(1);
  });

  it('범위 밖의 큰 기록은 그래프 끝에 붙인다', () => {
    const { mean, std } = sizeParams(fish);
    const game = { ...newState(), dex: { [fish.id]: { normal: { count: 1, maxSize: mean + std * 10, first: null } } } };
    expect(selectSizeDistribution(game, fish).me!.t).toBe(1);
  });
});
