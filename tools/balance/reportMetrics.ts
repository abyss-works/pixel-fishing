// 밸런스 보고서 지표 계산 — balance-report CLI와 단위 테스트가 함께 쓰는 순수 함수 모듈.
import { SPOTS } from '../../src/game/content/spots';
import type { SpotId } from '../../src/game/content/spots';
import { BOATS } from '../../src/game/content/boats';
import { FISH } from '../../src/game/content/fish';
import { RARITY_ORDER } from '../../src/game/content/rarity';
import type { RarityId } from '../../src/game/content/rarity';
import { BOUNTIES, BOUNTY_ZONES } from '../../src/game/content/bounties';
import type { BountyZone } from '../../src/game/content/bounties';
import { drawRows, mutationWeightsOf, namedEncounterShare, variantShare } from '../../src/game/rules/logic';
import { upgradeCost } from '../../src/game/rules/balance';
import { DELTA_AXES, EV_AXES, buildBalanceReport } from '../../src/features/admin/model/balanceReport';
import type { EvAxisDef, SpotBalance } from '../../src/features/admin/model/balanceReport';
import {
  AXES, SPEC_MARGIN, ZONE_ORDER, axisAvailable, entryLevel, headroom, inversions,
  moveGap, perfectOverIdle, rates, rng, rodSpec, spotsOfZone, zoneOf,
} from './model';
import type { Axis, Rates, RodSpec } from './model';
import { simulateJourney } from './journey';
import type { Arrival, Journey } from './journey';
import { PLAYS, stat } from './selfTimes';
import type { Play, TimeStat } from './selfTimes';

export type { Play, TimeStat };
export { PLAYS };

/** 1레벨부터 `lv` 직전까지의 누적 낚싯대 강화 비용 */
export function rodCum(lv: number): number {
  let s = 0;
  for (let l = 1; l < lv; l++) s += upgradeCost(l);
  return s;
}

/** 수동 플레이 시 해당 해역·여유 레벨에서 사용할 수 있는 최상 수동 판정 축 */
export const manualAxis = (spot: SpotId, margin = 0): Axis =>
  axisAvailable(rodSpec(spot, entryLevel(spot) + margin), 'good') ? 'good' : 'normal';

/** 플레이 방식(`idle` | `manual`)을 측정 축으로 변환한다 */
export const playAxis = (spot: SpotId, play: Play, margin = 0): Axis =>
  play === 'idle' ? 'idle' : manualAxis(spot, margin);

/** 호출 단위로 해역·축·여유별 `rates`를 메모이즈하는 조회기 */
function createRateLookup() {
  const cache = new Map<string, Rates>();
  return (spot: SpotId, axis: Axis, margin = 0): Rates => {
    const key = `${spot}:${axis}:${margin}`;
    let r = cache.get(key);
    if (!r) {
      r = rates(spot, entryLevel(spot) + margin, axis);
      cache.set(key, r);
    }
    return r;
  };
}

// ── 기대값 ──

export interface EvReportRow {
  spot: SpotBalance;
  deltaGoldPct: number | null;
  goodLadderPct: number;
  perfectLadderPct: number;
  idleSpreadPct: number;
  idleAvgDelta: number;
}

export interface EvRarityRow {
  spot: SpotId;
  name: string;
  axes: { axis: EvAxisDef; shares: number[] }[];
}

export interface EvMetrics {
  rows: EvReportRow[];
  rarityShares: EvRarityRow[];
}

/** 관리자 대시보드 기준 기대값 사다리 지표와 실질 등급 비율을 계산한다 */
export function evMetrics(): EvMetrics {
  const report = buildBalanceReport();
  const idleAvgDef = DELTA_AXES.find(a => a.key === 'idleAvgDelta');
  const rows: EvReportRow[] = report.map(r => ({
    spot: r,
    deltaGoldPct: r.deltaGold === null ? null : r.deltaGold / (r.gold.normal - r.deltaGold),
    goodLadderPct: r.gold.good / r.gold.normal - 1,
    perfectLadderPct: r.gold.perfect / r.gold.good - 1,
    idleSpreadPct: r.gold.idleBest / r.gold.idleWorst - 1,
    idleAvgDelta: idleAvgDef?.compute(r, null) ?? 0,
  }));
  const rarityShares: EvRarityRow[] = SPOTS.map(s => ({
    spot: s.id,
    name: s.name,
    axes: EV_AXES.map(a => {
      const draw = drawRows(s.id, a.options(s.id));
      const total = draw.reduce((t, x) => t + x.fishPct, 0);
      return {
        axis: a,
        shares: RARITY_ORDER.map(k =>
          draw.filter(x => x.fish.rarity === k).reduce((t, x) => t + x.fishPct, 0) / total * 100,
        ),
      };
    }),
  }));
  return { rows, rarityShares };
}

// ── 낚싯대 스펙 ──

export interface RodSpecRow {
  spot: SpotId;
  name: string;
  margin: number;
  spec: RodSpec;
}

/** 해역별 진입 스펙과 여유 스펙 목록을 계산한다 */
export function rodSpecMetrics(margins: readonly number[] = [0, SPEC_MARGIN]): RodSpecRow[] {
  const out: RodSpecRow[] = [];
  for (const s of SPOTS) {
    for (const m of margins) {
      out.push({ spot: s.id, name: s.name, margin: m, spec: rodSpec(s.id, entryLevel(s.id) + m) });
    }
  }
  return out;
}

// ── 수입 ──

export interface IncomeRow {
  spot: SpotId;
  name: string;
  axes: Record<Axis, Rates | null>;
  idle: Rates;
  manual: Rates;
  ratios: { gold: number; fame: number; rare: number };
}

export interface ZoneMultiplierRow {
  fromZone: string;
  toZone: string;
  fromSpot: SpotId;
  fromName: string;
  toSpot: SpotId;
  toName: string;
  ratios: Record<Play, number>;
}

export interface IncomeMetrics {
  tables: { margin: number; rows: IncomeRow[] }[];
  zoneMultipliers: ZoneMultiplierRow[];
}

/** 스펙 여유별 시간당 수입 표와 지역 간 첫 해역 골드 배율을 계산한다 */
export function incomeMetrics(margins: readonly number[] = [0, SPEC_MARGIN]): IncomeMetrics {
  const rate = createRateLookup();
  const rareShare = (r: Rates) => 1 - (r.rarity.common ?? 0);
  const tables = margins.map(m => ({
    margin: m,
    rows: SPOTS.map(s => {
      const spec = rodSpec(s.id, entryLevel(s.id) + m);
      const axes = Object.fromEntries(
        AXES.map(a => [a, axisAvailable(spec, a) ? rate(s.id, a, m) : null]),
      ) as Record<Axis, Rates | null>;
      const idle = rate(s.id, 'idle', m);
      const manual = rate(s.id, manualAxis(s.id, m), m);
      return {
        spot: s.id,
        name: s.name,
        axes,
        idle,
        manual,
        ratios: {
          gold: manual.goldPerHour / idle.goldPerHour,
          fame: manual.famePerHour / idle.famePerHour,
          rare: rareShare(manual) / rareShare(idle),
        },
      };
    }),
  }));

  const firsts = ZONE_ORDER.map(z => spotsOfZone(z)[0]);
  const zoneMultipliers: ZoneMultiplierRow[] = [];
  for (let i = 1; i < firsts.length; i++) {
    const a = firsts[i - 1], b = firsts[i];
    zoneMultipliers.push({
      fromZone: ZONE_ORDER[i - 1],
      toZone: ZONE_ORDER[i],
      fromSpot: a.id,
      fromName: a.name,
      toSpot: b.id,
      toName: b.name,
      ratios: {
        idle: rate(b.id, playAxis(b.id, 'idle')).goldPerHour / rate(a.id, playAxis(a.id, 'idle')).goldPerHour,
        manual: rate(b.id, playAxis(b.id, 'manual')).goldPerHour / rate(a.id, playAxis(a.id, 'manual')).goldPerHour,
      },
    });
  }
  return { tables, zoneMultipliers };
}

// ── 방치 진입·플래토 ──

export interface IdleRow {
  spot: SpotId;
  name: string;
  levels: [number, number];
  idleBoosts: [number, number];
  goldPerCatchDay: [number, number];
  goldPerHourDay: [number, number];
  goldPerHourMixed: [number, number];
}

/** 해역별 방치 진입 레벨과 플래토(+SPEC_MARGIN) 지표를 계산한다 */
export function idleMetrics(): IdleRow[] {
  return SPOTS.map(s => {
    const l0 = entryLevel(s.id), l1 = l0 + SPEC_MARGIN;
    const levels: [number, number] = [l0, l1];
    const day = levels.map(l => rates(s.id, l, 'idle', {}, 'day'));
    const mixed = levels.map(l => rates(s.id, l, 'idle', {}, 'mixed'));
    return {
      spot: s.id,
      name: s.name,
      levels,
      idleBoosts: [rodSpec(s.id, l0).idleBoost, rodSpec(s.id, l1).idleBoost],
      goldPerCatchDay: [day[0].goldPerHour / day[0].catchesPerHour, day[1].goldPerHour / day[1].catchesPerHour],
      goldPerHourDay: [day[0].goldPerHour, day[1].goldPerHour],
      goldPerHourMixed: [mixed[0].goldPerHour, mixed[1].goldPerHour],
    };
  });
}

// ── 이동 직후 수입 ──

export interface MoveRow {
  spot: SpotId;
  name: string;
  day: ReturnType<typeof moveGap>;
  mixed: ReturnType<typeof moveGap>;
}

export interface MoveMetrics {
  rows: MoveRow[];
  worst: { day: number; mixed: number };
}

/** 새 해역 이동 직후 방치 수입 차이와 최악 비율 하락폭을 계산한다 */
export function moveMetrics(): MoveMetrics {
  const worst = { day: Infinity, mixed: Infinity };
  const rows: MoveRow[] = [];
  for (let i = 1; i < SPOTS.length; i++) {
    const s = SPOTS[i];
    const day = moveGap(i, 'day');
    const mixed = moveGap(i, 'mixed');
    rows.push({ spot: s.id, name: s.name, day, mixed });
    if (day.from) {
      worst.day = Math.min(worst.day, day.ratio - 1);
      worst.mixed = Math.min(worst.mixed, mixed.ratio - 1);
    }
  }
  return { rows, worst };
}

// ── PERFECT 이상치 ──

export interface PerfectRow {
  spot: SpotId;
  name: string;
  min: number;
  margin: number;
}

export interface PerfectMetrics {
  rows: PerfectRow[];
  max: { value: number; spot: SpotId; name: string; margin: number };
}

/** 해역별 PERFECT÷방치 골드 비율과 전체 최댓값을 계산한다 */
export function perfectMetrics(): PerfectMetrics {
  let max = { value: 0, spot: SPOTS[0].id, name: SPOTS[0].name, margin: 0 };
  const rows: PerfectRow[] = SPOTS.map(s => {
    const min = perfectOverIdle(s.id, entryLevel(s.id));
    if (min > max.value) max = { value: min, spot: s.id, name: s.name, margin: 0 };
    const margin = perfectOverIdle(s.id, entryLevel(s.id) + SPEC_MARGIN);
    if (margin > max.value) max = { value: margin, spot: s.id, name: s.name, margin: SPEC_MARGIN };
    return { spot: s.id, name: s.name, min, margin };
  });
  return { rows, max };
}

// ── 다음 해역 진입 비용 ──

export interface GrowthTransition {
  from: SpotId;
  fromName: string;
  to: SpotId;
  toName: string;
  gold: number;
  boatPrice: number;
  rodCost: number;
  fameReq: number;
  hours: Record<Play, number>;
}

export interface GrowthMetrics {
  transitions: GrowthTransition[];
  upgradeSamples: { level: number; cost: number }[];
}

const DEFAULT_UPGRADE_SAMPLES = [1, 5, 10, 15, 18, 19, 20, 22, 25] as const;

/** 직전 해역에서 다음 해역 진입에 필요한 배·강화 비용과 소요 시간을 계산한다 */
export function growthMetrics(sampleLevels: readonly number[] = DEFAULT_UPGRADE_SAMPLES): GrowthMetrics {
  const rate = createRateLookup();
  const transitions: GrowthTransition[] = [];
  for (let i = 1; i < SPOTS.length; i++) {
    const a = SPOTS[i - 1], b = SPOTS[i];
    const boat = b.boatTier > a.boatTier ? BOATS.find(x => x.tier === b.boatTier) : undefined;
    const rodCost = rodCum(entryLevel(b.id)) - rodCum(entryLevel(a.id));
    const boatPrice = boat?.price ?? 0;
    const gold = boatPrice + rodCost;
    transitions.push({
      from: a.id,
      fromName: a.name,
      to: b.id,
      toName: b.name,
      gold,
      boatPrice,
      rodCost,
      fameReq: boat?.fameReq ?? 0,
      hours: {
        idle: gold / rate(a.id, playAxis(a.id, 'idle')).goldPerHour,
        manual: gold / rate(a.id, playAxis(a.id, 'manual')).goldPerHour,
      },
    });
  }
  return {
    transitions,
    upgradeSamples: sampleLevels.map(level => ({ level, cost: upgradeCost(level) })),
  };
}

// ── 새 계정 진행 ──

export interface JourneySummary {
  play: Play;
  journey: Journey;
  zoneFirsts: { zone: string; arrival: Arrival }[];
}

/** 플레이 방식별 새 계정 진행 시뮬레이션과 지역 첫 도착을 계산한다 */
export function journeyMetrics(): Record<Play, JourneySummary> {
  const build = (play: Play): JourneySummary => {
    const journey = simulateJourney(play === 'idle' ? 'idle' : 'good');
    const zoneFirsts = ZONE_ORDER
      .map(zone => {
        const arrival = journey.arrivals.find(a => zoneOf(a.spot) === zone);
        return arrival ? { zone, arrival } : null;
      })
      .filter((x): x is { zone: string; arrival: Arrival } => x !== null);
    return { play, journey, zoneFirsts };
  };
  return { idle: build('idle'), manual: build('manual') };
}

// ── 명성 문턱 누적 시간 ──

export interface FameGateEntry {
  tier: number;
  name: string;
  fame: number;
  hours: number;
}

export interface FameGateResult {
  play: Play;
  gates: FameGateEntry[];
}

/** 가진 명성으로 열리는 최고 해역(최소 스펙)에서 각 배 명성 문턱까지 쌓는 누적 시간을 계산한다 */
export function fameGateTimes(): FameGateResult[] {
  const rate = createRateLookup();
  const gates = BOATS
    .filter(b => b.fameReq > 0)
    .map(b => ({ tier: b.tier, name: `${b.name}(배${b.tier})`, fame: b.fameReq }))
    .sort((x, y) => x.fame - y.fame);
  const bestSpot = (fame: number) => {
    const tier = Math.max(0, ...BOATS.filter(b => b.fameReq <= fame).map(b => b.tier));
    return SPOTS.filter(s => s.boatTier <= tier).at(-1)!;
  };
  return PLAYS.map(play => {
    let fame = 0, h = 0;
    const entries: FameGateEntry[] = [];
    for (const g of gates) {
      while (fame < g.fame) {
        const nextBoat = BOATS.filter(b => b.fameReq > fame).sort((a, b) => a.fameReq - b.fameReq)[0];
        const target = Math.min(g.fame, nextBoat?.fameReq ?? Infinity);
        const s = bestSpot(fame).id;
        h += (target - fame) / rate(s, playAxis(s, play)).famePerHour;
        fame = target;
      }
      entries.push({ tier: g.tier, name: g.name, fame: g.fame, hours: h });
    }
    return { play, gates: entries };
  });
}

// ── 단조성 ──

export interface MonotonicRow {
  margin: number;
  play: Play;
  goldInversions: ReturnType<typeof inversions<(typeof SPOTS)[number]>>;
  fameInversions: ReturnType<typeof inversions<(typeof SPOTS)[number]>>;
  headrooms: { spot: SpotId; name: string; room: number }[];
}

/** 해역 순서대로 시간당 골드·명성 역전 쌍과 완화 여유를 계산한다 */
export function monotonicMetrics(margins: readonly number[] = [0, SPEC_MARGIN]): MonotonicRow[] {
  const rate = createRateLookup();
  const out: MonotonicRow[] = [];
  for (const m of margins) {
    for (const p of PLAYS) {
      const val = (s: SpotId, k: 'goldPerHour' | 'famePerHour') => rate(s, playAxis(s, p, m), m)[k];
      out.push({
        margin: m,
        play: p,
        goldInversions: inversions(SPOTS, s => val(s.id, 'goldPerHour')),
        fameInversions: inversions(SPOTS, s => val(s.id, 'famePerHour')),
        headrooms: SPOTS.slice(0, -1).map((s, i) => {
          const nx = SPOTS[i + 1].id;
          const room = Math.min(
            headroom(val(s.id, 'goldPerHour'), val(nx, 'goldPerHour')),
            headroom(val(s.id, 'famePerHour'), val(nx, 'famePerHour')),
          );
          return { spot: s.id, name: s.name, room };
        }),
      });
    }
  }
  return out;
}

// ── 경제 ──

export interface EconomyMetrics {
  upgradeTimes: { spot: SpotId; name: string; level: number; cost: number; hours: Record<Play, number> }[];
  lastBoatHours: Record<Play, number | null>;
  endgameUpgrades: { spot: SpotId; name: string; margin: number; level: number; cost: number; hours: Record<Play, number> }[];
}

/** 진입 레벨 1단계 강화 시간, 마지막 배 구매 시점, 최종 해역 강화 시간을 계산한다 */
export function economyMetrics(): EconomyMetrics {
  const rate = createRateLookup();
  const upgradeTimes = SPOTS.map(s => {
    const level = entryLevel(s.id);
    const cost = upgradeCost(level);
    return {
      spot: s.id,
      name: s.name,
      level,
      cost,
      hours: {
        idle: cost / rate(s.id, playAxis(s.id, 'idle')).goldPerHour,
        manual: cost / rate(s.id, playAxis(s.id, 'manual')).goldPerHour,
      },
    };
  });
  const lastBoatHours: Record<Play, number | null> = {
    idle: simulateJourney('idle').lastBoatHours,
    manual: simulateJourney('good').lastBoatHours,
  };
  const last = SPOTS.at(-1)!;
  const endgameUpgrades = [0, SPEC_MARGIN].map(m => {
    const level = entryLevel(last.id) + m;
    const cost = upgradeCost(level);
    return {
      spot: last.id,
      name: last.name,
      margin: m,
      level,
      cost,
      hours: {
        idle: cost / rates(last.id, level, playAxis(last.id, 'idle', m)).goldPerHour,
        manual: cost / rates(last.id, level, playAxis(last.id, 'manual', m)).goldPerHour,
      },
    };
  });
  return { upgradeTimes, lastBoatHours, endgameUpgrades };
}

// ── 수집 ──

export interface DexPlayStat {
  noLegend: TimeStat;
  all: TimeStat;
  variant: TimeStat;
  legend: TimeStat | null;
}

export interface DexZoneResult {
  zone: string;
  speciesCount: number;
  byPlay: Record<Play, DexPlayStat>;
}

const CAP_DEX_CATCHES = 3_000_000;

/** 구역별 도감 완성(전설 제외·전체·돌연변이·전설 첫 조우) 시간을 몬테카를로로 계산한다 */
export function dexMetrics(runs: number, seed: number): DexZoneResult[] {
  if (!Number.isInteger(runs) || runs < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
  const rate = createRateLookup();
  const rand = rng(seed);
  const simulateZone = (zone: string, p: Play): DexPlayStat => {
    const spots = spotsOfZone(zone);
    const tables = spots.map(s => rate(s.id, playAxis(s.id, p)));
    const ids = FISH.filter(f => spots.some(s => s.id === f.spot));
    const noLegend = ids.filter(f => f.rarity !== 'legendary').map(f => f.id);
    const allIds = ids.map(f => f.id);
    const hasLegend = ids.some(f => f.rarity === 'legendary');
    const out = { noLegend: [] as number[], all: [] as number[], variant: [] as number[], legend: [] as number[] };
    for (let k = 0; k < runs; k++) {
      const normal = new Set(allIds), variant = new Set(allIds);
      let secs = 0, catches = 0, tNo = -1, tAll = -1, tVar = -1, tLeg = hasLegend ? -1 : NaN;
      while ((tNo < 0 || tAll < 0 || tVar < 0 || tLeg < 0) && catches < CAP_DEX_CATCHES) {
        const t = tables[catches % tables.length];
        catches++;
        secs += 3600 / t.catchesPerHour;
        let r = rand();
        for (const row of t.rows) {
          r -= row.prob;
          if (r >= 0) continue;
          if (rand() < variantShare(mutationWeightsOf({ artifacts: [] }, row.fish.spot))) variant.delete(row.fish.id);
          else normal.delete(row.fish.id);
          if (row.fish.rarity === 'legendary' && tLeg < 0) tLeg = secs;
          break;
        }
        if (tNo < 0 && noLegend.every(id => !normal.has(id))) tNo = secs;
        if (tAll < 0 && normal.size === 0) tAll = secs;
        if (tVar < 0 && variant.size === 0) tVar = secs;
      }
      out.noLegend.push(tNo / 3600);
      out.all.push(tAll / 3600);
      out.variant.push(tVar / 3600);
      if (!Number.isNaN(tLeg)) out.legend.push(tLeg / 3600);
    }
    return {
      noLegend: stat(out.noLegend),
      all: stat(out.all),
      variant: stat(out.variant),
      legend: out.legend.length > 0 ? stat(out.legend) : null,
    };
  };

  return ZONE_ORDER.map(z => ({
    zone: z,
    speciesCount: FISH.filter(f => spotsOfZone(z).some(s => s.id === f.spot)).length,
    byPlay: {
      idle: simulateZone(z, 'idle'),
      manual: simulateZone(z, 'manual'),
    },
  }));
}

// ── 도전 ──

export interface BountyQuestMetric {
  difficulty: string;
  grade: RarityId | null;
  count: number;
  reward: number;
  byPlay: Record<Play, { hours: number; rewardPct: number }>;
}

export interface BountyZoneMetrics {
  zone: BountyZone;
  namedReward: number;
  encounterHours: Record<Play, number>;
  quests: BountyQuestMetric[];
}

/** 구역별 네임드 조우 시간과 의뢰 수행 시간·보상 비율을 계산한다 */
export function bountyMetrics(): BountyZoneMetrics[] {
  const rate = createRateLookup();
  return BOUNTY_ZONES.map(z => {
    const spots = spotsOfZone(z);
    const avg = (f: (s: SpotId) => number) => spots.reduce((s, sp) => s + f(sp.id), 0) / spots.length;
    const named = BOUNTIES.find(q => q.zone === z && q.difficulty === 'named')!;
    const encounterHours = (p: Play) => avg(s => 1 / namedEncounterShare(s)) / avg(s => rate(s, playAxis(s, p)).catchesPerHour);
    const quests: BountyQuestMetric[] = BOUNTIES
      .filter(b => b.zone === z && b.difficulty !== 'named')
      .map(q => {
        const calc = (p: Play) => {
          const r = (s: SpotId) => rate(s, playAxis(s, p));
          const perHour = avg(s => r(s).rows.filter(x => x.fish.rarity === q.grade).reduce((a, x) => a + x.prob, 0) * r(s).catchesPerHour);
          const hours = q.count / perHour;
          const rewardPct = q.reward / (hours * avg(s => r(s).goldPerHour)) * 100;
          return { hours, rewardPct };
        };
        return {
          difficulty: q.difficulty,
          grade: q.grade,
          count: q.count,
          reward: q.reward,
          byPlay: { idle: calc('idle'), manual: calc('manual') },
        };
      });
    return {
      zone: z,
      namedReward: named.reward,
      encounterHours: { idle: encounterHours('idle'), manual: encounterHours('manual') },
      quests,
    };
  });
}
