// 진행 시뮬레이션 — 새 계정이 열린 가장 뒤 해역에서 낚고, 다음 해역에 필요한 배와 강화를 살 수 있으면 바로 사서 옮긴다.
// 모든 시간은 실질 낚시 시간이다. 선택하면 하루 의뢰와 네임드 토벌을 더한다.
// 가정: 판매는 즉시이고 미끼·유물·쿠폰은 없다. 이동, 창 조작, 가방 한도는 넣지 않는다(낚은 물고기는 모두 판매 수입이다). 명성을 기다리는 동안은 다음 해역 진입 레벨을 넘겨 강화하지 않고 골드를 쌓는다.
//       하루는 실질 낚시 8시간이고, 하루 안의 순서는 의뢰, 일반 낚시다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { FISH } from '../../../src/game/content/fish';
import { BOATS } from '../../../src/game/content/boats';
import { mutationWeightsOf, newState, variantShare } from '../../../src/game/rules/logic';
import { canBuyBoat } from '../../../src/game/rules/rules';
import { MAX_BOAT } from '../../../src/game/content/boats';
import { powerOfLevel } from '../rodRules';
import { BIG_CATCH_PERCENTILE, upgradeCost } from '../../../src/game/rules/balance';
import { axisAvailable, rates, rodSpec, zoneOf } from '../model';
import type { Axis, Pool, Rates } from '../model';
import { virtualZoneOf } from '../virtualSpots';
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyTier, BountyZone } from '../../../src/game/content/bounties';
import { licenseHeld, licenseKey, planBounties, spotLicenseFish, spotLicenseHeld, zoneAchievementFish, zoneAchievementHeld } from './bounty';
import type { Activity, DexLog } from './bounty';
import type { Reward, RewardUnit } from './achievement';
import { createCounterBonusTracker } from './counterBonus';
import type { CounterBonusConfig, CounterUnlock } from './counterBonus';
import { NO_EFFECT, checkEffect, effectRates, scaleSlotEffect } from './effects';
import type { Effect } from './effects';
import type { Sampler } from './sample';

/** 일수 환산 기준 — 실질 낚시 시간을 이 값으로 나눈 것이 일수다. 환산 기준은 이 하나다 */
export const DAY_HOURS = 8;

/** 실질 낚시 시간(시간)을 일수로 환산한다 */
export const fishingDays = (hours: number): number => hours / DAY_HOURS;

/** 낚시 방식 — 방치, 수동(GOOD), PERFECT. PERFECT는 효과 지표(effects, window)에서만 쓴다 */
export type FlowAxis = 'idle' | 'manual' | 'perfect';

/** 낚는 방식 → 이 해역과 레벨에서 쓰는 축 — 수동은 GOOD 존이 있으면 GOOD, 없으면(파워 미달) 무판정이다. PERFECT는 빨간 존이 열렸는지와 관계없이 PERFECT 다이얼을 적용한다(PERFECT 이상치 게이트와 같은 상한 측정) */
export const axisOf = (flow: FlowAxis, spot: SpotId, level: number): Axis => {
  if (flow === 'idle') return 'idle';
  if (flow === 'perfect') return 'perfect';
  return axisAvailable(rodSpec(spot, level), 'good') ? 'good' : 'normal';
};

/** 수입 계산의 계획 — 배 단계마다 다른 수입 계산(효과를 넣는 조건 등)과 시간당 비용을 준다 */
export interface RatePlan {
  rateFor(spot: SpotId, level: number, axis: Axis, boat: number, pool?: Pool): Rates;
  /** 낚시 시간당 비용(골드). 낚는 동안 수입에서 뺀다 */
  costPerHour(spot: SpotId, level: number, axis: Axis, boat: number): number;
  /** (선택) 이 해역·레벨·배 단계에서 적용 중인 효과 매개변수 — 다른 보너스와 같은 대상끼리 합산할 때 쓴다 */
  effectAt?(spot: SpotId, level: number, boat: number): Effect | null;
}

/** 진행 업적(구역 또는 해역 도감 완성) 기록과 보상 지급 */
export interface AchievementOptions {
  /** 보상 단위 — 기본 'zone', 'spot'이면 전체 13개 해역 각각 기초·숙련 26종 */
  unit?: RewardUnit;
  /** zone 단위일 때 달성한 업적에 지급할 골드. null이면 지급하지 않고 달성 시각만 기록한다 */
  reward: (zone: BountyZone, tier: BountyTier) => Reward | null;
  /** spot 단위일 때 달성한 업적에 지급할 골드. 생략하거나 null이면 지급하지 않는다 */
  spotReward?: (spot: SpotId, tier: BountyTier) => Reward | null;
}

/** 달성한 진행 업적 — 구역 또는 해역의 일반 폼 도감 조건(기초/기본은 전설 제외, 숙련/완결은 전설 포함)을 채운 시점 */
export interface Achieved {
  zone: BountyZone | string; tier: BountyTier;
  /** 달성까지 누적 실질 낚시 시간(시간)과 그때 낚던 해역 */
  hours: number; spot: SpotId;
  /** spot 단위일 때 달성한 대상 해역 */
  targetSpot?: SpotId;
  /** 지급한 보상. 지급하지 않았으면 null */
  granted: Reward | null;
}

export interface SimOptions {
  axis: FlowAxis;
  /** 주면 이 계획으로 수입을 계산한다. 생략하면 효과 없는 측정 모델이다 */
  plan?: RatePlan;
  /** 하루 의뢰와 네임드 토벌을 수행하는가 */
  bounty: boolean;
  /** 시뮬레이션 최대 일수(하루는 실질 낚시 DAY_HOURS시간) */
  maxDays: number;
  /** 주면 낚은 수입을 기댓값 대신 캐치마다 뽑은 표본으로 센다(몬테카를로). 생략하면 기댓값 경로다 */
  sampler?: Sampler;
  /** 마지막 해역에 닿은 뒤에도 이 레벨까지 강화를 이어 가며 레벨별 보유 라이선스를 기록한다. 생략하면 도착에서 멈춘다 */
  growTo?: number;
  /** 주면 진행 업적 달성을 기록하고 보상을 지급한다. 기댓값 경로는 구역 도감 완성 확률이 라이선스 문턱을 넘은 시점, 표본 경로는 실제로 뽑은 일반 폼이 조건을 채운 시점이다 */
  achievements?: AchievementOptions;
  /** 주면 누적 캐치 수가 이 값들에 처음 닿은 시점(누적 실질 낚시 시간)을 기록한다. 한 걸음 안에서는 캐치가 고르게 쌓인다고 보고 보간한다 */
  catchMarks?: readonly number[];
  /** 주면 월척 기록 어종 수(크기 상위 기준 확률, 폼 무관)가 이 목표들에 처음 닿은 시점(누적 실질 낚시 시간)을 기록한다.
   *  마지막 해역 도달 후에도 도달 가능한 최대 목표에 미달하면 미수집 월척 어종이 남은 해역을 순회해 이어서 수집한다 */
  bigMarks?: readonly number[];
  /** 주면 진행 중 카운터 누적에 따라 임계점을 넘은 보너스를 동적으로 누적 합산해 반영한다 */
  counterBonus?: CounterBonusConfig;
}

/** 마지막 해역에서 낚싯대가 이 레벨에 닿은 시점의 상태 */
export interface LevelMark {
  level: number;
  /** 그 시점까지 누적 실질 낚시 시간(시간) */
  hours: number;
  /** 그 시점에 쓸 수 있는 의뢰 라이선스(`구역:기본|네임드`). 의뢰를 수행하지 않는 시뮬레이션은 비어 있다 */
  licenses: string[];
  /** 카운터 보너스를 줬을 때 그 시점의 누적 보너스를 고정한 수입 계획 */
  plan?: RatePlan;
}

export interface Arrival {
  spot: SpotId;
  /** 도착까지 누적 낚시 시간(시간) */
  hours: number;
  /** 직전 도착 이후 기다린 낚시 시간(시간) — 골드만, 명성만, 둘 다 모자란 시간 */
  waitGold: number; waitFame: number; waitBoth: number;
}

export interface SimResult {
  arrivals: Arrival[];
  /** 마지막 해역까지 도착했는가 */
  complete: boolean;
  /** 의뢰와 토벌로 번 골드의 합 */
  bountyGold: number;
  /** growTo를 준 경우 마지막 해역 도착 이후 레벨별 기록 */
  marks: LevelMark[];
  /** 달성한 진행 업적(achievements 옵션을 줬을 때). 달성 순서다 */
  achieved: Achieved[];
  /** 시뮬레이션이 끝날 때까지 누적 캐치 수와, catchMarks마다 닿은 시점(시간). 닿기 전에 끝났으면 null */
  catches: number;
  catchHours: (number | null)[];
  /** bigMarks마다 월척 어종 수가 목표에 처음 닿은 시점(시간). 도달 불가하거나 최대 일수 안에 못 닿았으면 null */
  bigMarkHours: (number | null)[];
  /** counterBonus를 줬을 때 임계점을 넘어 해금된 단계 목록(시간 순) */
  counterUnlocks?: CounterUnlock[];
}

export const STEP_SEC = 60;
const BIG_PROB = BIG_CATCH_PERCENTILE / 100;

/** 해역 열림 조건 — 배 단계와 낚싯대 파워 */
export const opens = (spot: (typeof SPOTS)[number], boat: number, level: number) =>
  boat >= spot.boatTier && powerOfLevel(level) >= (spot.powerReq ?? 0);

const nextBoat = (boat: number) => BOATS.find(b => b.tier === boat + 1);

/** 배 구매 가능 여부 — 제품 규칙 함수의 판정 */
const boatBuyable = (boat: number, gold: number, fame: number) => {
  // 제품 규칙은 배 상한을 불러올 때의 배 수로 굳혀 두어, 가상 배(상한 위)는 같은 조건(골드와 명성)을 직접 견준다
  if (boat >= MAX_BOAT) { const next = nextBoat(boat); return !!next && fame >= next.fameReq && gold >= next.price; }
  return canBuyBoat({ ...newState(), boat, gold, fame }).ok;
};

/** 진행 상태 중 다음 해역 구매·대기 판정에 쓰는 최소 필드 */
export interface SpotProgress {
  gold: number;
  fame: number;
  level: number;
  boat: number;
}

export type WaitKind = 'gold' | 'fame' | 'both';

/** 다음 해역에 필요한 배와 파워 강화를 살 수 있는 만큼 산다. 배를 샀는지 돌려준다 */
export function buyForSpot(next: (typeof SPOTS)[number], state: SpotProgress): boolean {
  let boughtBoat = false;
  let bought = true;
  while (bought) {
    bought = false;
    const need = next.boatTier > state.boat ? nextBoat(state.boat) : undefined;
    if (need && boatBuyable(state.boat, state.gold, state.fame)) {
      state.gold -= need.price;
      state.boat = need.tier;
      bought = true;
      boughtBoat = true;
    }
    if (powerOfLevel(state.level) < (next.powerReq ?? 0) && state.gold >= upgradeCost(state.level)) {
      state.gold -= upgradeCost(state.level);
      state.level += 1;
      bought = true;
    }
  }
  return boughtBoat;
}

/** 다음 해역 진입에 무엇이 모자란지(골드·명성·둘 다) 판정한다 */
export function missingForSpot(next: (typeof SPOTS)[number], state: SpotProgress): WaitKind {
  const boatLeft = state.boat < next.boatTier ? nextBoat(state.boat) : undefined;
  let goldNeed = boatLeft?.price ?? 0;
  for (let lv = state.level; powerOfLevel(lv) < (next.powerReq ?? 0); lv++) goldNeed += upgradeCost(lv);
  const goldShort = state.gold < goldNeed;
  const fameShort = !!boatLeft && state.fame < boatLeft.fameReq;
  return goldShort && fameShort ? 'both' : fameShort ? 'fame' : 'gold';
}

/** 아티팩트가 없을 때 해역의 일반 폼(비돌연변이) 비율 */
export const normalFormShare = (spot: SpotId): number =>
  1 - variantShare(mutationWeightsOf({ artifacts: [] }, spot));

export function simulate(opts: SimOptions): SimResult {
  const LAST = SPOTS.length - 1;
  let gold = 0, fame = 0, level = 1, boat = 0, idx = 0, fishSec = 0, bountyGold = 0;
  let waitGold = 0, waitFame = 0, waitBoth = 0;
  const marks: LevelMark[] = [];
  const growTo = opts.growTo ?? 0;
  const bigMarks = opts.bigMarks ?? [];
  const bigMarkHours: (number | null)[] = bigMarks.map(() => null);
  const trackBigMarks = bigMarks.length > 0;
  const spotIds = new Set<SpotId>(SPOTS.map(s => s.id));
  const spotFish = new Map<SpotId, string[]>(
    SPOTS.map(s => [s.id, FISH.filter(f => f.spot === s.id).map(f => f.id)]),
  );
  const totalSpecies = FISH.filter(f => spotIds.has(f.spot)).length;
  const reachableBigTarget = trackBigMarks
    ? bigMarks.reduce((m, v) => (v <= totalSpecies && v > m ? v : m), 0)
    : 0;
  const bigSeen = new Set<string>();
  let patrolCursor = 0;
  const tracker = opts.counterBonus ? createCounterBonusTracker(opts.counterBonus) : null;
  if (tracker) tracker.evaluate(0, SPOTS[0].id);
  const finished = () =>
    idx >= LAST && level >= growTo && (!trackBigMarks || !opts.sampler || bigSeen.size >= reachableBigTarget);
  const arrivals: Arrival[] = [{ spot: SPOTS[0].id, hours: 0, waitGold: 0, waitFame: 0, waitBoth: 0 }];
  const dex: DexLog = new Map();
  const cache = new Map<string, Rates>();
  const normalShare = new Map<SpotId, number>();
  const achieved: Achieved[] = [];
  const catchMarks = opts.catchMarks ?? [];
  const catchHours: (number | null)[] = catchMarks.map(() => null);
  let catchTotal = 0;
  const noteCatches = (step: number, sec: number) => {
    const before = catchTotal;
    catchTotal += step;
    catchMarks.forEach((m, i) => {
      if (catchHours[i] === null && catchTotal >= m) catchHours[i] = (fishSec + (step > 0 ? (m - before) / step : 0) * sec) / 3600;
    });
  };
  /** 표본 경로에서 실제로 모은 일반 폼 */
  const normalSeen = new Set<string>();
  const needed = new Map<string, string[]>();
  const neededOf = (zone: BountyZone, tier: BountyTier): string[] => {
    const key = `zone:${zone}:${tier}`;
    let ids = needed.get(key);
    if (!ids) { ids = zoneAchievementFish(zone, tier).map(f => f.id); needed.set(key, ids); }
    return ids;
  };
  const spotNeededOf = (spot: SpotId, tier: BountyTier): string[] => {
    const key = `spot:${spot}:${tier}`;
    let ids = needed.get(key);
    if (!ids) { ids = spotLicenseFish(spot, tier).map(f => f.id); needed.set(key, ids); }
    return ids;
  };
  const realSpots = SPOTS.filter(s => virtualZoneOf(s.id) === undefined);
  /** 도감을 기댓값 경로의 확률로 쌓는가 — 의뢰 수행(라이선스)이나 기댓값 경로의 업적 기록 */
  const trackExpected = opts.bounty || (!!opts.achievements && !opts.sampler);

  const axisAt = (spot: SpotId, lv: number): Axis => axisOf(opts.axis, spot, lv);
  const hasAnyEffect = (e: Effect): boolean =>
    e.bite !== 0 || e.rare !== 0 || e.epic !== 0 || e.legendary !== 0 || e.variant !== 0
    || e.size !== 0 || e.move !== 0 || e.named !== 0 || e.night !== 0
    || (e.sell ?? 0) !== 0 || (e.big ?? 0) !== 0 || (e.nightWeight ?? 0) !== 0;
  const mergeFx = (a: Effect, b: Effect): Effect => {
    const sell = (a.sell ?? 0) + (b.sell ?? 0);
    const big = (a.big ?? 0) + (b.big ?? 0);
    const nightWeight = (a.nightWeight ?? 0) + (b.nightWeight ?? 0);
    const merged: Effect = {
      bite: a.bite + b.bite, rare: a.rare + b.rare, epic: a.epic + b.epic, legendary: a.legendary + b.legendary,
      variant: a.variant + b.variant, size: a.size + b.size, move: a.move + b.move, named: a.named + b.named,
      night: a.night > 0 || b.night > 0 ? 1 : 0,
      ...(sell !== 0 ? { sell } : {}), ...(big !== 0 ? { big } : {}), ...(nightWeight !== 0 ? { nightWeight } : {}),
    };
    checkEffect(merged);
    return merged;
  };
  const rateAt = (spot: SpotId, axis: Axis = axisAt(spot, level)): Rates => {
    const key = `${spot}:${level}:${axis}:${opts.plan ? boat : ''}:${tracker ? tracker.version : ''}`;
    let r = cache.get(key);
    if (!r) {
      if (tracker) {
        const { effect, baitAmplify, lunchAmplify } = tracker.activeFor(spot);
        const planFx = opts.plan?.effectAt?.(spot, level, boat) ?? null;
        if (planFx) {
          const amp = axis === 'idle' ? lunchAmplify : baitAmplify;
          r = effectRates(spot, level, axis, mergeFx(scaleSlotEffect(planFx, amp), effect));
        } else if (hasAnyEffect(effect)) {
          r = effectRates(spot, level, axis, effect);
        } else {
          r = opts.plan ? opts.plan.rateFor(spot, level, axis, boat) : rates(spot, level, axis);
        }
      } else {
        r = opts.plan ? opts.plan.rateFor(spot, level, axis, boat) : rates(spot, level, axis);
      }
      cache.set(key, r);
    }
    return r;
  };

  /** 낚은 캐치의 도감 기록 — 일반 폼을 한 번도 못 잡을 확률의 로그를 쌓는다 */
  const track = (spot: SpotId, r: Rates, catches: number) => {
    if (!trackExpected) return;
    let share = normalShare.get(spot);
    if (share === undefined) { share = normalFormShare(spot); normalShare.set(spot, share); }
    const vs = (r as { variantShare?: number }).variantShare;
    if (vs !== undefined) share = 1 - vs;
    for (const row of r.rows) {
      const p = row.prob * share;
      if (p > 0) dex.set(row.fish.id, (dex.get(row.fish.id) ?? 0) + catches * Math.log1p(-p));
    }
  };

  /** 낚은 수입을 더한다. 낚은 물고기는 모두 판매 수입이다 */
  const accrue = (spots: SpotId[], axis: Axis | null, sec: number) => {
    const h = sec / 3600 / spots.length;
    let stepCatches = 0;
    const needBigRoll = Boolean(trackBigMarks || tracker?.needsBigTrack);
    const needCatchCb = Boolean(opts.achievements || trackBigMarks || tracker);
    for (let si = 0; si < spots.length; si++) {
      const spot = spots[si];
      const useAxis = axis ?? axisAt(spot, level);
      const r = rateAt(spot, useAxis);
      const planFx = opts.plan?.effectAt?.(spot, level, boat) ?? null;
      const baitActive = useAxis !== 'idle' && planFx !== null && hasAnyEffect(planFx) && planFx !== NO_EFFECT;
      const lunchActive = useAxis === 'idle' && planFx !== null && hasAnyEffect(planFx) && planFx !== NO_EFFECT;
      const bigProb = tracker ? tracker.activeFor(spot).bigProb : BIG_PROB;
      if (opts.plan) gold -= opts.plan.costPerHour(spot, level, useAxis, boat) * h;
      if (opts.sampler) {
        const slotOffsetSec = si * h * 3600;
        const v = opts.sampler.accrue(
          r,
          h * 3600,
          needCatchCb
            ? (c, elapsedSec) => {
              if (opts.achievements && !c.variant) normalSeen.add(c.fish.id);
              const isBig = needBigRoll && opts.sampler!.rng() < bigProb;
              if (isBig && trackBigMarks && !bigSeen.has(c.fish.id)) {
                bigSeen.add(c.fish.id);
                const nowHours = (fishSec + slotOffsetSec + elapsedSec) / 3600;
                bigMarks.forEach((m, i) => {
                  if (bigMarkHours[i] === null && m <= totalSpecies && bigSeen.size >= m) {
                    bigMarkHours[i] = nowHours;
                  }
                });
              }
              if (tracker) tracker.recordCatch(spot, useAxis, c, baitActive, isBig, lunchActive);
            }
            : undefined,
        );
        gold += v.gold; fame += v.fame;
        stepCatches += v.catches;
        track(spot, r, v.catches);
      } else {
        const spotGold = r.goldPerHour * h;
        const spotCatches = r.catchesPerHour * h;
        gold += spotGold; fame += r.famePerHour * h;
        stepCatches += spotCatches;
        track(spot, r, spotCatches);
        if (tracker) tracker.recordStep(spot, useAxis, r, spotCatches, spotGold, baitActive, lunchActive);
      }
    }
    noteCatches(stepCatches, sec);
    fishSec += sec;
    if (tracker) tracker.evaluate(fishSec / 3600, spots[spots.length - 1]);
  };

  /** 새로 채운 진행 업적을 기록하고 보상을 지급한다. 의뢰 활동 중이면 at이 활동 해역이다 */
  const settleAchievements = (at?: SpotId) => {
    const a = opts.achievements;
    if (!a) return;
    if (a.unit === 'spot') {
      for (const s of realSpots) {
        for (const tier of ['basic', 'named'] as const) {
          if (achieved.some(x => x.targetSpot === s.id && x.tier === tier)) continue;
          const done = opts.sampler ? spotNeededOf(s.id, tier).every(id => normalSeen.has(id)) : spotLicenseHeld(dex, s.id, tier);
          if (!done) continue;
          const granted = a.spotReward ? a.spotReward(s.id, tier) : null;
          if (granted) gold += granted.gold;
          achieved.push({ zone: zoneOf(s.id), targetSpot: s.id, tier, hours: fishSec / 3600, spot: at ?? SPOTS[idx].id, granted });
        }
      }
      return;
    }
    for (const zone of BOUNTY_ZONES) {
      for (const tier of ['basic', 'named'] as const) {
        if (achieved.some(x => x.zone === zone && x.tier === tier)) continue;
        const done = opts.sampler ? neededOf(zone, tier).every(id => normalSeen.has(id)) : zoneAchievementHeld(dex, zone, tier);
        if (!done) continue;
        const granted = a.reward(zone, tier);
        if (granted) gold += granted.gold;
        achieved.push({ zone, tier, hours: fishSec / 3600, spot: at ?? SPOTS[idx].id, granted });
      }
    }
  };

  const licensesNow = (): string[] => !opts.bounty ? [] : BOUNTY_ZONES.flatMap(zone =>
    (['basic', 'named'] as const).filter(tier => licenseHeld(dex, zone, tier)).map(tier => licenseKey(zone, tier)));
  const mark = () => {
    if (growTo > 0) {
      marks.push({
        level, hours: fishSec / 3600, licenses: licensesNow(),
        ...(tracker ? { plan: tracker.snapshotPlan(opts.plan) } : {}),
      });
    }
  };

  /** 필요한 배와 강화를 사고 열린 해역으로 옮긴다. 못 옮겼으면 무엇이 모자랐는지 dt초를 센다 */
  const settle = (dt: number) => {
    while (idx < LAST) {
      const next = SPOTS[idx + 1];
      const state: SpotProgress = { gold, fame, level, boat };
      buyForSpot(next, state);
      ({ gold, boat, level } = state);
      if (opens(next, boat, level)) {
        idx += 1;
        arrivals.push({ spot: next.id, hours: fishSec / 3600, waitGold: waitGold / 3600, waitFame: waitFame / 3600, waitBoth: waitBoth / 3600 });
        waitGold = waitFame = waitBoth = 0;
        if (idx >= LAST) mark();
        continue;
      }
      const wait = missingForSpot(next, state);
      if (wait === 'both') waitBoth += dt; else if (wait === 'fame') waitFame += dt; else waitGold += dt;
      return;
    }
    while (level < growTo && gold >= upgradeCost(level)) { gold -= upgradeCost(level); level += 1; mark(); }
  };

  /** 마지막 해역 도달 후에도 목표 월척 종수에 미달하면 미수집 어종이 남은 해역을 순서대로 순회한다 */
  const patrolSpot = (): SpotId => {
    const remaining = SPOTS.filter(s => (spotFish.get(s.id) ?? []).some(id => !bigSeen.has(id)));
    if (remaining.length === 0) return SPOTS[idx].id;
    const chosen = remaining[patrolCursor % remaining.length];
    patrolCursor += 1;
    return chosen.id;
  };

  const fishFor = (spots: SpotId[] | null, axis: Axis | null, seconds: number) => {
    for (let left = seconds; left > 1e-9 && !finished();) {
      const dt = Math.min(STEP_SEC, left);
      const targetSpots = spots ?? [idx >= LAST && level >= growTo && trackBigMarks && bigSeen.size < reachableBigTarget ? patrolSpot() : SPOTS[idx].id];
      accrue(targetSpots, axis, dt);
      settleAchievements(spots?.[0]);
      left -= dt;
      settle(dt);
    }
  };

  const runActivity = (a: Activity) => {
    fishFor(a.spots, null, a.seconds);
    gold += a.lump; bountyGold += a.lump;
    if (tracker && a.kind === 'named') {
      tracker.recordNamedClear(a.zone);
      tracker.evaluate(fishSec / 3600, a.spots[0] ?? SPOTS[idx].id);
    }
    settle(0);
  };

  for (let day = 1; day <= opts.maxDays && !finished(); day++) {
    settle(0);
    let left = DAY_HOURS * 3600;
    if (opts.bounty && !finished()) {
      const spot = SPOTS[idx].id;
      const plan = planBounties({
        player: { boat, level }, current: rateAt(spot), rateAt: s => rateAt(s),
        licensed: (zone, tier) => licenseHeld(dex, zone, tier), seconds: left,
      });
      for (const a of plan) { runActivity(a); left -= a.seconds; }
    }
    if (!finished()) fishFor(null, null, left);
  }
  return {
    arrivals, complete: idx >= LAST, bountyGold, marks, achieved, catches: catchTotal, catchHours, bigMarkHours,
    ...(tracker ? { counterUnlocks: tracker.unlocks } : {}),
  };
}
