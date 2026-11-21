// 업적 규칙 — 순수 진척 판정, 달성 전이, 이벤트 기반 카운터 증분, 누적 보너스 합산.
// 측정 방식(metric)으로만 분기한다 — 업적 id 접두사 분기는 없다.
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import {
  ACHIEVEMENTS, CUMULATIVE_BONUS_SERIES, achievementRuleById, selectorFish, selectorIds, selectorTargetCount,
} from '../content/achievements.js';
import type {
  AchievementCounters, AchievementMap, AchievementMetric, AchievementRule,
  CumulativeBonusMetric, CumulativeBonusSeries, CumulativeBonusStep,
} from '../content/achievements.js';
import { ARTIFACT_MAX_LEVEL, artifactById, artifactHasLevel } from '../content/artifacts.js';
import { FISH, fishById } from '../content/fish.js';
import { topZoneOfSpot } from '../content/zones.js';
import type { ZoneId } from '../content/zones.js';
import type { GameEvent } from './actions.js';
import { artifactLevelOf } from './artifactLevel.js';
import type { ArtifactHolder } from './artifactLevel.js';
import type { AchievementBonuses } from './effects.js';
import { formDiscovered, isBigSize } from './logic.js';
import type { GameState } from './logic.js';

export interface AchievementProgress {
  current: number;
  target: number;
  met: boolean;
}

export interface CumulativeBonusProgress {
  current: number;
  completedSteps: number;
  activeDelta: number;
  maxDelta: number;
  nextStep: CumulativeBonusStep | null;
}

export interface CumulativeBonusContribution {
  series: CumulativeBonusSeries;
  current: number;
  completedSteps: number;
  activeDelta: number;
}

const clean = (x: number): number => Math.round(x * 1e9) / 1e9;

/** 카운터 값 — 동적 키(규칙의 counterSet)도 읽을 수 있게 문자열 키로 본다 */
const countersOf = (state: GameState): Partial<Record<string, number | undefined>> =>
  state.achievementCounters;

/** 최고 레벨 유물 수 — Lv5 유물과 고정 레벨 전설 유물을 모두 포함한다 */
export function maxArtifactCount(state: ArtifactHolder): number {
  let count = 0;
  for (const id of state.artifacts) {
    const art = artifactById(id);
    if (!art) continue;
    if (!artifactHasLevel(art) || artifactLevelOf(state, id) >= ARTIFACT_MAX_LEVEL) {
      count++;
    }
  }
  return count;
}

const LEGENDARY_IDS_BY_ZONE = new Map<ZoneId, readonly string[]>();
for (const fish of FISH) {
  if (fish.rarity !== 'legendary') continue;
  const zone = topZoneOfSpot(fish.spot);
  if (!zone) continue;
  const list = LEGENDARY_IDS_BY_ZONE.get(zone) as string[] | undefined;
  if (list) list.push(fish.id);
  else LEGENDARY_IDS_BY_ZONE.set(zone, [fish.id]);
}

/** 누적 보너스 측정값 계산 */
export function cumulativeBonusValueOf(state: GameState, metric: CumulativeBonusMetric): number {
  switch (metric.kind) {
    case 'counter':
      return countersOf(state)[metric.key] ?? 0;
    case 'zoneLegendarySum': {
      const counters = countersOf(state);
      const ids = LEGENDARY_IDS_BY_ZONE.get(metric.zone) ?? [];
      let sum = 0;
      for (const id of ids) sum += counters[`manual.legendary.${id}`] ?? 0;
      return sum;
    }
    case 'maxArtifact':
      return maxArtifactCount(state);
  }
}

/** 누적 보너스 계열 하나의 현재 진척과 적용 보너스를 계산한다 */
export function cumulativeBonusProgress(
  state: GameState,
  series: CumulativeBonusSeries,
): CumulativeBonusProgress {
  const current = cumulativeBonusValueOf(state, series.metric);
  let completedSteps = 0;
  let activeDelta = 0;
  let maxDelta = 0;
  let nextStep: CumulativeBonusStep | null = null;
  for (const step of series.steps) {
    maxDelta = clean(maxDelta + step.delta);
    if (current >= step.threshold) {
      completedSteps++;
      activeDelta = clean(activeDelta + step.delta);
    } else if (nextStep === null) {
      nextStep = step;
    }
  }
  return { current, completedSteps, activeDelta, maxDelta, nextStep };
}

/** 현재 적용 중인 누적 보너스 출처별 세부 내역 */
export function achievementBonusContributions(state: GameState): CumulativeBonusContribution[] {
  const out: CumulativeBonusContribution[] = [];
  for (const series of CUMULATIVE_BONUS_SERIES) {
    const p = cumulativeBonusProgress(state, series);
    if (p.activeDelta > 0) {
      out.push({
        series,
        current: p.current,
        completedSteps: p.completedSteps,
        activeDelta: p.activeDelta,
      });
    }
  }
  return out;
}

/** 업적 누적 보너스 합계 — 같은 종류의 보너스를 모두 더해 단일 효과 묶음에 넘긴다 */
export function achievementBonusesOf(state: GameState): AchievementBonuses {
  let biteWaitCut = 0;
  let mutationWeight = 0;
  let namedWeight = 0;
  let moveSpeed = 0;
  let artifactBoost = 0;
  const zoneLegendary: Partial<Record<ZoneId, number>> = {};
  const zoneMutation: Partial<Record<ZoneId, number>> = {};

  for (const series of CUMULATIVE_BONUS_SERIES) {
    const { activeDelta } = cumulativeBonusProgress(state, series);
    if (activeDelta <= 0) continue;
    switch (series.bonusKind) {
      case 'biteWaitCut':
        biteWaitCut = clean(biteWaitCut + activeDelta);
        break;
      case 'mutationWeight':
        mutationWeight = clean(mutationWeight + activeDelta);
        break;
      case 'namedWeight':
        namedWeight = clean(namedWeight + activeDelta);
        break;
      case 'moveSpeed':
        moveSpeed = clean(moveSpeed + activeDelta);
        break;
      case 'artifactBoost':
        artifactBoost = clean(artifactBoost + activeDelta);
        break;
      case 'zoneLegendary':
        if (series.zone) {
          zoneLegendary[series.zone] = clean((zoneLegendary[series.zone] ?? 0) + activeDelta);
        }
        break;
      case 'zoneMutation':
        if (series.zone) {
          zoneMutation[series.zone] = clean((zoneMutation[series.zone] ?? 0) + activeDelta);
        }
        break;
    }
  }

  return {
    biteWaitCut,
    mutationWeight,
    namedWeight,
    moveSpeed,
    artifactBoost,
    zoneLegendary,
    zoneMutation,
  };
}

/** 목표 수 — 'all'이면 판정 시점의 선택자 대상 수 */
const targetOf = (rule: AchievementRule, metric: AchievementMetric): number => {
  if (rule.threshold !== 'all') return rule.threshold;
  if (metric.kind === 'bigSpecies' || metric.kind === 'catchCount') {
    return selectorFish(rule.selector).length;
  }
  return selectorTargetCount(rule.selector);
};

/** 진척 — 측정 방식마다 현재 값을 계산한다 */
const currentOf = (state: GameState, rule: AchievementRule, metric: AchievementMetric): number => {
  switch (metric.kind) {
    case 'discover':
      return selectorFish(rule.selector)
        .filter(f => formDiscovered(state, f.id, metric.form)).length;
    case 'set': {
      const owned = metric.field === 'named' ? state.clearedNamed : state.artifacts;
      return selectorIds(rule.selector).filter(id => owned.includes(id)).length;
    }
    case 'namedClearCount':
      return state.clearedNamed.filter(id => id === metric.questId).length;
    case 'bigSpecies':
      return selectorFish(rule.selector).filter(f => {
        const rec = state.dex[f.id];
        const nSize = rec?.normal?.maxSize;
        const vSize = rec?.variant?.maxSize;
        return (typeof nSize === 'number' && isBigSize(f, nSize))
          || (typeof vSize === 'number' && isBigSize(f, vSize));
      }).length;
    case 'catchCount':
      return selectorFish(rule.selector).reduce((n, f) => {
        const rec = state.dex[f.id];
        return n + (rec?.normal?.count ?? 0) + (rec?.variant?.count ?? 0);
      }, 0);
    case 'counter':
      return countersOf(state)[metric.key] ?? 0;
    case 'counterSet': {
      const counters = countersOf(state);
      return selectorIds(rule.selector)
        .filter(id => (counters[metric.prefix + id] ?? 0) > 0).length;
    }
  }
};

/** 업적 하나의 현재 진척과 달성 여부를 판정 근거에서 순수하게 계산한다 */
export function achievementProgress(state: GameState, id: string): AchievementProgress {
  const rule = achievementRuleById(id);
  if (!rule) return { current: 0, target: 0, met: false };

  const current = currentOf(state, rule, rule.metric);
  const target = targetOf(rule, rule.metric);
  return { current, target, met: target > 0 && current >= target };
}

/** 아직 상태에 없는 알려진 업적 중 조건을 채운 것을 claimable로 전이시킨다 */
export function evaluateAchievements(state: GameState): {
  achievements: AchievementMap;
  newlyClaimable: string[];
} {
  const next: AchievementMap = { ...state.achievements };
  const newlyClaimable: string[] = [];

  for (const a of ACHIEVEMENTS) {
    if (next[a.id] === 'claimable' || next[a.id] === 'claimed') continue;
    const p = achievementProgress(state, a.id);
    if (p.target > 0 && p.met) {
      next[a.id] = 'claimable';
      newlyClaimable.push(a.id);
    }
  }

  return { achievements: next, newlyClaimable };
}

/** 확정된 이벤트 목록에서 업적 카운터 증분을 계산한다 — 기본 5종과 수동 집계 키를 함께 센다 */
export function counterIncrementsForEvents(events: readonly GameEvent[]): AchievementCounters {
  const inc: AchievementCounters = {};
  const add = (key: string, amount: number) => {
    if (amount > 0) inc[key] = (inc[key] ?? 0) + amount;
  };

  for (const ev of events) {
    if (ev.type === 'sell') {
      const gold = ev.payload.gold;
      if (typeof gold === 'number' && Number.isFinite(gold) && gold > 0) {
        add('sell.gold', gold);
      }
    } else if (ev.type === 'catch') {
      const judgment = ev.payload.judgment;
      if (judgment === 'perfect') add('catch.perfect', 1);
      else if (judgment === 'auto') add('catch.auto', 1);
      if (typeof ev.payload.bait === 'string' && ev.payload.bait.length > 0) {
        add('catch.bait', 1);
      }
      // 수동 집계는 방치가 아닌 캐치만 센다 — 대상 어종은 이벤트의 fishId에서 데이터로 찾는다
      if (judgment !== 'auto') {
        add('manual.total', 1);
        const fish = fishById(ev.payload.fishId);
        const zone = fish ? topZoneOfSpot(fish.spot) : undefined;
        if (zone !== undefined) add(`manual.total.${zone}`, 1);
        if (fish?.rarity === 'legendary') {
          add('manual.legendary.total', 1);
          add(`manual.legendary.${fish.id}`, 1);
        }
        if (ev.payload.form === 'variant') {
          add('manual.variant.total', 1);
          if (zone !== undefined) add(`manual.variant.${zone}`, 1);
        }
      }
    } else if (ev.type === 'resolveChallenge') {
      if (ev.payload.success === true && ev.payload.misses === 0) {
        add('named.flawless', 1);
      }
    }
  }

  return inc;
}
