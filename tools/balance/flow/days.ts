// 해역별 누적 도달 시간 — 새 계정이 각 해역에 처음 닿기까지의 누적 실질 낚시 시간과 8시간 환산 일수, 마지막 해역에서 다음 강화를 하는 데 걸리는 시간.
// 일반 의뢰와 네임드 토벌을 하지 않는 경우와 매일 하는 경우를 낸다. 하루는 실질 낚시 8시간이다.
// 가정은 진행 시뮬레이션과 의뢰 계획 모듈의 머리 주석을 따른다.
// 마지막 해역 레벨업은 그 레벨에 시뮬레이션이 닿은 시점에 실제로 가진 라이선스로 계산한 정상 상태의 하루 수입으로 나눈다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { MAX_BOAT } from '../../../src/game/content/boats';
import { upgradeCost } from '../../../src/game/rules/balance';
import { SPEC_MARGIN, entryLevel, rates } from '../model';
import type { Rates } from '../model';
import { licenseKey, planBounties } from './bounty';
import type { PlanInput } from './bounty';
import { DAY_HOURS, axisOf, fishingDays, simulate } from './progress';
import type { AchievementOptions, Achieved, FlowAxis, RatePlan } from './progress';

export interface DaysOptions {
  axis: FlowAxis; maxDays: number;
  /** 주면 이 계획으로 수입을 계산하고 효과 없는 값을 base로 함께 담는다 */
  plan?: RatePlan;
  /** 주면 진행 업적 보상을 지급하는 관측용 시뮬레이션을 더하고 보상 없는 값을 base로 함께 담는다 */
  reward?: AchievementOptions;
}

export interface ArrivalDays {
  /** 일반 의뢰와 네임드 토벌을 매일 수행하는가 */
  bounty: boolean;
  complete: boolean;
  /** 해역별 도착까지 누적 실질 낚시 시간(시간)과 8시간 환산 일수. 최대 일수 안에 못 닿았으면 null */
  spots: { spot: SpotId; hours: number | null; days: number | null }[];
  bountyGold: number;
  /** 업적 보상을 줬을 때 달성한 진행 업적과 지급 내역 */
  achieved?: Achieved[];
}

export interface LevelUp {
  bounty: boolean;
  /** 마지막 해역에서 이 레벨의 낚싯대를 다음 레벨로 올리는 강화 */
  level: number;
  upgradeGold: number;
  /** 낚싯대가 이 레벨에 닿은 누적 실질 낚시 시간(시간). 최대 일수 안에 못 닿았으면 null */
  reachedHours: number | null;
  /** 그 시점에 쓸 수 있는 의뢰 라이선스 */
  licenses: string[];
  /** 하루(실질 낚시 8시간) 골드 — 낚시와 의뢰·토벌의 합. 레벨에 못 닿았으면 null */
  dailyGold: number | null;
  /** 하루 골드 중 의뢰·토벌 보상의 비중 */
  bountyShare: number | null;
  /** 다음 강화비를 버는 실질 낚시 시간(시간)과 8시간 환산 일수 */
  hours: number | null;
  days: number | null;
}

export interface DaysReport { arrival: ArrivalDays[]; levelUp: LevelUp[]; base?: { arrival: ArrivalDays[]; levelUp: LevelUp[] } }

export interface SteadyInput {
  level: number;
  /** 이 라이선스로 의뢰와 토벌을 한다. null이면 수행하지 않는다 */
  licensed: PlanInput['licensed'] | null;
  axis: FlowAxis;
  /** 주면 이 계획의 수입과 시간당 비용으로 센다(배는 마지막 배) */
  plan?: RatePlan;
}

/** 마지막 해역에서 이 레벨로 실질 낚시 하루를 보낼 때의 골드(정상 상태) */
export function steadyDaily(i: SteadyInput): { dailyGold: number; bountyShare: number } {
  const last = SPOTS[SPOTS.length - 1].id;
  const cache = new Map<SpotId, Rates>();
  const rateAt = (spot: SpotId) => {
    let r = cache.get(spot);
    if (!r) {
      const axis = axisOf(i.axis, spot, i.level);
      r = i.plan ? i.plan.rateFor(spot, i.level, axis, MAX_BOAT) : rates(spot, i.level, axis);
      cache.set(spot, r);
    }
    return r;
  };
  const day = DAY_HOURS * 3600;
  const plan = i.licensed
    ? planBounties({ player: { boat: MAX_BOAT, level: i.level }, current: rateAt(last), rateAt, licensed: i.licensed, seconds: day })
    : [];
  const mean = (spots: SpotId[], f: (r: Rates) => number) => spots.reduce((s, sp) => s + f(rateAt(sp)), 0) / spots.length;
  const actSec = plan.reduce((s, a) => s + a.seconds, 0);
  const lump = plan.reduce((s, a) => s + a.lump, 0);
  const fishGold = plan.reduce((s, a) => s + mean(a.spots, r => r.goldPerHour) * a.seconds / 3600, 0)
    + rateAt(last).goldPerHour * (day - actSec) / 3600;
  const cost = i.plan ? i.plan.costPerHour(last, i.level, axisOf(i.axis, last, i.level), MAX_BOAT) * DAY_HOURS : 0;
  const dailyGold = fishGold + lump - cost;
  return { dailyGold, bountyShare: lump / (fishGold + lump) };
}

/** 의뢰 안 함, 모두 수행 순서로 해역별 누적 도달 시간과 마지막 해역 레벨업 시간을 낸다. plan을 주면 효과 없는 값을 base로 함께 낸다 */
export function daysReport(o: DaysOptions): DaysReport {
  const last = SPOTS[SPOTS.length - 1].id;
  const levels = [entryLevel(last), entryLevel(last) + SPEC_MARGIN];
  const build = (plan?: RatePlan, achievements?: AchievementOptions): { arrival: ArrivalDays[]; levelUp: LevelUp[] } => {
    const arrival: ArrivalDays[] = [], levelUp: LevelUp[] = [];
    for (const bounty of [false, true]) {
      const r = simulate({ axis: o.axis, bounty, maxDays: o.maxDays, growTo: bounty ? levels[1] : undefined, plan, achievements });
      arrival.push({
        bounty, complete: r.complete, bountyGold: r.bountyGold, ...(achievements ? { achieved: r.achieved } : {}),
        spots: SPOTS.map((s, i) => {
          const hours = r.arrivals[i]?.hours ?? null;
          return { spot: s.id, hours, days: hours === null ? null : fishingDays(hours) };
        }),
      });
      for (const level of levels) {
        const upgradeGold = upgradeCost(level);
        const mark = r.marks.find(m => m.level === level);
        if (bounty && !mark) {
          levelUp.push({ bounty, level, upgradeGold, reachedHours: null, licenses: [], dailyGold: null, bountyShare: null, hours: null, days: null });
          continue;
        }
        const held = new Set(mark?.licenses ?? []);
        const s = steadyDaily({ level, axis: o.axis, licensed: bounty ? (zone, tier) => held.has(licenseKey(zone, tier)) : null, plan });
        const days = upgradeGold / s.dailyGold;
        levelUp.push({
          bounty, level, upgradeGold, reachedHours: mark?.hours ?? null, licenses: mark?.licenses ?? [],
          dailyGold: s.dailyGold, bountyShare: s.bountyShare, hours: days * DAY_HOURS, days,
        });
      }
    }
    return { arrival, levelUp };
  };
  const report: DaysReport = build(o.plan, o.reward);
  if (o.plan || o.reward) report.base = build();
  return report;
}
