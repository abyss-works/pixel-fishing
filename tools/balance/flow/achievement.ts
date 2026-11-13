// 진행 업적 보상 산출 — 구역의 진행 업적 두 개(기본 라이선스 조건, 네임드 라이선스 조건)가 나눠 받는 보상의 크기.
// 크기는 방치 EV가 아니라 보상 기준 전환(그 구역의 마지막 해역에서 다음 지역 첫 해역으로 넘어가는 전환)의 전환 골드와
// 그 전환에서 사는 배의 가장 높은 명성 요구치에 같은 비율을 곱해 정한다. 반올림은 의뢰 보상과 같은 자릿수 반올림이다.
// 비율과 두 업적의 나눔은 정해지지 않은 값이라 호출부가 인자로 준다. 이 모듈은 값을 정하지 않는다.
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyTier, BountyZone } from '../../../src/game/content/bounties';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { spotsOfZone, zoneOf } from '../model';
import { roundReward } from './ev';
import { transitionGold } from './transitions';
import type { AchievementOptions } from './progress';

export interface RewardBasis {
  zone: BountyZone;
  /** 구역의 마지막 해역과 다음 지역의 첫 해역. 다음 지역이 없으면 null */
  from: SpotId;
  to: SpotId | null;
  /** 보상 기준 전환의 전환 골드와 배 명성 요구치. 기준 전환이 없으면 null */
  next: { totalGold: number; fameReq: number } | null;
}

/** 구역마다 보상 기준 전환을 낸다. 구역 순서는 의뢰 구역 순서다 */
export function rewardBasis(): RewardBasis[] {
  const gold = transitionGold();
  return BOUNTY_ZONES.map(zone => {
    const from = spotsOfZone(zone).at(-1)!.id;
    const idx = SPOTS.findIndex(s => s.id === from);
    const to = SPOTS[idx + 1];
    if (!to || zoneOf(to.id) === zone) {
      if (to) throw new Error(`구역이 이어지지 않습니다: ${zone}`);
      return { zone, from, to: null, next: null };
    }
    const row = gold.find(r => r.from === from)!;
    return { zone, from, to: to.id, next: { totalGold: row.totalGold, fameReq: row.fameReq } };
  });
}

export interface Reward { gold: number; fame: number }

export interface RewardAmount extends Reward {
  ratio: number;
  /** 반올림 전 값 */
  rawGold: number; rawFame: number;
}

function checkRatio(ratio: number): void {
  if (!(ratio > 0 && ratio <= 1)) throw new Error(`보상 비율은 0보다 크고 1 이하여야 합니다: ${ratio}`);
}

/** 구역 하나의 보상 크기(두 업적을 합친 값). 기준 전환이 없으면 null */
export function rewardAmounts(b: RewardBasis, ratio: number): RewardAmount | null {
  checkRatio(ratio);
  if (!b.next) return null;
  const rawGold = b.next.totalGold * ratio, rawFame = b.next.fameReq * ratio;
  return { ratio, rawGold, rawFame, gold: roundReward(rawGold), fame: roundReward(rawFame) };
}

export type SplitReward = Record<BountyTier, Reward>;

/** 구역 보상을 두 업적에 나눈다. 기본 업적이 basicShare(0 이상 1 이하)를, 네임드 업적이 나머지를 받고 각각 반올림한다 */
export function splitReward(a: RewardAmount, basicShare: number): SplitReward {
  if (!(basicShare >= 0 && basicShare <= 1)) throw new Error(`두 업적의 나눔은 0 이상 1 이하여야 합니다: ${basicShare}`);
  return {
    basic: { gold: roundReward(a.rawGold * basicShare), fame: roundReward(a.rawFame * basicShare) },
    named: { gold: roundReward(a.rawGold * (1 - basicShare)), fame: roundReward(a.rawFame * (1 - basicShare)) },
  };
}

export interface RewardRow extends RewardBasis {
  /** 비율마다의 보상 크기. 기준 전환이 없는 구역은 비어 있다. 나눔을 줬으면 split에 업적별 금액이 든다 */
  amounts: (RewardAmount & { split?: SplitReward })[];
}

export interface RewardRowsOptions {
  ratios: readonly number[];
  /** 기본 업적이 받는 몫(0 이상 1 이하). 생략하면 업적별 금액을 내지 않는다 */
  split?: number;
}

export function rewardRows(o: RewardRowsOptions): RewardRow[] {
  if (o.ratios.length === 0) throw new Error('보상 비율이 하나 이상 필요합니다');
  return rewardBasis().map(b => ({
    ...b,
    amounts: o.ratios.flatMap(ratio => {
      const a = rewardAmounts(b, ratio);
      if (!a) return [];
      return [o.split === undefined ? a : { ...a, split: splitReward(a, o.split) }];
    }),
  }));
}

/** 진행 시뮬레이션에 넣는 보상 — 모든 구역에 같은 비율을 곱하고 기본 업적의 몫을 정해 두 업적에 나눈다. 기준 전환이 없는 구역은 지급하지 않는다 */
export function rewardPlan(ratio: number, basicShare: number): AchievementOptions {
  const byZone = new Map(rewardBasis().map(b => {
    const a = rewardAmounts(b, ratio);
    return [b.zone, a ? splitReward(a, basicShare) : null] as const;
  }));
  return { reward: (zone, tier) => byZone.get(zone)?.[tier] ?? null };
}
