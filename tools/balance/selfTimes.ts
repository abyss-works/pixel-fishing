// 자기만족 업적 달성 시간 — 네임드 전부, 밤 어종, 등급별 전부, 월척, 낚은 수 단계를 몬테카를로로 재어 평균과 p90(시간)을 낸다.
// 가정(수집 절과 같다): 최소 스펙(해역 진입 레벨)으로 구역의 해역을 번갈아 낚고, 방치와 수동 GOOD(파워 미달 해역은 무판정) 두 방식을 잰다.
//   - 구역 수집: 구역 안에서는 해역을 캐치마다 번갈아 낚고, 여러 구역에 걸친 조건은 구역을 하나씩 차례로 채우는 시간의 합이다.
//     같은 구역에서 다른 조건도 함께 채워지지만, 각 조건의 시간은 그 조건 하나만 목표로 잰다.
//   - 일반 폼은 일반 폼만, 돌연변이 폼은 돌연변이 폼만 센다. 밤 어종은 낮밤 혼합 확률로 나온다(밤에만 나오는 비율이 시간에 섞여 있다).
//   - 월척은 캐치마다 크기 분포에서 상위 월척 기준 비율 안에 들 확률로 정하고 폼과 관계없이 센다. 월척 어종 수는 구역 구분 없이 세며, 구역을 구역 순서대로 하나씩 채운다고 보고 앞 구역을 모두 채운 시간에 이어 센다.
//   - 네임드는 어종마다 조우 확률과 천장(캐치 수)으로 조우까지 캐치 수를 뽑아 낚시 속도로 나눈 시간의 합이다. 라이선스 취득, 수주, 하루 한도, 결투는 넣지 않는다(결투는 이긴다).
//   - 낚은 수 단계는 새 계정 진행 시뮬레이션이 센 누적 캐치 수다. 진행이 끝난 뒤(마지막 해역 도착 이후)는 마지막 해역 진입 레벨의 캐치 속도로 이어 센다.
import { BOUNTIES } from '../../src/game/content/bounties';
import { FISH } from '../../src/game/content/fish';
import { RARITY_ORDER } from '../../src/game/content/rarity';
import type { RarityId } from '../../src/game/content/rarity';
import { SPOTS } from '../../src/game/content/spots';
import { BIG_CATCH_PERCENTILE } from '../../src/game/rules/balance';
import { mutationWeightsOf, namedEncounterCandidates, namedEncounterShare, variantShare } from '../../src/game/rules/logic';
import { NAMED_PITY_CATCHES } from '../../src/game/rules/pity';
import { ZONE_ORDER, axisAvailable, entryLevel, rates, rng, rodSpec, spotsOfZone } from './model';
import type { Axis } from './model';
import { axisOf, simulate } from './flow/progress';
import type { FlowAxis } from './flow/progress';

export type Play = 'idle' | 'manual';
export const PLAYS: readonly Play[] = ['idle', 'manual'];

export interface TimeStat { mean: number; p90: number }

/** 평균과 p90 — 수집 절의 통계와 같은 정의다(정렬한 뒤 90% 자리의 값) */
export function stat(xs: readonly number[]): TimeStat {
  if (xs.length === 0) throw new Error('값이 하나 이상 필요합니다');
  const s = [...xs].sort((a, b) => a - b);
  return { mean: s.reduce((a, b) => a + b, 0) / s.length, p90: s[Math.floor(s.length * 0.9)] };
}

const CAP_CATCHES = 3_000_000;
const BIG_PROB = BIG_CATCH_PERCENTILE / 100;

/** 해역을 진입 레벨로 낚을 때의 축 — 방치, 또는 수동(GOOD 존이 있으면 GOOD, 없으면 무판정) */
const playAxis = (spot: (typeof SPOTS)[number]['id'], play: Play): Axis =>
  play === 'idle' ? 'idle' : axisAvailable(rodSpec(spot, entryLevel(spot)), 'good') ? 'good' : 'normal';

export interface ZoneRunInput {
  zone: string;
  play: Play;
  rand: () => number;
  /** 월척 어종 수 단계 */
  big: readonly number[];
}

export interface ZoneRun {
  /** 등급마다 그 구역의 그 등급 일반 폼을 모두 모은 시각(시간). 그 등급 어종이 없으면 null, 모으지 못하면 무한대 */
  grade: Record<RarityId, number | null>;
  /** 밤 어종의 일반 폼과 돌연변이 폼을 모두 모은 시각. 그 구역에 밤 어종이 없으면 null */
  night: { normal: number | null; variant: number | null };
  /** 그 구역의 일반 폼을 모두 모은 시각 */
  all: number;
  /** 월척 어종 수가 단계에 닿은 시각. 구역 어종 수를 넘는 단계는 null */
  big: (number | null)[];
  /** 구역의 모든 어종에서 월척을 낚은 시각 */
  bigAll: number;
  /** 구역의 어종 수와, 월척 어종 수가 1, 2, ...에 처음 닿은 시각(시간). 못 닿은 단계는 곡선에 없다 */
  species: number;
  bigCurve: number[];
}

/** 구역 하나를 한 번 낚아 조건마다 채우는 시각을 잰다 — 한 번의 낚시로 모든 조건의 시각을 함께 기록한다 */
export function zoneRun(i: ZoneRunInput): ZoneRun {
  const spots = spotsOfZone(i.zone);
  const tables = spots.map(s => rates(s.id, entryLevel(s.id), playAxis(s.id, i.play)));
  const fish = FISH.filter(f => spots.some(s => s.id === f.spot));
  const nights = fish.filter(f => f.night);
  const gradeLeft = Object.fromEntries(RARITY_ORDER.map(g => [g, fish.filter(f => f.rarity === g).length])) as Record<RarityId, number>;
  const grade = Object.fromEntries(RARITY_ORDER.map(g => [g, gradeLeft[g] === 0 ? null : Number.POSITIVE_INFINITY])) as Record<RarityId, number | null>;
  const night = { normal: nights.length === 0 ? null : Number.POSITIVE_INFINITY, variant: nights.length === 0 ? null : Number.POSITIVE_INFINITY } as ZoneRun['night'];
  const big: (number | null)[] = i.big.map(n => (n > fish.length ? null : Number.POSITIVE_INFINITY));
  let all = Number.POSITIVE_INFINITY, bigAll = Number.POSITIVE_INFINITY;
  const bigCurve: number[] = [];
  const normalSeen = new Set<string>(), variantNight = new Set<string>(), bigSeen = new Set<string>();
  let normalLeft = fish.length, nightNormalLeft = nights.length, nightVariantLeft = nights.length;
  const bigPending = () => bigAll === Number.POSITIVE_INFINITY || big.some(t => t === Number.POSITIVE_INFINITY);
  const unfinished = () => normalLeft > 0 || nightVariantLeft > 0 || bigPending();
  let secs = 0, catches = 0;
  while (unfinished() && catches < CAP_CATCHES) {
    const t = tables[catches % tables.length];
    catches++; secs += 3600 / t.catchesPerHour;
    let r = i.rand();
    for (const row of t.rows) {
      r -= row.prob;
      if (r >= 0) continue;
      const f = row.fish;
      const hours = secs / 3600;
      if (i.rand() < variantShare(mutationWeightsOf({ artifacts: [] }, f.spot))) {
        if (f.night && !variantNight.has(f.id)) {
          variantNight.add(f.id);
          if (--nightVariantLeft === 0) night.variant = hours;
        }
      } else if (!normalSeen.has(f.id)) {
        normalSeen.add(f.id);
        if (--gradeLeft[f.rarity] === 0) grade[f.rarity] = hours;
        if (f.night && --nightNormalLeft === 0) night.normal = hours;
        if (--normalLeft === 0) all = hours;
      }
      if (i.rand() < BIG_PROB && !bigSeen.has(f.id)) {
        bigSeen.add(f.id);
        bigCurve.push(hours);
        i.big.forEach((n, k) => { if (big[k] === Number.POSITIVE_INFINITY && bigSeen.size >= n) big[k] = hours; });
        if (bigSeen.size === fish.length) bigAll = hours;
      }
      break;
    }
  }
  return { grade, night, all, big, bigAll, species: fish.length, bigCurve };
}

export interface NamedTimes {
  /** 네임드를 모두 한 번씩 토벌할 때까지의 시간(시간) — 네임드마다 조우 시간의 합 */
  hours: number;
  each: { quest: string; catches: number; hours: number }[];
}

/** 네임드마다 조우까지 캐치 수(천장 안)를 뽑아 낚시 속도로 나눈 시간의 합 */
export function namedTimes(play: Play, rand: () => number): NamedTimes {
  const each = BOUNTIES.filter(q => q.difficulty === 'named').map(q => {
    const spots = spotsOfZone(q.zone).filter(s => namedEncounterCandidates([q.id], s.id).length > 0);
    const p = spots.reduce((s, sp) => s + namedEncounterShare(sp.id), 0) / spots.length;
    const cph = spots.reduce((s, sp) => s + rates(sp.id, entryLevel(sp.id), playAxis(sp.id, play)).catchesPerHour, 0) / spots.length;
    const draw = Math.ceil(Math.log(1 - rand()) / Math.log(1 - p));
    const catches = Math.min(Math.max(1, draw), NAMED_PITY_CATCHES);
    return { quest: q.id, catches, hours: catches / cph };
  });
  return { hours: each.reduce((s, e) => s + e.hours, 0), each };
}

export interface CatchTime { n: number; hours: number }

/** 새 계정 진행에서 누적 낚은 수가 단계에 닿는 시간. 진행이 끝난 뒤는 마지막 해역 진입 레벨의 캐치 속도로 이어 센다 */
export function catchTimes(play: Play, steps: readonly number[]): CatchTime[] {
  const flow: FlowAxis = play;
  const r = simulate({ axis: flow, bounty: false, maxDays: 365, catchMarks: steps });
  const last = SPOTS[SPOTS.length - 1].id;
  const lv = entryLevel(last);
  const cph = rates(last, lv, axisOf(flow, last, lv)).catchesPerHour;
  const end = r.arrivals[r.arrivals.length - 1].hours;
  return steps.map((n, k) => ({ n, hours: r.catchHours[k] ?? end + (n - r.catches) / cph }));
}

/** 구역을 순서대로 하나씩 채울 때 월척 어종 수가 n에 닿는 시각. 앞 구역은 월척 어종을 모두 모은 뒤 다음 구역으로 넘어간다. 전체 어종 수보다 큰 n은 null */
export function bigTotal(zones: readonly Pick<ZoneRun, 'species' | 'bigCurve'>[], n: number): number | null {
  let left = n, t = 0;
  for (const z of zones) {
    if (left <= z.species) return t + (z.bigCurve[left - 1] ?? Number.POSITIVE_INFINITY);
    t += z.bigCurve[z.species - 1] ?? Number.POSITIVE_INFINITY;
    left -= z.species;
  }
  return null;
}

export interface BigRow {
  n: number;
  /** 구역 구분 없이 월척 어종 n종을 모으는 시간(구역 순서대로 하나씩 채움). 전체 어종 수를 넘는 단계는 null */
  total: TimeStat | null;
  /** 참고: 구역마다 그 구역 안에서만 월척 어종 n종을 모으는 시간. 구역 어종 수를 넘는 단계는 null */
  zones: { zone: string; time: TimeStat | null }[];
}

export interface SelfTimes {
  play: Play;
  /** 모든 구역의 그 등급 일반 폼을 모두 모으는 시간(구역을 차례로 채운 합) */
  grades: Record<RarityId, TimeStat>;
  /** 밤 어종의 일반 폼, 돌연변이 폼을 모두 모으는 시간(구역 합) */
  night: { normal: TimeStat; variant: TimeStat };
  /** 네임드를 모두 한 번씩 토벌하는 시간. 네임드 토벌마다 유물 교환 재료가 하나 나오므로 유물을 모두 처음 갖는 시간과 같다(교환 자체는 재료 하나다) */
  named: TimeStat;
  big: BigRow[];
  /** 모든 구역의 모든 어종에서 월척을 낚는 시간(구역 합) */
  bigAll: TimeStat;
  catches: CatchTime[];
}

export interface SelfTimesInput {
  runs: number; seed: number;
  /** 월척 어종 수 단계(호출부가 인자로 준다) */
  big: readonly number[];
  /** 낚은 수 단계 */
  catchSteps: readonly number[];
}

const sum = (xs: readonly (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

export function selfTimes(o: SelfTimesInput): SelfTimes[] {
  if (!Number.isInteger(o.runs) || o.runs < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
  return PLAYS.map(play => {
    const rand = rng(o.seed);
    const byZone = new Map(ZONE_ORDER.map(zone => [zone, Array.from({ length: o.runs }, () => zoneRun({ zone, play, rand, big: o.big }))]));
    const total = (pick: (r: ZoneRun) => number | null): TimeStat =>
      stat(Array.from({ length: o.runs }, (_, k) => sum(ZONE_ORDER.map(z => pick(byZone.get(z)![k])))));
    const named = Array.from({ length: o.runs }, () => namedTimes(play, rand).hours);
    return {
      play,
      grades: Object.fromEntries(RARITY_ORDER.map(g => [g, total(r => r.grade[g])])) as Record<RarityId, TimeStat>,
      night: { normal: total(r => r.night.normal), variant: total(r => r.night.variant) },
      named: stat(named),
      big: o.big.map((n, k) => ({
        n,
        total: bigTotal(ZONE_ORDER.map(z => byZone.get(z)![0]), n) === null ? null
          : stat(Array.from({ length: o.runs }, (_, r) => bigTotal(ZONE_ORDER.map(z => byZone.get(z)![r]), n)!)),
        zones: ZONE_ORDER.map(zone => {
          const xs = byZone.get(zone)!.map(r => r.big[k]);
          return { zone, time: xs.some(x => x === null) ? null : stat(xs as number[]) };
        }),
      })),
      bigAll: total(r => r.bigAll),
      catches: o.catchSteps.length === 0 ? [] : catchTimes(play, o.catchSteps),
    };
  });
}
