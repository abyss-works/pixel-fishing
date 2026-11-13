// 해역 전환 — 다음 해역으로 옮기는 데 드는 골드(다음 진입 레벨까지 강화비 + 새 배 가격)와 그 비중,
// 직전 해역에서 방치로 낚아 걸린 실질 낚시 시간, 배 명성을 기다린 시간, 8시간 환산 일수를 낸다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { BOATS } from '../../../src/game/content/boats';
import type { Boat } from '../../../src/game/content/boats';
import { upgradeCost } from '../../../src/game/rules/balance';
import { entryLevel } from '../model';
import { fishingDays, simulate } from './progress';
import type { AchievementOptions, Achieved, Arrival, FlowAxis, RatePlan } from './progress';

export interface TransitionRow {
  from: SpotId; to: SpotId;
  /** 다음 해역의 진입 레벨 */
  toLevel: number;
  /** 이 전환에서 새로 사는 배 */
  boats: Boat[];
  upgradeGold: number; boatGold: number; totalGold: number;
  /** 전환 골드 중 강화비와 배 가격의 비중(0~1) */
  upgradeShare: number; boatShare: number;
  /** 산 배 중 가장 높은 명성 요구치(배가 없으면 0) */
  fameReq: number;
}

/** 전환마다 드는 골드 — 직전 해역의 진입 레벨에서 다음 해역의 진입 레벨까지 강화비 합과, 그 사이에 새로 사는 배 값 */
export function transitionGold(): TransitionRow[] {
  return SPOTS.slice(1).map((to, i) => {
    const from = SPOTS[i];
    const toLevel = entryLevel(to.id);
    let upgradeGold = 0;
    for (let lv = entryLevel(from.id); lv < toLevel; lv++) upgradeGold += upgradeCost(lv);
    const boats = BOATS.filter(b => b.tier > from.boatTier && b.tier <= to.boatTier).map(b => ({ ...b }));
    const boatGold = boats.reduce((s, b) => s + b.price, 0);
    const totalGold = upgradeGold + boatGold;
    return {
      from: from.id, to: to.id, toLevel, boats, upgradeGold, boatGold, totalGold,
      upgradeShare: totalGold > 0 ? upgradeGold / totalGold : 0,
      boatShare: totalGold > 0 ? boatGold / totalGold : 0,
      fameReq: Math.max(0, ...boats.map(b => b.fameReq)),
    };
  });
}

export interface TransitionTiming {
  row: TransitionRow;
  /** 직전 해역 도착부터 이번 도착까지 낚은 실질 낚시 시간(시간) */
  hours: number;
  cumulativeHours: number;
  /** 8시간 환산 일수 */
  days: number;
  cumulativeDays: number;
  /** 기다린 시간(시간) — 골드만, 명성만, 둘 다 모자란 시간 */
  waitGold: number; waitFame: number; waitBoth: number;
  /** 골드가 막은 시간(골드만 + 둘 다)과 배 명성이 막은 시간(명성만 + 둘 다) */
  goldWait: number; fameWait: number;
  /** 명성 대기 ÷ 골드 대기. 골드 대기가 0이면 null */
  fameOverGold: number | null;
}

/** 도착 기록을 전환별 소요로 바꾼다 */
export function transitionTimings(arrivals: Arrival[]): TransitionTiming[] {
  const rows = transitionGold();
  return arrivals.slice(1).map((a, i) => {
    const goldWait = a.waitGold + a.waitBoth, fameWait = a.waitFame + a.waitBoth;
    return {
      row: rows[i], hours: a.hours - arrivals[i].hours, cumulativeHours: a.hours,
      days: fishingDays(a.hours - arrivals[i].hours), cumulativeDays: fishingDays(a.hours),
      waitGold: a.waitGold, waitFame: a.waitFame, waitBoth: a.waitBoth,
      goldWait, fameWait, fameOverGold: goldWait > 0 ? fameWait / goldWait : null,
    };
  });
}

export interface TransitionReport {
  rows: TransitionRow[];
  timings: TransitionTiming[];
  complete: boolean;
  /** 효과 계획이나 업적 보상을 줬을 때 그것이 없는 같은 조건의 전환 시간 */
  base?: TransitionTiming[];
  /** 업적 보상을 줬을 때 달성한 진행 업적과 지급 내역 */
  achieved?: Achieved[];
}

export interface TransitionOptions {
  axis: FlowAxis; maxDays: number;
  /** 일반 의뢰와 네임드 토벌을 매일 수행하는가. 기본은 수행하지 않는다 */
  bounty?: boolean;
  /** 주면 이 계획으로 수입을 계산하고 효과 없는 값을 base로 함께 담는다 */
  plan?: RatePlan;
  /** 주면 진행 업적 보상을 지급하는 관측용 시뮬레이션을 더하고 보상 없는 값을 base로 함께 담는다 */
  reward?: AchievementOptions;
}

export function transitionReport(o: TransitionOptions): TransitionReport {
  const run = (plan?: RatePlan, achievements?: AchievementOptions) =>
    simulate({ axis: o.axis, bounty: o.bounty ?? false, maxDays: o.maxDays, plan, achievements });
  const r = run(o.plan, o.reward);
  const report: TransitionReport = { rows: transitionGold(), timings: transitionTimings(r.arrivals), complete: r.complete };
  if (o.plan || o.reward) report.base = transitionTimings(run().arrivals);
  if (o.reward) report.achieved = r.achieved;
  return report;
}
