import { describe, expect, it } from 'vitest';
import { FIRST_CATCH_SPOT_CAPS } from '../../../src/game/rules/firstCatch';
import { rng } from '../model';
import { simulate } from './progress';
import { transitionTimings } from './transitions';
import { createSampler } from './sample';
import { OPENING_TARGET_SEC, simulateOpening } from './opening';
import { openingDist, transitionDist } from './dist';

describe('표본 추출 진행 시뮬레이션', () => {
  it('같은 시드는 같은 도착 기록을 낸다', () => {
    const run = (seed: number) => simulate({ axis: 'idle', bounty: false, maxDays: 365, sampler: createSampler(rng(seed)) }).arrivals.map(a => a.hours);
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

});

describe('최초 10분 표본', () => {
  it('마을 해역별 보장은 연못 20회, 강 30회 상한 안에서만 발동하고 모두 도착한다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = simulateOpening({ judgment: 'normal', firstCatch: true, sampler: createSampler(rng(seed)) });
      const g = r.steps.filter(s => s.kind === 'guarantee');
      const move = r.steps.find(s => s.kind === 'move' && s.detail === 'river');
      for (const s of g) {
        if (!move || s.catches <= move.catches) {
          expect(s.catches).toBeLessThanOrEqual(FIRST_CATCH_SPOT_CAPS.pond!);
        } else {
          expect(s.catches - move.catches).toBeLessThanOrEqual(FIRST_CATCH_SPOT_CAPS.river!);
        }
      }
      expect(r.arrival).not.toBeNull();
    }
  });

  it('firstCatch를 끄면 보장 단계가 없고 켜면 상한 보장이 적용된다', () => {
    const off = simulateOpening({ judgment: 'good', firstCatch: false, sampler: createSampler(rng(3)) });
    const on = simulateOpening({ judgment: 'good', firstCatch: true, sampler: createSampler(rng(3)) });
    expect(off.steps.some(s => s.kind === 'guarantee')).toBe(false);
    expect(on.arrival).not.toBeNull();
  });
});

describe('최초 10분 분포', () => {
  const d = openingDist({ judgment: 'normal', trials: 300, seed: 7 });

  it('도착 시간과 보장 분포를 내고 모든 시도가 10분 안에 도착한다', () => {
    expect(d.trials).toBe(300);
    for (const k of ['epic', 'legend', 'arrival'] as const) {
      const x = d[k]!;
      expect(x.n + x.missing).toBe(300);
      expect(x.p10).toBeLessThanOrEqual(x.p50);
      expect(x.p50).toBeLessThanOrEqual(x.p90);
    }
    expect(d.arrival!.missing).toBe(0);
    expect(d.arrival!.p90).toBeLessThanOrEqual(OPENING_TARGET_SEC);
    expect(d.within10).toBe(1);
  });

  it('같은 시드는 같은 분포를 낸다', () => {
    expect(openingDist({ judgment: 'normal', trials: 40, seed: 7 })).toEqual(openingDist({ judgment: 'normal', trials: 40, seed: 7 }));
  });

  it('도착 시간 평균이 해석 기댓값과 25% 안에서 맞는다', () => {
    expect(Math.abs(d.arrival!.mean! / d.analytic - 1)).toBeLessThan(0.25);
  });

  it('시도 횟수가 1보다 작으면 거부한다', () => {
    expect(() => openingDist({ judgment: 'normal', trials: 0, seed: 1 })).toThrow(/1 이상/);
  });
});

describe('해역 전환 분포', () => {
  const opts = { trials: 120, seed: 11, axis: 'idle' as const, maxDays: 365 };
  const rows = transitionDist(opts);

  it('전환마다 전환 시간 분포와 해석 기댓값을 낸다', () => {
    expect(rows).toHaveLength(14);
    for (const r of rows) {
      expect(r.hours).not.toBeNull();
      expect(r.hours!.p10).toBeLessThanOrEqual(r.hours!.p90);
    }
  });

  // 앞 해역은 전환 소요가 짧아 캐치 가격의 치우침(고가 어종으로 문턱을 넘은 초과분이 다음 전환으로 넘어감)과 1분 단위 문턱 판정의 영향이 크다. 뒤 해역은 5% 안에서 맞는다
  it('남인도양 이후 해역에서 표본 평균이 해석 기댓값과 5% 안에서 맞는다', () => {
    const analytic = transitionTimings(simulate({ axis: 'idle', bounty: false, maxDays: 365 }).arrivals);
    for (const i of [7, 8, 9, 10]) {
      expect(rows[i].analyticHours).toBe(analytic[i].hours);
      expect(Math.abs(rows[i].hours!.mean! / rows[i].analyticHours! - 1), `${rows[i].to}`).toBeLessThan(0.05);
    }
  });

  it('누적 시간의 표본 평균이 해석 기댓값과 5% 안에서 맞는다', () => {
    for (const i of [7, 8, 9, 10, 11]) {
      const r = rows[i];
      expect(Math.abs(r.cumulative!.mean! / r.analyticCumulative! - 1), `${r.to}`).toBeLessThan(0.05);
    }
  });

  it('같은 시드는 같은 분포를 낸다', () => {
    const few = { ...opts, trials: 10 };
    expect(transitionDist(few)).toEqual(transitionDist(few));
  });

  it('최대 일수가 짧아 끝내지 못해도 전환 수만큼 행을 내고 해석 미도달은 null이다', () => {
    const short = transitionDist({ ...opts, trials: 40, maxDays: 1 });
    expect(short).toHaveLength(14);
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
