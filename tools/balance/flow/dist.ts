// 분포 지표 — 같은 규칙과 상수로 낚시를 캐치 단위로 시뮬레이션해(몬테카를로) 최초 10분과 해역 전환 시간의 분포를 낸다.
// 시드를 고정하면 같은 인자의 결과가 항상 같다. 해석적 기댓값(opening, transition 명령의 값)을 함께 담아 평균이 맞는지 비교한다.
// 느린 쪽(운이 나쁜 쪽)은 p90이다. 시간이 길수록 나쁘다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { FIRST_CATCH_LEGEND_MAX, FIRST_CATCH_LEGEND_MIN } from '../../../src/game/rules/firstCatch';
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyTier, BountyZone } from '../../../src/game/content/bounties';
import { rng } from '../model';
import { rewardBasis, rewardPlan } from './achievement';
import type { Reward, RewardBasisOptions } from './achievement';
import { simulateOpening, OPENING_TARGET_SEC } from './opening';
import type { Judgment } from './opening';
import { simulate } from './progress';
import type { Arrival, FlowAxis } from './progress';
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
  trials: number; seed: number; axis: FlowAxis; maxDays: number;
}

export interface TransitionDist {
  from: SpotId; to: SpotId;
  /** 이 전환에 걸린 실질 낚시 시간(시간)의 분포 */
  hours: Dist | null;
  /** 해석 기댓값(transition 명령의 전환 시간, 시간). 최대 일수 안에 닿지 못했으면 null */
  analyticHours: number | null;
  /** 처음부터 이 전환까지 누적 시간(시간)의 분포와 해석 기댓값 */
  cumulative: Dist | null;
  analyticCumulative: number | null;
}

export function transitionDist(o: TransitionDistOptions): TransitionDist[] {
  checkTrials(o.trials);
  const base = { axis: o.axis, bounty: false, maxDays: o.maxDays };
  const analytic = transitionTimings(simulate(base).arrivals);
  const stream = rng(o.seed);
  const hours: number[][] = Array.from({ length: SPOTS.length - 1 }, () => []);
  const cumulative: number[][] = Array.from({ length: SPOTS.length - 1 }, () => []);
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

export interface RewardDistOptions {
  trials: number; seed: number; axis: FlowAxis; maxDays: number;
  /** 보상 비율(0 초과 1 이하)과 기본 업적이 받는 몫(0 이상 1 이하) */
  ratio: number; basicShare: number;
  /** 보상 기준 값의 방식과 기준 전환. 생략하면 기본 */
  basis?: RewardBasisOptions;
}

export interface RewardDistRow {
  zone: BountyZone; tier: BountyTier;
  /** 이 업적에 지급하는 보상. 기준 전환이 없는 구역은 null */
  reward: Reward | null;
  /** 보상 없는 진행에서 이 업적을 채운 누적 실질 낚시 시간(시간)의 분포. 못 채운 시도는 missing이다 */
  achieved: Dist | null;
  /** 구역의 다음 지역 첫 해역과, 그 해역에 닿은 누적 시간의 분포(보상 없음, 보상 지급 포함). 다음 지역이 없으면 null */
  to: SpotId | null;
  arrival: Dist | null;
  arrivalWithReward: Dist | null;
  /** 같은 시도끼리 짝지은 도착 단축(보상 없는 도착 - 보상을 넣은 도착, 시간). 양수가 빨라진 쪽이다 */
  shortened: Dist | null;
}

/** 시도마다 따로 시드를 파생한다 — 보상 없는 진행과 보상을 넣은 진행이 같은 난수 흐름에서 출발하게 해 짝지어 비교한다 */
const trialRng = (seed: number, i: number) => rng((seed + Math.imul(i + 1, 0x9e3779b1)) >>> 0);

/** 구역 도감 완성(진행 업적 달성) 시각과 다음 지역 첫 해역 도착 시각의 분포를 같은 진행 모델에서 재고, 보상을 넣었을 때의 도착을 같은 시드로 짝지어 비교한다 */
export function rewardDist(o: RewardDistOptions): RewardDistRow[] {
  checkTrials(o.trials);
  const plan = rewardPlan(o.ratio, o.basicShare, o.basis);
  const basis = rewardBasis(o.basis);
  const sim = { axis: o.axis, bounty: false, maxDays: o.maxDays };
  const keys = BOUNTY_ZONES.flatMap(zone => (['basic', 'named'] as const).map(tier => ({ zone, tier })));
  const achieved = new Map<string, number[]>(keys.map(k => [`${k.zone}:${k.tier}`, []]));
  const arrival = new Map<string, number[]>(basis.map(b => [b.zone, []]));
  const withReward = new Map<string, number[]>(basis.map(b => [b.zone, []]));
  const shortened = new Map<string, number[]>(basis.map(b => [b.zone, []]));
  const arrivalAt = (arrivals: Arrival[], to: SpotId | null) => (to === null ? undefined : arrivals.find(a => a.spot === to)?.hours);
  for (let i = 0; i < o.trials; i++) {
    const plain = simulate({ ...sim, sampler: createSampler(trialRng(o.seed, i)), achievements: { reward: () => null } });
    const paid = simulate({ ...sim, sampler: createSampler(trialRng(o.seed, i)), achievements: plan });
    for (const a of plain.achieved) achieved.get(`${a.zone}:${a.tier}`)!.push(a.hours);
    for (const b of basis) {
      const h0 = arrivalAt(plain.arrivals, b.to), h1 = arrivalAt(paid.arrivals, b.to);
      if (h0 !== undefined) arrival.get(b.zone)!.push(h0);
      if (h1 !== undefined) withReward.get(b.zone)!.push(h1);
      if (h0 !== undefined && h1 !== undefined) shortened.get(b.zone)!.push(h0 - h1);
    }
  }
  return keys.map(({ zone, tier }) => {
    const b = basis.find(x => x.zone === zone)!;
    const a = achieved.get(`${zone}:${tier}`)!;
    const arr = arrival.get(zone)!, pay = withReward.get(zone)!, gap = shortened.get(zone)!;
    return {
      zone, tier, reward: plan.reward(zone, tier),
      achieved: summarize(a, o.trials - a.length),
      to: b.to,
      arrival: b.to === null ? null : summarize(arr, o.trials - arr.length),
      arrivalWithReward: b.to === null ? null : summarize(pay, o.trials - pay.length),
      shortened: b.to === null ? null : summarize(gap, o.trials - gap.length),
    };
  });
}
