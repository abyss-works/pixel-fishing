import { describe, expect, it } from 'vitest';
import { FISH } from '../../../src/game/content/fish';
import { SPOTS } from '../../../src/game/content/spots';
import { BIG_CATCH_PERCENTILE } from '../../../src/game/rules/balance';
import { rng } from '../model';
import { bigMarksDist, rewardDist, spotRewardDist, transitionDist } from './dist';
import { DAY_HOURS, simulate } from './progress';
import { parseArgs, renderText, runCli, runFlow } from './report';
import { createSampler } from './sample';

describe('--big-marks 인자 검증', () => {
  it('dist에서 쉼표 구분 정수 목록과 --bounty를 함께 받는다', () => {
    const o = parseArgs(['dist', '--big-marks', '10,30,50,100', '--bounty', '--axis', 'manual']);
    expect(o.commands).toEqual(['dist']);
    expect(o.bigMarks).toEqual([10, 30, 50, 100]);
    expect(o.bounty).toBe(true);
    expect(o.axis).toBe('manual');
  });

  it('기본값은 빈 목록이고 dist 외 명령과 잘못된 목록은 거부한다', () => {
    expect(parseArgs(['dist']).bigMarks).toEqual([]);
    expect(() => parseArgs(['transition', '--big-marks', '10'])).toThrow(/dist 명령에서만/);
    expect(() => parseArgs(['dist', '--big-marks', '0,10'])).toThrow(/1 이상/);
    expect(() => parseArgs(['dist', '--big-marks', '10,a'])).toThrow(/정수/);
    expect(() => parseArgs(['dist', '--big-marks', '10.5'])).toThrow(/정수/);
  });
});

describe('정상 진행 경로 월척 시뮬레이션 및 후속 순회 규칙', () => {
  it('마지막 해역 도달 후에도 목표 월척 종수에 미달하면 미수집 어종이 남은 해역을 순회해 목표를 채운다', () => {
    const mark = 90;
    const r = simulate({
      axis: 'idle',
      bounty: false,
      maxDays: 365,
      sampler: createSampler(rng(11)),
      bigMarks: [10, mark],
    });
    const lastArrival = r.arrivals.at(-1)!.hours;
    expect(r.arrivals).toHaveLength(SPOTS.length);
    expect(r.bigMarkHours[0]).not.toBeNull();
    expect(r.bigMarkHours[1]).not.toBeNull();
    expect(r.bigMarkHours[0]!).toBeLessThanOrEqual(r.bigMarkHours[1]!);
    expect(r.bigMarkHours[1]!).toBeGreaterThan(lastArrival);
  });

  it('전체 어종 수를 넘는 목표는 도달 불가(null)로 두고 도달 가능한 최대 목표에서 멈춘다', () => {
    const total = FISH.length;
    const r = simulate({
      axis: 'idle',
      bounty: false,
      maxDays: 365,
      sampler: createSampler(rng(7)),
      bigMarks: [10, total + 5],
    });
    expect(r.bigMarkHours[0]).not.toBeNull();
    expect(r.bigMarkHours[1]).toBeNull();
    expect(r.arrivals).toHaveLength(SPOTS.length);
  });
});

describe('bigMarksDist 분포 및 출력', () => {
  const opts = { trials: 12, seed: 20261110, axis: 'idle' as const, bounty: false, maxDays: 365, marks: [10, 30, 50] };
  const d = bigMarksDist(opts);

  it('목표 종수별 분포를 내고 p10 <= 중앙값 <= p90, 일수 = 시간 ÷ 8 불변식을 지킨다', () => {
    expect(d.totalSpecies).toBe(FISH.length);
    expect(d.rows).toHaveLength(3);
    for (let i = 0; i < d.rows.length; i++) {
      const row = d.rows[i];
      expect(row.target).toBe(opts.marks[i]);
      expect(row.reachable).toBe(true);
      expect(row.hours).not.toBeNull();
      expect(row.days).not.toBeNull();
      const h = row.hours!;
      const dy = row.days!;
      expect(h.p10).toBeLessThanOrEqual(h.p50);
      expect(h.p50).toBeLessThanOrEqual(h.p90);
      expect(dy.p10).toBeCloseTo(h.p10 / DAY_HOURS, 12);
      expect(dy.p50).toBeCloseTo(h.p50 / DAY_HOURS, 12);
      expect(dy.p90).toBeCloseTo(h.p90 / DAY_HOURS, 12);
      expect(dy.mean!).toBeCloseTo(h.mean! / DAY_HOURS, 12);
      if (i > 0) expect(h.p50).toBeGreaterThanOrEqual(d.rows[i - 1].hours!.p50);
    }
  });

  it('같은 시드면 같은 결과이고 시드가 다르면 달라진다', () => {
    expect(bigMarksDist(opts)).toEqual(d);
    expect(bigMarksDist({ ...opts, seed: 99 })).not.toEqual(d);
  });

  it('수동 축과 의뢰 수행 옵션이 반영된다', () => {
    const manual = bigMarksDist({ ...opts, axis: 'manual' });
    const bounty = bigMarksDist({ ...opts, bounty: true });
    expect(manual.rows[0].hours!.mean).not.toBe(d.rows[0].hours!.mean);
    expect(bounty.rows[2].hours!.mean).not.toBe(d.rows[2].hours!.mean);
  });

  it('최대 일수가 짧으면 못 끝낸 시도를 missing으로 센다', () => {
    const short = bigMarksDist({ ...opts, maxDays: 1, marks: [10, 50] });
    expect(short.rows[1].hours === null || short.rows[1].hours.missing > 0).toBe(true);
  });

  it('전체 어종 수를 넘는 목표는 도달 불가로 표시한다', () => {
    const over = bigMarksDist({ ...opts, marks: [10, FISH.length + 1] });
    expect(over.rows[1].reachable).toBe(false);
    expect(over.rows[1].achievedRate).toBe(0);
    expect(over.rows[1].hours).toBeNull();
    expect(over.rows[1].days).toBeNull();
  });

  it('dist --big-marks 텍스트와 JSON에 시간 및 ÷8 환산 일수, 순회 규칙 가정을 출력한다', () => {
    const r = runFlow(parseArgs(['dist', '--big-marks', '10,30,50', '--trials', '6', '--seed', '5']));
    expect(r.dist!.bigMarks!.rows).toHaveLength(3);
    const text = renderText(r);
    expect(text).toContain('정상 진행 경로 월척 어종 달성 시각');
    expect(text).toContain(`${BIG_CATCH_PERCENTILE}%`);
    expect(text).toContain('일(÷8)');
    expect(text).toContain('순회');

    const json = JSON.parse(runCli(['dist', '--big-marks', '10,30', '--trials', '4', '--json']).stdout);
    expect(json.dist.bigMarks.rows).toHaveLength(2);
    expect(json.dist.bigMarks.rows[0].days.p50).toBeCloseTo(json.dist.bigMarks.rows[0].hours.p50 / DAY_HOURS, 12);
    expect(runFlow(parseArgs(['dist', '--trials', '3'])).dist!.bigMarks).toBeUndefined();
  });

  it('dist의 --bounty 옵션이 transitionDist, rewardDist, spotRewardDist에도 일관되게 반영된다', () => {
    const tdOff = transitionDist({ trials: 4, seed: 9, axis: 'idle', maxDays: 365, bounty: false });
    const tdOn = transitionDist({ trials: 4, seed: 9, axis: 'idle', maxDays: 365, bounty: true });
    expect(tdOn.at(-1)!.analyticCumulative!).toBeLessThan(tdOff.at(-1)!.analyticCumulative!);
    expect(tdOn.at(-1)!.cumulative!.mean!).toBeLessThan(tdOff.at(-1)!.cumulative!.mean!);

    const rdOff = rewardDist({ trials: 4, seed: 9, axis: 'idle', maxDays: 365, hours: 4, basicShare: 0.5, bounty: false });
    const rdOn = rewardDist({ trials: 4, seed: 9, axis: 'idle', maxDays: 365, hours: 4, basicShare: 0.5, bounty: true });
    expect(rdOn.map(r => r.arrival?.mean)).not.toEqual(rdOff.map(r => r.arrival?.mean));

    const srOff = spotRewardDist({ trials: 4, seed: 9, axis: 'idle', maxDays: 365, hours: 4, basicShare: 0.5, bounty: false });
    const srOn = spotRewardDist({ trials: 4, seed: 9, axis: 'idle', maxDays: 365, hours: 4, basicShare: 0.5, bounty: true });
    const bOff = srOff.find(r => r.spot === 'benguela')!;
    const bOn = srOn.find(r => r.spot === 'benguela')!;
    expect(bOn.arrival!.mean!).toBeLessThan(bOff.arrival!.mean!);

    const flowOff = runFlow(parseArgs(['dist', '--reward', '4', '--trials', '3', '--seed', '5']));
    const flowOn = runFlow(parseArgs(['dist', '--bounty', '--reward', '4', '--trials', '3', '--seed', '5']));
    expect(flowOn.dist!.transition.at(-1)!.analyticCumulative!).toBeLessThan(flowOff.dist!.transition.at(-1)!.analyticCumulative!);
    expect(flowOn.dist!.reward!.rows.map(r => r.arrival?.mean)).not.toEqual(flowOff.dist!.reward!.rows.map(r => r.arrival?.mean));
  });
});
