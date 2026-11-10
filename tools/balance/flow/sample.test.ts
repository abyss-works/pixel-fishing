import { describe, expect, it } from 'vitest';
import { rng, rates, rodSpec, cycleOf, meanCycleSec } from '../model';
import { createSampler, percentile, summarize } from './sample';

describe('낚시 주기', () => {
  it('주기 평균이 rates의 시간당 캐치 수와 같은 식이다', () => {
    for (const axis of ['idle', 'normal', 'good'] as const) {
      const r = rates('sea', 5, axis);
      expect(3600 / meanCycleSec(r.cycle)).toBeCloseTo(r.catchesPerHour, 9);
    }
  });

  it('주기는 낚싯대 스펙의 입질 대기 범위와 반응 시간으로 짠다', () => {
    const spec = rodSpec('sea', 5);
    const c = cycleOf(spec, 'idle');
    expect(c.biteMin).toBe(spec.biteMin);
    expect(c.biteMax).toBe(spec.biteMax);
    expect(c.reaction).toBe(spec.sweep);
    expect(cycleOf(spec, 'good').reaction).toBe(spec.sweep / 2);
  });
});

describe('표본 추출', () => {
  it('캐치 주기는 범위 안이고 평균이 기댓값에 맞는다', () => {
    const r = rates('sea', 5, 'idle');
    const s = createSampler(rng(1));
    const lo = r.cycle.biteMin + r.cycle.biteExtra + r.cycle.reaction;
    const hi = r.cycle.biteMax + r.cycle.biteExtra + r.cycle.reaction;
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const c = s.cycleSec(r);
      expect(c).toBeGreaterThanOrEqual(lo);
      expect(c).toBeLessThanOrEqual(hi + 3);
      sum += c;
    }
    expect(sum / n).toBeCloseTo(meanCycleSec(r.cycle), 1);
  });

  it('캐치당 골드와 명성의 평균이 시간당 기댓값을 캐치 수로 나눈 값에 맞는다', () => {
    const r = rates('deep', 7, 'idle');
    const s = createSampler(rng(2));
    const n = 60000;
    let gold = 0, fame = 0;
    for (let i = 0; i < n; i++) { const c = s.catchOf(r); gold += c.gold; fame += c.fame; }
    expect(gold / n / (r.goldPerHour / r.catchesPerHour)).toBeGreaterThan(0.95);
    expect(gold / n / (r.goldPerHour / r.catchesPerHour)).toBeLessThan(1.05);
    expect(fame / n / (r.famePerHour / r.catchesPerHour)).toBeGreaterThan(0.95);
    expect(fame / n / (r.famePerHour / r.catchesPerHour)).toBeLessThan(1.05);
  });

  it('구간 수입은 구간이 끝나지 않은 캐치를 다음 구간으로 넘긴다', () => {
    const r = rates('sea', 5, 'idle');
    const a = createSampler(rng(3));
    const b = createSampler(rng(3));
    let split = 0;
    for (let i = 0; i < 60; i++) split += a.accrue(r, 60).catches;
    const whole = b.accrue(r, 3600).catches;
    expect(split).toBe(whole);
    expect(whole).toBeGreaterThan(r.catchesPerHour * 0.9);
    expect(whole).toBeLessThan(r.catchesPerHour * 1.1);
  });

  it('같은 시드는 같은 표본을 낸다', () => {
    const r = rates('sea', 5, 'idle');
    const run = (seed: number) => { const s = createSampler(rng(seed)); return Array.from({ length: 50 }, () => s.catchOf(r).gold + s.cycleSec(r)); };
    expect(run(9)).toEqual(run(9));
    expect(run(9)).not.toEqual(run(10));
  });
});

describe('분포 요약', () => {
  it('백분위는 정렬된 값 사이를 선형 보간한다', () => {
    const v = [1, 2, 3, 4, 5];
    expect(percentile(v, 0)).toBe(1);
    expect(percentile(v, 0.5)).toBe(3);
    expect(percentile(v, 1)).toBe(5);
    expect(percentile(v, 0.1)).toBeCloseTo(1.4, 9);
    expect(percentile(v, 0.9)).toBeCloseTo(4.6, 9);
  });

  it('요약은 정렬하지 않은 값도 받고 평균과 p10, 중앙값, p90을 낸다', () => {
    expect(summarize([5, 1, 3, 2, 4])).toEqual({ n: 5, missing: 0, mean: 3, p10: 1.4, p50: 3, p90: 4.6 });
  });

  it('못 끝낸 시도가 있으면 평균을 내지 않고 백분위는 못 끝낸 시도를 가장 느린 쪽에 넣어 계산한다', () => {
    const d = summarize([5, 1, 3, 2, 4], 2)!;
    expect(d.mean).toBeNull();
    expect(d.n).toBe(5);
    expect(d.missing).toBe(2);
    expect(d.p10).toBeCloseTo(1.6, 9);
    expect(d.p50).toBe(4);
    expect(d.p90).toBe(Number.POSITIVE_INFINITY);
  });

  it('못 끝낸 시도가 절반을 넘으면 중앙값도 끝나지 않은 것으로 낸다', () => {
    expect(summarize([1, 2], 3)!.p50).toBe(Number.POSITIVE_INFINITY);
  });

  it('값이 하나여도 요약하고 빈 입력은 null이다', () => {
    expect(summarize([7])).toMatchObject({ n: 1, mean: 7, p10: 7, p50: 7, p90: 7 });
    expect(summarize([], 3)).toBeNull();
  });
});
