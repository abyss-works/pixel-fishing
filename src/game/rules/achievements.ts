// 업적 규칙 — 순수 진척 판정, 달성 전이, 이벤트 기반 카운터 증분.
// 측정 방식(metric)으로만 분기한다 — 업적 id 접두사 분기는 없다.
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import {
  ACHIEVEMENTS, achievementRuleById, selectorFish, selectorIds, selectorTargetCount,
} from '../content/achievements.js';
import type {
  AchievementCounters, AchievementMap, AchievementMetric, AchievementRule,
} from '../content/achievements.js';
import { fishById } from '../content/fish.js';
import { topZoneOfSpot } from '../content/zones.js';
import type { GameEvent } from './actions.js';
import { formDiscovered, isBigSize } from './logic.js';
import type { GameState } from './logic.js';

export interface AchievementProgress {
  current: number;
  target: number;
  met: boolean;
}

/** 카운터 값 — 동적 키(규칙의 counterSet)도 읽을 수 있게 문자열 키로 본다 */
const countersOf = (state: GameState): Partial<Record<string, number | undefined>> =>
  state.achievementCounters;

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
        if (fish?.rarity === 'legendary') {
          add('manual.legendary.total', 1);
          add(`manual.legendary.${fish.id}`, 1);
        }
        if (ev.payload.form === 'variant') {
          add('manual.variant.total', 1);
          const zone = fish ? topZoneOfSpot(fish.spot) : undefined;
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
