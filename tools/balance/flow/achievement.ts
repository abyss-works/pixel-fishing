// 진행 업적 보상 산출 — 구역의 진행 업적 두 개(기본 라이선스 조건, 네임드 라이선스 조건)가 나눠 받는 보상의 크기.
// 크기는 방치 EV가 아니라 보상 기준 전환(그 구역의 마지막 해역에서 다음 지역 첫 해역으로 넘어가는 전환)의 전환 골드와
// 그 전환에서 사는 배의 가장 높은 명성 요구치에 같은 비율을 곱해 정한다. 반올림은 의뢰 보상과 같은 자릿수 반올림이다.
// 비율과 두 업적의 나눔은 호출부가 인자로 준다. 이 모듈은 값을 정하지 않는다.
// 기준 값의 방식은 total(전환 골드와 배 명성 요구치 전체), incremental-fame(골드는 전체, 명성은 기준 전환의 증분 = 도착 배 요구치 - 출발 해역을 여는 배 요구치),
// ev-hours(골드를 출발 해역 딱렙 방치 EV 시간으로 바꿔 구역 대표 EV를 곱함, 명성은 증분)다. 기준 전환은 지정할 수 있다(가상 해역으로 가는 전환 포함).
// 두 업적에 나눌 때는 구역 크기를 먼저 반올림하고, 기본 업적은 구역 크기 x 몫을 반올림한 값, 네임드 업적은 나머지다. 그래서 두 업적의 합은 항상 구역 크기와 같다.
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyTier, BountyZone } from '../../../src/game/content/bounties';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { BOATS } from '../../../src/game/content/boats';
import { entryLevel, rates, spotsOfZone, zoneOf } from '../model';
import { roundReward } from './ev';
import { transitionGold } from './transitions';
import type { AchievementOptions } from './progress';

/** 보상 기준 값의 방식 */
export type RewardBasisMode = 'total' | 'incremental-fame' | 'ev-hours';
export const REWARD_BASIS_MODES: readonly RewardBasisMode[] = ['total', 'incremental-fame', 'ev-hours'];

export interface BasisTransition { from: SpotId; to: SpotId }

export interface RewardBasisOptions {
  /** 기본 total */
  mode?: RewardBasisMode;
  /** 구역별 기준 전환 지정. 지정하지 않은 구역은 그 구역 마지막 해역에서 다음 지역 첫 해역으로 넘어가는 전환이다 */
  transitions?: Partial<Record<BountyZone, BasisTransition>>;
}

export interface RewardBasis {
  zone: BountyZone;
  /** 구역의 마지막 해역과 다음 지역의 첫 해역(기준 전환을 지정했으면 그 전환). 다음 지역이 없으면 null */
  from: SpotId;
  to: SpotId | null;
  /** 보상 기준 값 — 보상 크기에 비율을 곱하는 골드와 명성. 기본 방식에서는 기준 전환의 전환 골드와 배 명성 요구치다. 기준 전환이 없으면 null */
  next: { totalGold: number; fameReq: number } | null;
  /** 방식이나 기준 전환을 줬을 때 기준 값을 만든 원 값 */
  source?: { mode: RewardBasisMode; transitionGold: number; boatFameReq: number; fameIncrement: number };
}

const heldFame = (spot: SpotId): number => BOATS.find(b => b.tier === SPOTS.find(s => s.id === spot)!.boatTier)?.fameReq ?? 0;

/** 인자 `구역=출발:도착`을 읽는다 */
export function parseBasisSpec(raw: string): { zone: BountyZone } & BasisTransition {
  const m = /^([^=]+)=([^:]+):(.+)$/.exec(raw);
  if (!m) throw new Error(`--basis 형식은 구역=출발:도착입니다: ${raw}`);
  return { zone: m[1] as BountyZone, from: m[2] as SpotId, to: m[3] as SpotId };
}

/** 구역마다 보상 기준 전환을 낸다. 구역 순서는 의뢰 구역 순서다 */
export function rewardBasis(o?: RewardBasisOptions): RewardBasis[] {
  const gold = transitionGold();
  const mode = o?.mode ?? 'total';
  for (const zone of Object.keys(o?.transitions ?? {})) {
    if (!(BOUNTY_ZONES as readonly string[]).includes(zone)) throw new Error(`기준 전환의 구역이 의뢰 구역이 아닙니다: ${zone} (${BOUNTY_ZONES.join(', ')})`);
  }
  return BOUNTY_ZONES.map(zone => {
    const custom = o?.transitions?.[zone];
    let from: SpotId, to: SpotId;
    if (custom) {
      ({ from, to } = custom);
      if (!gold.some(r => r.from === from && r.to === to)) throw new Error(`기준 전환이 이어지는 두 해역이 아닙니다: ${from} -> ${to}`);
    } else {
      from = spotsOfZone(zone).at(-1)!.id;
      const idx = SPOTS.findIndex(s => s.id === from);
      const next = SPOTS[idx + 1];
      if (!next || zoneOf(next.id) === zone) {
        if (next) throw new Error(`구역이 이어지지 않습니다: ${zone}`);
        return { zone, from, to: null, next: null };
      }
      to = next.id;
    }
    const row = gold.find(r => r.from === from && r.to === to)!;
    if (!o || (mode === 'total' && !custom)) return { zone, from, to, next: { totalGold: row.totalGold, fameReq: row.fameReq } };
    const fameIncrement = Math.max(0, row.fameReq - heldFame(from));
    let goldBase = row.totalGold;
    if (mode === 'ev-hours') {
      const last = spotsOfZone(zone).at(-1)!.id;
      const evFrom = rates(from, entryLevel(from), 'idle').goldPerHour, evRep = rates(last, entryLevel(last), 'idle').goldPerHour;
      goldBase = row.totalGold * (evRep / evFrom);
    }
    return {
      zone, from, to, next: { totalGold: goldBase, fameReq: mode === 'total' ? row.fameReq : fameIncrement },
      source: { mode, transitionGold: row.totalGold, boatFameReq: row.fameReq, fameIncrement },
    };
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

/** 구역 보상(반올림한 값)을 두 업적에 나눈다. 기본 업적은 구역 크기 x basicShare(0 이상 1 이하)를 반올림한 값이고 네임드 업적이 나머지를 받는다 */
export function splitReward(a: RewardAmount, basicShare: number): SplitReward {
  if (!(basicShare >= 0 && basicShare <= 1)) throw new Error(`두 업적의 나눔은 0 이상 1 이하여야 합니다: ${basicShare}`);
  const basic = { gold: Math.min(a.gold, roundReward(a.gold * basicShare)), fame: Math.min(a.fame, roundReward(a.fame * basicShare)) };
  return { basic, named: { gold: a.gold - basic.gold, fame: a.fame - basic.fame } };
}

export interface RewardRow extends RewardBasis {
  /** 비율마다의 보상 크기. 기준 전환이 없는 구역은 비어 있다. 나눔을 줬으면 split에 업적별 금액이 든다 */
  amounts: (RewardAmount & { split?: SplitReward })[];
}

export interface RewardRowsOptions {
  ratios: readonly number[];
  /** 기본 업적이 받는 몫(0 이상 1 이하). 생략하면 업적별 금액을 내지 않는다 */
  split?: number;
  /** 보상 기준 값의 방식과 기준 전환. 생략하면 기본(total, 구역 마지막 해역의 다음 지역 진입 전환) */
  basis?: RewardBasisOptions;
}

export function rewardRows(o: RewardRowsOptions): RewardRow[] {
  if (o.ratios.length === 0) throw new Error('보상 비율이 하나 이상 필요합니다');
  return rewardBasis(o.basis).map(b => ({
    ...b,
    amounts: o.ratios.flatMap(ratio => {
      const a = rewardAmounts(b, ratio);
      if (!a) return [];
      return [o.split === undefined ? a : { ...a, split: splitReward(a, o.split) }];
    }),
  }));
}

/** 진행 시뮬레이션에 넣는 보상 — 모든 구역에 같은 비율을 곱하고 기본 업적의 몫을 정해 두 업적에 나눈다. 기준 전환이 없는 구역은 지급하지 않는다 */
export function rewardPlan(ratio: number, basicShare: number, basis?: RewardBasisOptions): AchievementOptions {
  const byZone = new Map(rewardBasis(basis).map(b => {
    const a = rewardAmounts(b, ratio);
    return [b.zone, a ? splitReward(a, basicShare) : null] as const;
  }));
  return { reward: (zone, tier) => byZone.get(zone)?.[tier] ?? null };
}
