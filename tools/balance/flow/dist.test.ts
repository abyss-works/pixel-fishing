import { describe, expect, it } from 'vitest';
import { rng } from '../model';
import { ALWAYS_ON, simulate } from './progress';
import { transitionTimings } from './transitions';
import { createSampler } from './sample';
import { simulateOpening } from './opening';
import { openingDist, transitionDist } from './dist';

describe('표본 추출 진행 시뮬레이션', () => {
  it('같은 시드는 같은 도착 기록을 낸다', () => {
    const run = (seed: number) => simulate({ type: ALWAYS_ON, axis: 'idle', bounty: false, maxDays: 365, sampler: createSampler(rng(seed)) }).arrivals.map(a => a.hours);
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('표본 없이 돌리면 기댓값 경로 그대로다', () => {
    const a = simulate({ type: ALWAYS_ON, axis: 'idle', bounty: false, maxDays: 365 });
    const b = simulate({ type: ALWAYS_ON, axis: 'idle', bounty: false, maxDays: 365, sampler: undefined });
    expect(a.arrivals).toEqual(b.arrivals);
  });
});

describe('최초 10분 표본', () => {
  it('영웅 보장은 5번째 캐치이고 전설 보장은 10번째에서 20번째 캐치다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = simulateOpening({ judgment: 'normal', legendAt: 'draw', sampler: createSampler(rng(seed)) });
      const g = r.steps.filter(s => s.kind === 'guarantee');
      expect(g.map(s => s.detail)).toEqual(['epic', 'legendary']);
      expect(g[0].catches).toBe(5);
      expect(g[1].catches).toBeGreaterThanOrEqual(10);
      expect(g[1].catches).toBeLessThanOrEqual(20);
      expect(r.arrival).not.toBeNull();
    }
  });

  it('전설 번호를 주면 그 캐치에서 전설이 나온다', () => {
    const r = simulateOpening({ judgment: 'good', legendAt: 13, sampler: createSampler(rng(3)) });
    expect(r.steps.find(s => s.detail === 'legendary')!.catches).toBe(13);
  });
});

describe('최초 10분 분포', () => {
  const d = openingDist({ judgment: 'normal', trials: 300, seed: 7 });

  it('영웅, 전설, 도착 시간의 분포를 낸다', () => {
    expect(d.trials).toBe(300);
    for (const k of ['epic', 'legend', 'arrival'] as const) {
      const x = d[k]!;
      expect(x.n + x.missing).toBe(300);
      expect(x.p10).toBeLessThanOrEqual(x.p50);
      expect(x.p50).toBeLessThanOrEqual(x.p90);
    }
    expect(d.epic!.p50).toBeLessThan(d.legend!.p50);
    expect(d.within10).toBeGreaterThanOrEqual(0);
    expect(d.within10).toBeLessThanOrEqual(1);
  });

  it('같은 시드는 같은 분포를 낸다', () => {
    expect(openingDist({ judgment: 'normal', trials: 300, seed: 7 })).toEqual(d);
  });

  it('도착 시간 평균이 해석 기댓값과 15% 안에서 맞는다', () => {
    expect(Math.abs(d.arrival!.mean / d.analytic - 1)).toBeLessThan(0.15);
  });

  it('시도 횟수가 1보다 작으면 거부한다', () => {
    expect(() => openingDist({ judgment: 'normal', trials: 0, seed: 1 })).toThrow(/1 이상/);
  });
});

describe('해역 전환 분포', () => {
  const opts = { trials: 120, seed: 11, axis: 'idle' as const, maxDays: 365, bagCapAwake: false };
  const rows = transitionDist(opts);

  it('전환마다 연속 방치 소요 시간 분포와 해석 기댓값을 낸다', () => {
    expect(rows).toHaveLength(12);
    for (const r of rows) {
      expect(r.hours).not.toBeNull();
      expect(r.hours!.p10).toBeLessThanOrEqual(r.hours!.p90);
    }
  });

  // 앞 해역은 골드와 명성 중 늦은 쪽이 시간을 정하는 최댓값 구조라 표본 평균이 기댓값보다 크다. 뒤 해역은 한쪽이 시간을 정해 5% 안에서 맞는다
  it('남인도양 이후 해역에서 표본 평균이 해석 기댓값과 5% 안에서 맞는다', () => {
    const analytic = transitionTimings(simulate({ type: ALWAYS_ON, axis: 'idle', bounty: false, maxDays: 365 }).arrivals);
    for (const i of [7, 8, 9, 10]) {
      expect(rows[i].analyticHours).toBe(analytic[i].hours);
      expect(Math.abs(rows[i].hours!.mean / rows[i].analyticHours - 1), `${rows[i].to}`).toBeLessThan(0.05);
    }
  });

  it('같은 시드는 같은 분포를 낸다', () => {
    expect(transitionDist(opts)).toEqual(rows);
  });
});
