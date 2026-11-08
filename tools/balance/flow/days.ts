// 플레이 유형별 실제 일수 — 해역에 처음 도착하는 날과, 마지막 해역에서 다음 강화를 하는 데 걸리는 날.
// 유형은 하루 접속 16, 8, 4, 2시간이고, 각각 일반 의뢰와 네임드 토벌을 하지 않는 경우와 매일 하는 경우를 낸다.
// 가정은 진행 시뮬레이션과 의뢰 계획 모듈의 머리 주석을 따른다. 마지막 해역 레벨업은 그 레벨에서 모든 라이선스가 있는 정상 상태의 하루 수입으로 계산한다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { MAX_BOAT } from '../../../src/game/content/boats';
import { upgradeCost } from '../../../src/game/rules/balance';
import { SPEC_MARGIN, entryLevel, rates } from '../model';
import type { Rates } from '../model';
import { planBounties } from './bounty';
import { axisOf, playTypes, simulate, sleepFishSeconds } from './progress';
import type { FlowAxis, PlayType } from './progress';

export interface DaysOptions { axis: FlowAxis; loss4h: number | null; maxDays: number; bagCapAwake?: boolean }

export interface ArrivalDays {
  type: PlayType;
  /** 일반 의뢰와 네임드 토벌을 매일 수행하는가 */
  bounty: boolean;
  complete: boolean;
  /** 해역별 도착한 날(첫날이 1). 최대 일수 안에 못 닿았으면 null */
  days: { spot: SpotId; day: number | null }[];
  bountyGold: number;
}

/** 유형마다 의뢰 안 함, 모두 수행 순서로 해역별 도착 일차를 낸다 */
export function arrivalDays(o: DaysOptions): ArrivalDays[] {
  return playTypes(o.loss4h).flatMap(type => [false, true].map(bounty => {
    const r = simulate({ type, axis: o.axis, bounty, maxDays: o.maxDays, bagCapAwake: o.bagCapAwake });
    return {
      type, bounty, complete: r.complete, bountyGold: r.bountyGold,
      days: SPOTS.map((s, i) => ({ spot: s.id, day: r.arrivals[i]?.day ?? null })),
    };
  }));
}

export interface LevelUp {
  type: PlayType;
  bounty: boolean;
  /** 마지막 해역에서 이 레벨의 낚싯대를 다음 레벨로 올리는 강화 */
  level: number;
  upgradeGold: number;
  /** 하루 골드 — 낚시, 의뢰와 토벌, 잠든 동안 낚시의 합 */
  dailyGold: number;
  /** 하루 골드 중 의뢰·토벌 보상의 비중 */
  bountyShare: number;
  days: number;
}

/** 마지막 해역의 진입 레벨과 +SPEC_MARGIN 레벨에서 다음 강화를 하는 데 걸리는 일수 */
export function levelUpDays(o: DaysOptions): LevelUp[] {
  const last = SPOTS[SPOTS.length - 1].id;
  const out: LevelUp[] = [];
  for (const level of [entryLevel(last), entryLevel(last) + SPEC_MARGIN]) {
    const cache = new Map<SpotId, Rates>();
    const rateAt = (spot: SpotId) => {
      let r = cache.get(spot);
      if (!r) { r = rates(spot, level, axisOf(o.axis, spot, level)); cache.set(spot, r); }
      return r;
    };
    const idle = rates(last, level, 'idle');
    for (const type of playTypes(o.loss4h)) {
      for (const bounty of [false, true]) {
        const awake = type.awakeHours * 3600;
        const plan = bounty
          ? planBounties({ player: { boat: MAX_BOAT, level }, current: rateAt(last), rateAt, licensed: () => true, seconds: awake })
          : [];
        const actSec = plan.reduce((s, a) => s + a.seconds, 0);
        const lump = plan.reduce((s, a) => s + a.lump, 0);
        const actGold = plan.reduce((s, a) => s + a.lump + a.spots.reduce((g, sp) => g + rateAt(sp).goldPerHour, 0) / a.spots.length * a.seconds / 3600, 0);
        const sleepSec = sleepFishSeconds(MAX_BOAT, idle.catchesPerHour, type.sleepHours * 3600);
        const dailyGold = actGold + rateAt(last).goldPerHour * (awake - actSec) / 3600 + idle.goldPerHour * sleepSec / 3600;
        const upgradeGold = upgradeCost(level);
        out.push({ type, bounty, level, upgradeGold, dailyGold, bountyShare: lump / dailyGold, days: upgradeGold / dailyGold });
      }
    }
  }
  return out;
}
