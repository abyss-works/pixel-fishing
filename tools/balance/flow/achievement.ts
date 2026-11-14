// 진행 업적 보상 산출 — 구역의 진행 업적 두 개(기본 도감, 도감 완결)가 나눠 받는 골드 보상의 크기.
// 크기는 구역 대표 방치 EV(구역 마지막 해역 진입 레벨의 시간당 방치 골드 수입) x 목표 시간어치를 의뢰 보상과 같은 자릿수 반올림한 골드다.
// 명성은 주지 않는다. 두 업적에 나눌 때는 반올림한 구역 보상 크기에 기본 몫을 곱해 같은 규칙으로 반올림하고, 도감 완결이 나머지를 받는다.
import type { BountyTier, BountyZone } from '../../../src/game/content/bounties';
import { roundReward, zoneEvs } from './ev';
import type { AchievementOptions } from './progress';

export const DEFAULT_ACHIEVEMENT_HOURS = 4;
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

/** 구역 보상(반올림한 값)을 두 업적에 나눈다. 기본 업적은 구역 크기 x basicShare를 반올림한 값이고 도감 완결 업적이 나머지를 받는다 */
export function splitReward(a: Reward, basicShare: number): SplitReward {
  checkShare(basicShare);
  const basic = { gold: Math.min(a.gold, roundReward(a.gold * basicShare)) };
  return { basic, named: { gold: a.gold - basic.gold } };
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
  return { reward: (zone, tier) => byZone.get(zone)?.[tier] ?? null };
}
