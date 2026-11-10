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

  // 앞 해역은 전환 소요가 짧아 캐치 가격의 치우침(고가 어종으로 문턱을 넘은 초과분이 다음 전환으로 넘어감)과 1분 단위 문턱 판정의 영향이 크다. 뒤 해역은 5% 안에서 맞는다
  it('남인도양 이후 해역에서 표본 평균이 해석 기댓값과 5% 안에서 맞는다', () => {
    const analytic = transitionTimings(simulate({ type: ALWAYS_ON, axis: 'idle', bounty: false, maxDays: 365 }).arrivals);
    for (const i of [7, 8, 9, 10]) {
      expect(rows[i].analyticHours).toBe(analytic[i].hours);
      expect(Math.abs(rows[i].hours!.mean! / rows[i].analyticHours! - 1), `${rows[i].to}`).toBeLessThan(0.05);
    }
  });

  it('누적 시간의 표본 평균이 해석 기댓값과 2% 안에서 맞는다', () => {
    for (const i of [7, 8, 9, 10, 11]) {
      const r = rows[i];
      expect(Math.abs(r.cumulative!.mean! / r.analyticCumulative! - 1), `${r.to}`).toBeLessThan(0.02);
    }
  });

  it('같은 시드는 같은 분포를 낸다', () => {
    expect(transitionDist(opts)).toEqual(rows);
  });

  it('최대 일수가 짧아 끝내지 못해도 전환 수만큼 행을 내고 해석 미도달은 null이다', () => {
    const short = transitionDist({ ...opts, trials: 40, maxDays: 1, travelShare: 0.03 });
    expect(short).toHaveLength(12);
    expect(short.some(r => r.analyticHours === null)).toBe(true);
    for (const r of short) {
      if (r.analyticHours === null) expect(r.analyticCumulative).toBeNull();
      if (r.hours && r.hours.missing > 0) {
        expect(r.hours.mean).toBeNull();
        expect(r.hours.n + r.hours.missing).toBe(40);
      }
    }
    expect(short.at(-1)!.hours?.missing ?? 40).toBeGreaterThan(0);
  });
});
