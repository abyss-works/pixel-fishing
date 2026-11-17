import { describe, expect, it } from 'vitest';
import { rng } from '../model';
import { simulate } from './progress';
import { createSampler } from './sample';

const run = (o: Partial<Parameters<typeof simulate>[0]> = {}) => simulate({ axis: 'idle', bounty: false, maxDays: 365, ...o });

describe('누적 캐치 수 기록', () => {
  it('옵션이 없으면 닿은 시점이 없고 누적 캐치 수는 양수다', () => {
    const r = run();
    expect(r.catchHours).toEqual([]);
    expect(r.catches).toBeGreaterThan(0);
  });

  it('단계에 닿은 시점은 단계가 클수록 늦고 도착 기록을 바꾸지 않는다', () => {
    const r = run({ catchMarks: [100, 1_000, 10_000] });
    const h = r.catchHours as number[];
    expect(h.every(x => x > 0)).toBe(true);
    expect(h[0]).toBeLessThan(h[1]);
    expect(h[1]).toBeLessThan(h[2]);
    expect(r.arrivals).toEqual(run().arrivals);
  });

  it('진행이 끝나기 전에 닿지 못한 단계는 null이다', () => {
    const r = run({ catchMarks: [run().catches * 10] });
    expect(r.catchHours).toEqual([null]);
  });

  it('시간당 캐치 수가 일정한 처음 구간에서는 단계에 닿은 시점이 캐치 수에 비례한다', () => {
    const r = run({ catchMarks: [1, 2] });
    const [a, b] = r.catchHours as number[];
    expect(b).toBeGreaterThan(a);
    expect(b / a).toBeLessThan(2.5);
  });

  it('표본 경로에서도 기록하고 같은 시드는 같은 값이다', () => {
    const t = (seed: number) => run({ sampler: createSampler(rng(seed)), catchMarks: [500] });
    expect(t(2).catchHours).toEqual(t(2).catchHours);
    expect(t(2).catchHours[0]).not.toBeNull();
  });
});
