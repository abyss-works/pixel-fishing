// 예외 흐름 — 진입 레벨에서 벗어난 경우의 수입. 진입 레벨 -4부터 +4까지의 표, 같은 배로 열리는 해역에 일찍 들어가는 경우,
// 마지막 해역 레벨로 낮은 지역에 돌아가는 경우, 네임드 토벌을 하러 돌아가는 비용을 낸다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { BOUNTIES, BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyZone } from '../../../src/game/content/bounties';
import { namedEncounterCandidates, namedEncounterShare } from '../../../src/game/rules/logic';
import { NAMED_PITY_CATCHES } from '../../../src/game/rules/pity';
import { powerOfLevel } from '../../../src/game/rules/stats';
import { entryLevel, rates, SPEC_MARGIN } from '../model';
import { accessibleSpots, expectedEncounterCatches } from './bounty';
import { axisOf } from './progress';
import type { FlowAxis } from './progress';

export const OFFSETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;
const MAX_SHORT = 4;

export interface IncomeCell {
  level: number;
  goldPerHour: number; catchesPerHour: number;
  /** 한 번 낚는 데 걸리는 시간(초) */
  cycleSec: number;
  /** 캐치당 전설 확률(%) */
  legendPct: number;
  /** 진입 레벨 수입 대비 */
  ratioToEntry: number;
}

export interface IncomeRow { spot: SpotId; cells: (IncomeCell | null)[] }

/** 해역마다 진입 레벨 -4부터 +4까지의 방치(또는 수동) 수입. 레벨 1 미만 칸은 null이다 */
export function incomeByOffset(flow: FlowAxis): IncomeRow[] {
  return SPOTS.map(s => {
    const entry = entryLevel(s.id);
    const base = rates(s.id, entry, axisOf(flow, s.id, entry)).goldPerHour;
    return {
      spot: s.id,
      cells: OFFSETS.map(o => {
        const level = entry + o;
        if (level < 1) return null;
        const r = rates(s.id, level, axisOf(flow, s.id, level));
        return {
          level, goldPerHour: r.goldPerHour, catchesPerHour: r.catchesPerHour,
          cycleSec: 3600 / r.catchesPerHour, legendPct: (r.rarity.legendary ?? 0) * 100,
          ratioToEntry: r.goldPerHour / base,
        };
      }),
    };
  });
}

export interface EarlyEntryRow {
  spot: SpotId; offset: number; level: number;
  goldPerHour: number;
  /** 같은 레벨로 낚을 수 있는 이전 해역 중 시간당 골드가 가장 높은 해역 */
  alt: SpotId; altGoldPerHour: number;
  /** 들어간 해역 ÷ 비교 해역 */
  ratio: number;
}

/** 조기 진입 — 같은 배로 열리는 이전 해역이 있는 해역에 파워가 모자란 채 들어갈 때, 같은 레벨의 가장 좋은 이전 해역과 비교한다 */
export function earlyEntry(flow: FlowAxis): EarlyEntryRow[] {
  const out: EarlyEntryRow[] = [];
  SPOTS.forEach((s, i) => {
    for (let short = 1; short <= MAX_SHORT; short++) {
      const level = entryLevel(s.id) - short;
      if (level < 1) break;
      let alt: SpotId | undefined, altGold = 0;
      for (const prev of SPOTS.slice(0, i)) {
        if (prev.boatTier !== s.boatTier || (prev.powerReq ?? 0) > powerOfLevel(level)) continue;
        const g = rates(prev.id, level, axisOf(flow, prev.id, level)).goldPerHour;
        if (g > altGold) { alt = prev.id; altGold = g; }
      }
      if (!alt) continue;
      const here = rates(s.id, level, axisOf(flow, s.id, level)).goldPerHour;
      out.push({ spot: s.id, offset: -short, level, goldPerHour: here, alt, altGoldPerHour: altGold, ratio: here / altGold });
    }
  });
  return out;
}

export interface ReturnTrip {
  level: number;
  rows: { spot: SpotId; goldPerHour: number; ratioToLast: number }[];
}

/** 낮은 지역으로 돌아옴 — 마지막 해역의 진입 레벨과 +SPEC_MARGIN 레벨로 모든 해역에서 낚을 때의 수입 */
export function returnTrips(flow: FlowAxis): ReturnTrip[] {
  const last = SPOTS[SPOTS.length - 1].id;
  return [0, SPEC_MARGIN].map(m => {
    const level = entryLevel(last) + m;
    const lastGold = rates(last, level, axisOf(flow, last, level)).goldPerHour;
    return {
      level,
      rows: SPOTS.filter(s => (s.powerReq ?? 0) <= powerOfLevel(level)).map(s => {
        const g = rates(s.id, level, axisOf(flow, s.id, level)).goldPerHour;
        return { spot: s.id, goldPerHour: g, ratioToLast: g / lastGold };
      }),
    };
  });
}

export interface HuntRow {
  zone: BountyZone;
  reward: number;
  /** 조우까지 기대 낚시 시간(시간) — 조우 천장을 넣은 기대 캐치 수 기준 */
  hours: number;
  /** 그 시간 동안 마지막 해역에서 낚을 때보다 줄어드는 수입 */
  loss: number;
  lossOverReward: number;
}

/** 네임드 토벌 비용 — 마지막 해역의 진입 레벨로 그 구역에 가서 조우할 때까지 낚는 동안 줄어드는 수입과 보상 */
export function huntCost(flow: FlowAxis): HuntRow[] {
  const last = SPOTS[SPOTS.length - 1].id;
  const level = entryLevel(last);
  const lastGold = rates(last, level, axisOf(flow, last, level)).goldPerHour;
  const rows: HuntRow[] = [];
  for (const zone of BOUNTY_ZONES) {
    const quest = BOUNTIES.find(q => q.zone === zone && q.difficulty === 'named');
    if (!quest) continue;
    const spots = accessibleSpots(zone, { boat: Number.MAX_SAFE_INTEGER, level }).filter(s => namedEncounterCandidates([quest.id], s).length > 0);
    if (spots.length === 0) continue;
    const mean = (f: (s: SpotId) => number) => spots.reduce((a, s) => a + f(s), 0) / spots.length;
    const zoneRates = spots.map(s => rates(s, level, axisOf(flow, s, level)));
    const catches = expectedEncounterCatches(mean(namedEncounterShare), NAMED_PITY_CATCHES);
    const hours = catches / (zoneRates.reduce((a, r) => a + r.catchesPerHour, 0) / zoneRates.length);
    const loss = (lastGold - zoneRates.reduce((a, r) => a + r.goldPerHour, 0) / zoneRates.length) * hours;
    rows.push({ zone, reward: quest.reward, hours, loss, lossOverReward: loss / quest.reward });
  }
  return rows;
}
