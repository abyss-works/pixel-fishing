// 진행 업적 보상 산출 — 구역 또는 해역의 진행 업적 두 개(기본/기초, 완결/숙련)가 나눠 받는 골드 보상의 크기.
// 구역 단위는 구역 대표 방치 EV(구역 마지막 해역 진입 레벨의 시간당 방치 골드 수입) x 목표 시간어치,
// 해역 단위는 min(해역 진입 레벨 1시간 방치 EV x 목표 시간어치, 다음 해역 전환 골드 x 0.30)(마지막 해역은 방치 EV 기준)을
// 의뢰 보상과 같은 자릿수 반올림한 골드다. 명성은 주지 않는다.
// 두 업적에 나눌 때는 반올림한 합계에 기본 몫을 곱해 같은 규칙으로 반올림하고, 나머지 한쪽이 차액을 받는다.
import type { BountyTier, BountyZone } from '../../../src/game/content/bounties';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { entryLevel, rates, zoneOf } from '../model';
import { virtualZoneOf } from '../virtualSpots';
import { roundReward, zoneEvs } from './ev';
import type { AchievementOptions } from './progress';
import { transitionGold } from './transitions';

export type RewardUnit = 'zone' | 'spot';

export const DEFAULT_ACHIEVEMENT_HOURS = 4;
export const DEFAULT_SPOT_ACHIEVEMENT_HOURS = 1;
export const DEFAULT_SPOT_TRANSITION_CAP = 0.3;
export const DEFAULT_BASIC_SHARE = 0.5;

export interface Reward { gold: number }

export interface RewardAmount extends Reward {
  hours: number;
  /** 반올림 전 값 */
  rawGold: number;
}

function checkHours(hours: number): void {
  if (!Number.isFinite(hours) || hours <= 0) throw new Error(`목표 시간은 0보다 큰 유한한 숫자여야 합니다: ${hours}`);
}

function checkShare(basicShare: number): void {
  if (!Number.isFinite(basicShare) || basicShare < 0 || basicShare > 1) {
    throw new Error(`두 업적의 나눔은 0 이상 1 이하의 유한한 숫자여야 합니다: ${basicShare}`);
  }
}

/** 구역 대표 방치 EV와 목표 시간어치로 구역 보상 크기(두 업적을 합친 골드)를 계산한다 */
export function rewardAmounts(ev: number, hours: number): RewardAmount {
  checkHours(hours);
  const rawGold = ev * hours;
  return { hours, rawGold, gold: roundReward(rawGold) };
}

export type SplitReward = Record<BountyTier, Reward>;

/** 구역 보상(반올림한 값)을 두 업적에 나눈다. basicShare <= 0.5이면 기초가 숙련보다 크지 않도록 보정한다 */
export function splitReward(a: Reward, basicShare: number): SplitReward {
  checkShare(basicShare);
  const first = Math.min(a.gold, roundReward(a.gold * basicShare));
  const second = a.gold - first;
  if (basicShare <= 0.5 && first > second) {
    return { basic: { gold: second }, named: { gold: first } };
  }
  return { basic: { gold: first }, named: { gold: second } };
}

export interface RewardRow {
  zone: BountyZone;
  /** 구역 대표 방치 EV (G/h) */
  ev: number;
  amounts: (RewardAmount & { split?: SplitReward })[];
}

export interface RewardRowsOptions {
  hours?: readonly number[];
  /** 기본 업적이 받는 몫(0 이상 1 이하). 생략하면 업적별 금액을 내지 않는다 */
  split?: number;
}

export function rewardRows(o: RewardRowsOptions = {}): RewardRow[] {
  const hoursList = o.hours ?? [DEFAULT_ACHIEVEMENT_HOURS];
  if (hoursList.length === 0) throw new Error('목표 시간이 하나 이상 필요합니다');
  for (const h of hoursList) checkHours(h);
  if (o.split !== undefined) checkShare(o.split);
  return zoneEvs().map(({ zone, ev }) => ({
    zone,
    ev,
    amounts: hoursList.map(h => {
      const a = rewardAmounts(ev, h);
      return o.split === undefined ? a : { ...a, split: splitReward(a, o.split) };
    }),
  }));
}

/** 진행 시뮬레이션에 넣는 보상 — 모든 구역에 같은 목표 시간어치를 적용하고 기본 업적의 몫을 정해 두 업적에 나눈다 */
export function rewardPlan(hours = DEFAULT_ACHIEVEMENT_HOURS, basicShare = DEFAULT_BASIC_SHARE): AchievementOptions {
  checkHours(hours);
  checkShare(basicShare);
  const byZone = new Map(zoneEvs().map(({ zone, ev }) => [zone, splitReward(rewardAmounts(ev, hours), basicShare)] as const));
  return { unit: 'zone', reward: (zone, tier) => byZone.get(zone)?.[tier] ?? null };
}

export interface SpotRewardEv {
  spot: SpotId;
  zone: string;
  entryLevel: number;
  /** 해역 진입 레벨의 시간당 방치 골드 수입 (G/h) */
  ev: number;
}

/** 13개 낚시 해역별 진입 레벨 방치 EV */
export function spotEvs(): SpotRewardEv[] {
  return SPOTS
    .filter(s => virtualZoneOf(s.id) === undefined)
    .map(s => {
      const lv = entryLevel(s.id);
      return { spot: s.id, zone: zoneOf(s.id), entryLevel: lv, ev: rates(s.id, lv, 'idle').goldPerHour };
    });
}

export interface SpotRewardRow {
  spot: SpotId;
  zone: string;
  entryLevel: number;
  ev: number;
  amounts: (RewardAmount & { split?: SplitReward })[];
}

/** 해역 진입 레벨 방치 EV와 다음 해역 전환 골드 상한으로 해역 보상 합계를 계산한다. 마지막 해역(nextTransitionGold === null)은 방치 EV 기준만 쓴다 */
export function spotRewardAmounts(
  ev: number,
  hours: number,
  nextTransitionGold: number | null,
  cap = DEFAULT_SPOT_TRANSITION_CAP,
): RewardAmount {
  checkHours(hours);
  const evGold = ev * hours;
  const rawGold = nextTransitionGold !== null ? Math.min(evGold, nextTransitionGold * cap) : evGold;
  return { hours, rawGold, gold: roundReward(rawGold) };
}

function nextTransitionGoldBySpot(): Map<SpotId, number> {
  return new Map(transitionGold().map(t => [t.from, t.totalGold]));
}

export function spotRewardRows(o: RewardRowsOptions = {}): SpotRewardRow[] {
  const hoursList = o.hours ?? [DEFAULT_SPOT_ACHIEVEMENT_HOURS];
  if (hoursList.length === 0) throw new Error('목표 시간이 하나 이상 필요합니다');
  for (const h of hoursList) checkHours(h);
  if (o.split !== undefined) checkShare(o.split);
  const nextGold = nextTransitionGoldBySpot();
  return spotEvs().map(({ spot, zone, entryLevel: lv, ev }) => ({
    spot,
    zone,
    entryLevel: lv,
    ev,
    amounts: hoursList.map(h => {
      const a = spotRewardAmounts(ev, h, nextGold.get(spot) ?? null);
      return o.split === undefined ? a : { ...a, split: splitReward(a, o.split) };
    }),
  }));
}

/** 진행 시뮬레이션에 넣는 해역 단위 보상 — 13개 해역 각각에 기초·숙련 26종 진행 업적을 둔다 */
export function spotRewardPlan(hours = DEFAULT_SPOT_ACHIEVEMENT_HOURS, basicShare = DEFAULT_BASIC_SHARE): AchievementOptions {
  checkHours(hours);
  checkShare(basicShare);
  const nextGold = nextTransitionGoldBySpot();
  const bySpot = new Map(
    spotEvs().map(({ spot, ev }) => [
      spot,
      splitReward(spotRewardAmounts(ev, hours, nextGold.get(spot) ?? null), basicShare),
    ] as const),
  );
  return {
    unit: 'spot',
    reward: () => null,
    spotReward: (spot, tier) => bySpot.get(spot)?.[tier] ?? null,
  };
}
