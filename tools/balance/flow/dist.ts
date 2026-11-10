// 분포 지표 — 같은 규칙과 상수로 낚시를 캐치 단위로 시뮬레이션해(몬테카를로) 최초 10분과 해역 전환 시간의 분포를 낸다.
// 시드를 고정하면 같은 인자의 결과가 항상 같다. 해석적 기댓값(opening, transition 명령의 값)을 함께 담아 평균이 맞는지 비교한다.
// 느린 쪽(운이 나쁜 쪽)은 p90이다. 시간이 길수록 나쁘다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { FIRST_CATCH_LEGEND_MAX, FIRST_CATCH_LEGEND_MIN } from '../../../src/game/rules/firstCatch';
import { rng } from '../model';
import { simulateOpening, OPENING_TARGET_SEC } from './opening';
import type { Judgment } from './opening';
import { ALWAYS_ON, simulate } from './progress';
import type { FlowAxis } from './progress';
import { createSampler, summarize } from './sample';
import type { Dist } from './sample';
import { transitionTimings } from './transitions';

/** 기본 시드와 시도 횟수 — 인자로 바꿀 수 있다 */
export const DEFAULT_SEED = 20261110;
export const DEFAULT_TRIALS = 300;

function checkTrials(trials: number): void {
  if (!Number.isInteger(trials) || trials < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
}

export interface OpeningDist {
  judgment: Judgment;
  trials: number;
  seed: number;
  /** 영웅 보장, 전설 보장, 첫 바다 해역 도착까지 걸린 낚는 시간(초)의 분포. 못 끝낸 시도는 missing이다 */
  epic: Dist | null; legend: Dist | null; arrival: Dist | null;
  /** 목표 시간(10분) 안에 도착한 시도의 비율. 못 끝낸 시도가 있으면 null */
  within10: number | null;
  /** 해석 기댓값 — 전설 보장이 범위 가운데 번호일 때의 도착 시간(초). 못 닿으면 null */
  analytic: number;
}

export interface OpeningDistOptions { judgment: Judgment; trials: number; seed: number }

export function openingDist(o: OpeningDistOptions): OpeningDist {
  checkTrials(o.trials);
  const stream = rng(o.seed);
  const epic: number[] = [], legend: number[] = [], arrival: number[] = [];
  for (let i = 0; i < o.trials; i++) {
    const r = simulateOpening({ judgment: o.judgment, legendAt: 'draw', sampler: createSampler(stream) });
    const at = (rarity: string) => r.steps.find(s => s.kind === 'guarantee' && s.detail === rarity)?.seconds;
    const e = at('epic'), l = at('legendary');
    if (e !== undefined) epic.push(e);
    if (l !== undefined) legend.push(l);
    if (r.arrival) arrival.push(r.arrival.seconds);
  }
  const mid = Math.round((FIRST_CATCH_LEGEND_MIN + FIRST_CATCH_LEGEND_MAX) / 2);
  return {
    judgment: o.judgment, trials: o.trials, seed: o.seed,
    epic: summarize(epic, o.trials - epic.length), legend: summarize(legend, o.trials - legend.length),
    arrival: summarize(arrival, o.trials - arrival.length),
    within10: arrival.length < o.trials ? null : arrival.filter(s => s <= OPENING_TARGET_SEC).length / o.trials,
    analytic: simulateOpening({ judgment: o.judgment, legendAt: mid }).arrival?.seconds ?? Number.NaN,
  };
}

export interface TransitionDistOptions {
  trials: number; seed: number; axis: FlowAxis; maxDays: number; bagCapAwake: boolean;
  /** 깨어 있는 낚시 시간 중 판매 왕복에 쓰는 비중. 생략하면 0 */
  travelShare?: number;
}

export interface TransitionDist {
  from: SpotId; to: SpotId;
  /** 쉬지 않고 낚을 때 이 전환에 걸린 시간(시간)의 분포 */
  hours: Dist | null;
  /** 해석 기댓값(transition 명령의 연속 방치 소요, 시간). 최대 일수 안에 닿지 못했으면 null */
  analyticHours: number | null;
  /** 처음부터 이 전환까지 누적 시간(시간)의 분포와 해석 기댓값 */
  cumulative: Dist | null;
  analyticCumulative: number | null;
}

export function transitionDist(o: TransitionDistOptions): TransitionDist[] {
  checkTrials(o.trials);
  const base = { type: ALWAYS_ON, axis: o.axis, bounty: false, maxDays: o.maxDays, bagCapAwake: o.bagCapAwake, travelShare: o.travelShare };
  const analytic = transitionTimings(simulate(base).arrivals);
  const stream = rng(o.seed);
  const hours: number[][] = Array.from({ length: TRANSITION_COUNT }, () => []);
  const cumulative: number[][] = Array.from({ length: TRANSITION_COUNT }, () => []);
  for (let i = 0; i < o.trials; i++) {
    transitionTimings(simulate({ ...base, sampler: createSampler(stream) }).arrivals).forEach((t, k) => {
      hours[k].push(t.hours);
      cumulative[k].push(t.cumulativeHours);
    });
  }
  return SPOTS.slice(1).map((to, k) => ({
    from: SPOTS[k].id, to: to.id,
    hours: summarize(hours[k], o.trials - hours[k].length), analyticHours: analytic[k]?.hours ?? null,
    cumulative: summarize(cumulative[k], o.trials - cumulative[k].length), analyticCumulative: analytic[k]?.cumulativeHours ?? null,
  }));
}

/** 전환 수는 해역 수보다 하나 적다 */
const TRANSITION_COUNT = SPOTS.length - 1;
