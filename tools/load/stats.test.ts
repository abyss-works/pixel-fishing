import { describe, expect, it } from 'vitest';
import { percentile, SampleSet, summarize } from './stats';

describe('percentile', () => {
  it('가장 가까운 순위 방식으로 계산한다', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(v, 100)).toBe(100);
  });

  it('정렬되지 않은 입력도 받고 입력을 바꾸지 않는다', () => {
    const v = [5, 1, 3];
    expect(percentile(v, 50)).toBe(3);
    expect(v).toEqual([5, 1, 3]);
  });

  it('표본이 하나면 모든 백분위가 그 값이다', () => {
    expect(percentile([7], 1)).toBe(7);
    expect(percentile([7], 99)).toBe(7);
  });

  it('표본이 없으면 null이다', () => {
    expect(percentile([], 50)).toBeNull();
  });
});

describe('summarize', () => {
  it('개수와 p50, p95, p99를 돌려준다', () => {
    const v = Array.from({ length: 200 }, (_, i) => i + 1);
    expect(summarize(v)).toEqual({ count: 200, p50: 100, p95: 190, p99: 198 });
  });

  it('표본이 없으면 값이 null이다', () => {
    expect(summarize([])).toEqual({ count: 0, p50: null, p95: null, p99: null });
  });
});

describe('SampleSet', () => {
  it('상한 안에서는 모두 보관한다', () => {
    const s = new SampleSet(10);
    for (let i = 0; i < 5; i++) s.add(i);
    expect(s.values()).toEqual([0, 1, 2, 3, 4]);
    expect(s.total).toBe(5);
  });

  it('상한을 넘겨도 보관 개수는 상한이고 전체 개수는 센다', () => {
    const s = new SampleSet(10, () => 0.5);
    for (let i = 0; i < 100; i++) s.add(i);
    expect(s.values()).toHaveLength(10);
    expect(s.total).toBe(100);
    expect(s.summary().count).toBe(100);
  });
});
