// 업적 규칙 — 순수 진척 판정, 달성 전이, 이벤트 기반 카운터 증분.
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { ACHIEVEMENTS, achievementById } from '../content/achievements.js';
import type { AchievementCounters, AchievementMap } from '../content/achievements.js';
import { ARTIFACTS } from '../content/artifacts.js';
import { BOUNTIES } from '../content/bounties.js';
import type { BountyZone } from '../content/bounties.js';
import { FISH } from '../content/fish.js';
import { topZoneOfSpot } from '../content/zones.js';
import type { GameEvent } from './actions.js';
import {
  LICENSE_GRADES, formDiscovered, isBigSize, variantDiscovered, zoneDexMissing, zoneDexSpecies,
} from './logic.js';
import type { GameState } from './logic.js';

export interface AchievementProgress {
  current: number;
  target: number;
  met: boolean;
}

const NAMED_QUESTS = BOUNTIES.filter(q => q.difficulty === 'named');
const CATCH_TARGET = 100_000;
const BIG_TARGET = 50;

/** 업적 하나의 현재 진척과 달성 여부를 판정 근거에서 순수하게 계산한다 */
export function achievementProgress(state: GameState, id: string): AchievementProgress {
  if (!achievementById(id)) return { current: 0, target: 0, met: false };

  if (id.startsWith('zone-basic-')) {
    const zone = id.slice('zone-basic-'.length) as BountyZone;
    const grades = LICENSE_GRADES.basic;
    const target = zoneDexSpecies(zone, grades).length;
    const missing = zoneDexMissing(state, zone, grades).length;
    const current = target - missing;
    return { current, target, met: target > 0 && missing === 0 };
  }

  if (id.startsWith('zone-full-')) {
    const zone = id.slice('zone-full-'.length) as BountyZone;
    const grades = LICENSE_GRADES.named;
    const target = zoneDexSpecies(zone, grades).length;
    const missing = zoneDexMissing(state, zone, grades).length;
    const current = target - missing;
    return { current, target, met: target > 0 && missing === 0 };
  }

  if (id === 'variant-all') {
    const target = FISH.length;
    const current = FISH.filter(f => variantDiscovered(state, f.id)).length;
    return { current, target, met: target > 0 && current >= target };
  }

  if (id.startsWith('variant-')) {
    const zone = id.slice('variant-'.length);
    const pool = FISH.filter(f => topZoneOfSpot(f.spot) === zone);
    const target = pool.length;
    const current = pool.filter(f => variantDiscovered(state, f.id)).length;
    return { current, target, met: target > 0 && current >= target };
  }

  if (id === 'grade-legendary') {
    const pool = FISH.filter(f => f.rarity === 'legendary');
    const target = pool.length;
    const current = pool.filter(f => formDiscovered(state, f.id, 'normal')).length;
    return { current, target, met: target > 0 && current >= target };
  }

  if (id === 'night-normal') {
    const pool = FISH.filter(f => f.night === true);
    const target = pool.length;
    const current = pool.filter(f => formDiscovered(state, f.id, 'normal')).length;
    return { current, target, met: target > 0 && current >= target };
  }

  if (id === 'night-variant') {
    const pool = FISH.filter(f => f.night === true);
    const target = pool.length;
    const current = pool.filter(f => variantDiscovered(state, f.id)).length;
    return { current, target, met: target > 0 && current >= target };
  }

  if (id === 'big-50') {
    let current = 0;
    for (const f of FISH) {
      const rec = state.dex[f.id];
      const nSize = rec?.normal?.maxSize;
      const vSize = rec?.variant?.maxSize;
      if ((typeof nSize === 'number' && isBigSize(f, nSize))
          || (typeof vSize === 'number' && isBigSize(f, vSize))) {
        current++;
      }
    }
    return { current, target: BIG_TARGET, met: current >= BIG_TARGET };
  }

  if (id === 'named-all') {
    const target = NAMED_QUESTS.length;
    const current = NAMED_QUESTS.filter(q => state.clearedNamed.includes(q.id)).length;
    return { current, target, met: target > 0 && current >= target };
  }

  if (id === 'artifact-all') {
    const target = ARTIFACTS.length;
    const current = ARTIFACTS.filter(a => state.artifacts.includes(a.id)).length;
    return { current, target, met: target > 0 && current >= target };
  }

  if (id === 'catch-100000') {
    let current = 0;
    for (const f of FISH) {
      const rec = state.dex[f.id];
      current += (rec?.normal?.count ?? 0) + (rec?.variant?.count ?? 0);
    }
    return { current, target: CATCH_TARGET, met: current >= CATCH_TARGET };
  }

  return { current: 0, target: 0, met: false };
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

/** 확정된 이벤트 목록에서 업적 카운터 5종의 증분을 계산한다 */
export function counterIncrementsForEvents(events: readonly GameEvent[]): AchievementCounters {
  const inc: AchievementCounters = {};
  const add = (key: keyof AchievementCounters, amount: number) => {
    if (amount > 0) inc[key] = (inc[key] ?? 0) + amount;
  };

  for (const ev of events) {
    if (ev.type === 'sell') {
      const gold = ev.payload.gold;
      if (typeof gold === 'number' && Number.isFinite(gold) && gold > 0) {
        add('sell.gold', gold);
      }
    } else if (ev.type === 'catch') {
      if (ev.payload.judgment === 'perfect') add('catch.perfect', 1);
      else if (ev.payload.judgment === 'auto') add('catch.auto', 1);
      if (typeof ev.payload.bait === 'string' && ev.payload.bait.length > 0) {
        add('catch.bait', 1);
      }
    } else if (ev.type === 'resolveChallenge') {
      if (ev.payload.success === true && ev.payload.misses === 0) {
        add('named.flawless', 1);
      }
    }
  }

  return inc;
}
