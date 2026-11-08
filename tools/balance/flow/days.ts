// 플레이 유형별 실제 일수 — 해역에 처음 도착하는 날과, 마지막 해역에서 다음 강화를 하는 데 걸리는 날.
// 유형은 하루 접속 16, 8, 4(낚시 100%, 75%, 50%), 2, 1시간이고, 각각 일반 의뢰와 네임드 토벌을 하지 않는 경우와 매일 하는 경우를 낸다.
// 가정은 진행 시뮬레이션과 의뢰 계획 모듈의 머리 주석을 따른다.
// 마지막 해역 레벨업은 그 레벨에 시뮬레이션이 닿은 시점에 실제로 가진 라이선스로 계산한 정상 상태의 하루 수입으로 나눈다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { MAX_BOAT } from '../../../src/game/content/boats';
import { capOfBoat } from '../../../src/game/rules/logic';
import { upgradeCost } from '../../../src/game/rules/balance';
import { SPEC_MARGIN, entryLevel, rates } from '../model';
import type { Rates } from '../model';
import { licenseKey, planBounties } from './bounty';
import type { PlanInput } from './bounty';
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

export interface LevelUp {
  type: PlayType;
  bounty: boolean;
  /** 마지막 해역에서 이 레벨의 낚싯대를 다음 레벨로 올리는 강화 */
  level: number;
  upgradeGold: number;
  /** 낚싯대가 이 레벨에 닿은 날. 최대 일수 안에 못 닿았으면 null */
  day: number | null;
  /** 그 시점에 쓸 수 있는 의뢰 라이선스 */
  licenses: string[];
  /** 하루 골드 — 낚시, 의뢰와 토벌, 잠든 동안 낚시의 합. 레벨에 못 닿았으면 null */
  dailyGold: number | null;
  /** 하루 골드 중 의뢰·토벌 보상의 비중 */
  bountyShare: number | null;
  days: number | null;
}

export interface DaysReport { arrival: ArrivalDays[]; levelUp: LevelUp[] }

export interface SteadyInput {
  level: number;
  type: PlayType;
  /** 이 라이선스로 의뢰와 토벌을 한다. null이면 수행하지 않는다 */
  licensed: PlanInput['licensed'] | null;
  axis: FlowAxis;
  bagCapAwake: boolean;
}

/** 마지막 해역에서 이 레벨로 하루를 보낼 때의 골드(정상 상태) */
export function steadyDaily(i: SteadyInput): { dailyGold: number; bountyShare: number } {
  const last = SPOTS[SPOTS.length - 1].id;
  const cache = new Map<SpotId, Rates>();
  const rateAt = (spot: SpotId) => {
    let r = cache.get(spot);
    if (!r) { r = rates(spot, i.level, axisOf(i.axis, spot, i.level)); cache.set(spot, r); }
    return r;
  };
  const idle = rates(last, i.level, 'idle');
  const awake = i.type.awakeHours * 3600;
  const plan = i.licensed
    ? planBounties({ player: { boat: MAX_BOAT, level: i.level }, current: rateAt(last), rateAt, licensed: i.licensed, seconds: awake })
    : [];
  const mean = (spots: SpotId[], f: (r: Rates) => number) => spots.reduce((s, sp) => s + f(rateAt(sp)), 0) / spots.length;
  const actSec = plan.reduce((s, a) => s + a.seconds, 0);
  const lump = plan.reduce((s, a) => s + a.lump, 0);
  const fishGold = plan.reduce((s, a) => s + mean(a.spots, r => r.goldPerHour) * a.seconds / 3600, 0)
    + rateAt(last).goldPerHour * (awake - actSec) / 3600;
  const catches = plan.reduce((s, a) => s + mean(a.spots, r => r.catchesPerHour) * a.seconds / 3600, 0)
    + rateAt(last).catchesPerHour * (awake - actSec) / 3600;
  // 가방 한도를 적용하면 깨어 있는 동안 한 번도 팔지 않아 가방이 찬 뒤의 캐치는 골드가 되지 않는다
  const bagFrac = i.bagCapAwake && catches > 0 ? Math.min(1, capOfBoat(MAX_BOAT) / catches) : 1;
  const sleepSec = sleepFishSeconds(MAX_BOAT, idle.catchesPerHour, i.type.sleepHours * 3600);
  const dailyGold = fishGold * bagFrac + lump + idle.goldPerHour * sleepSec / 3600;
  return { dailyGold, bountyShare: lump / dailyGold };
}

/** 유형마다 의뢰 안 함, 모두 수행 순서로 해역별 도착 일차와 마지막 해역 레벨업 일수를 낸다 */
export function daysReport(o: DaysOptions): DaysReport {
  const last = SPOTS[SPOTS.length - 1].id;
  const levels = [entryLevel(last), entryLevel(last) + SPEC_MARGIN];
  const arrival: ArrivalDays[] = [], levelUp: LevelUp[] = [];
  for (const type of playTypes(o.loss4h)) {
    for (const bounty of [false, true]) {
      const r = simulate({
        type, axis: o.axis, bounty, maxDays: o.maxDays, bagCapAwake: o.bagCapAwake, growTo: bounty ? levels[1] : undefined,
      });
      arrival.push({
        type, bounty, complete: r.complete, bountyGold: r.bountyGold,
        days: SPOTS.map((s, i) => ({ spot: s.id, day: r.arrivals[i]?.day ?? null })),
      });
      for (const level of levels) {
        const upgradeGold = upgradeCost(level);
        const mark = r.marks.find(m => m.level === level);
        if (bounty && !mark) {
          levelUp.push({ type, bounty, level, upgradeGold, day: null, licenses: [], dailyGold: null, bountyShare: null, days: null });
          continue;
        }
        const held = new Set(mark?.licenses ?? []);
        const s = steadyDaily({
          level, type, axis: o.axis, bagCapAwake: o.bagCapAwake ?? false,
          licensed: bounty ? (zone, tier) => held.has(licenseKey(zone, tier)) : null,
        });
        levelUp.push({
          type, bounty, level, upgradeGold, day: mark?.day ?? null, licenses: mark?.licenses ?? [],
          dailyGold: s.dailyGold, bountyShare: s.bountyShare, days: upgradeGold / s.dailyGold,
        });
      }
    }
  }
  return { arrival, levelUp };
}

export const arrivalDays = (o: DaysOptions): ArrivalDays[] => daysReport(o).arrival;
export const levelUpDays = (o: DaysOptions): LevelUp[] => daysReport(o).levelUp;
