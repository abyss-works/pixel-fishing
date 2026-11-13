// 비용 기준 역산 — 낚싯대 강화비 곡선(단일 지수 start x (1+r)^(lv-1))과 해역 간격, 전환 시간 목표(또는 강화 한 번의 회수 시간)에서
// 해역 진입 EV, 그 EV를 내는 해역 가격 배율과 등급 가격 비율, 배 가격, 요구 파워를 거꾸로 낸다. 값은 정하지 않고 인자로 받는다.
//   구간 = 그 해역의 진입 레벨부터 다음 해역 진입 직전 레벨까지(k번 강화). 간격 k와 목표 시간 H의 키는 구간을 보내는 해역이다.
//   시간 목표 방식: 필요한 진입 EV = (구간 강화비 합 + 배 가격) ÷ H
//   회수 시간 방식: 진입 EV = 진입 레벨 강화비 ÷ h(진입 레벨), h(lv) = payback x (1 + paybackGrowth)^(lv-1). 해역별로 h를 지정하면 그 해역의 구간은 그 값으로 덮어쓴다. 전환 시간 H = 구간 강화 k번의 h 합 + 배 가격 ÷ 진입 EV
//   시간 목표 방식의 마지막 해역은 구간이 없어 필요 EV를 기준점 EV(기준점이 없으면 현재 EV)로 둔다. 이 값은 목표이므로 기준점 오차에 넣지 않는다
//   배 가격 = 전환 골드(강화비 합 + 배 가격)의 boatShare 비중. 그 구간에 새로 사는 배가 있을 때만 있고, 여러 척이면 현행 가격 비례로 나눈다
//   등급 가격: 일반 최대가 대비 그 등급 낮 어종 최대가 = base x step^n(n은 해역 순번, 첫 해역 0), 밤 어종 최대가 = 같은 등급 낮 어종 최대가 x 밤 배율.
//   EV 목표는 그대로 두고 일반 가격 배율이 차이를 흡수한다. 어종 사이의 상대 가격은 그 무리 안에서 유지한다
// 입질 속도와 방치 배수의 레벨 효과는 제품 규칙을 그대로 부른다. 명성은 계산하지 않으므로 내보내는 덮어쓰기는 배의 명성 요구치를 0으로 둔다(골드 전환 시간만 재기 위해서다).
import { BOATS } from '../../../src/game/content/boats';
import { FISH } from '../../../src/game/content/fish';
import { RARITY, RARITY_ORDER } from '../../../src/game/content/rarity';
import type { RarityId } from '../../../src/game/content/rarity';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { VARIANT_EV, entryLevel, rates, rodSpec } from '../model';
import { applyRodRules, powerOfLevel, relativeIdleBoost } from '../rodRules';
import type { BiteDecayMode } from '../rodRules';
import { applyOverride } from './override';
import type { FlowOverride } from './override';
import { levelRows, purchaseRows } from './tables';
import type { LevelRow, PurchaseRow } from './tables';
import { transitionReport } from './transitions';

/** 해역별로 줄 수 있는 값 — all은 모든 해역의 기본값, by는 해역별 값 */
export interface PerSpot { all: number | null; by: Partial<Record<SpotId, number>> }

export type GradeId = Exclude<RarityId, 'common'>;
export const GRADE_IDS: readonly GradeId[] = RARITY_ORDER.filter((g): g is GradeId => g !== 'common');
/** 해역 순번 n(첫 해역 0)에서 일반 최대가 대비 비율 = base x step^n */
export interface GradeCurve { base: number; step: number }

export interface Anchor { spot: SpotId; ev: number }
export type SolveVar = 'gap' | 'growth' | 'payback';

export interface DesignInput {
  start: number;
  /** 강화비의 레벨당 증가율 r. solve가 growth면 null */
  growth: number | null;
  gap: PerSpot;
  /** 시간 목표 방식이면 해역별 H, 회수 시간 방식이면 null */
  hours: PerSpot | null;
  /** 회수 시간 방식의 h(1)과 레벨당 증가율. 시간 목표 방식이면 null. base는 solve가 payback이면 null */
  payback: { base: number | null; growth: number; by: Partial<Record<SpotId, number>> } | null;
  boatShare: number;
  grades: Partial<Record<GradeId, GradeCurve>>;
  /** 밤 어종 최대가 ÷ 같은 등급 낮 어종 최대가 */
  night: Partial<Record<GradeId, number>>;
  anchors: Anchor[];
  /** 입질 대기 감소 방식. alternate이면 해역 EV 계산에 반영하고 덮어쓰기에 쓴다 */
  bite: BiteDecayMode;
  solve: SolveVar | null;
  /** 시뮬레이션으로 전환 시간을 재는 최대 일수 */
  maxDays: number;
  /** 역전 허용폭. 앞 해역 EV ÷ 다음 해역 진입 EV가 1 초과 1 + 허용폭 이하이면 허용이다. 생략하면 0 */
  reversalTolerance?: number;
}

/** ratio는 일반 최대가 대비 그 등급 낮 어종 최대가, nightRatio는 같은 기준의 밤 어종 최대가(없으면 null), evShare는 EV에서 그 등급(낮과 밤 합)의 몫 */
export interface GradeCell { ratio: number | null; nightRatio: number | null; evShare: number }

export interface DesignRow {
  spot: SpotId;
  index: number;
  level: number; power: number;
  /** 구간 강화 횟수(마지막 해역은 null) */
  gap: number | null;
  upgradeSum: number | null;
  boatPrice: number | null;
  /** 목표 시간: 시간 목표 방식은 입력 H, 회수 시간 방식은 강화 h 합 + 배 시간 */
  hours: number | null;
  /** 회수 시간 방식의 첫 강화 회수 시간 h(진입 레벨) */
  payback: number | null;
  requiredEv: number;
  /** 필요 EV가 식에서 나오지 않고 목표값(기준점 EV 또는 현재 EV)으로 주어진 해역인가 */
  evIsTarget: boolean;
  /** 앞 해역 필요 EV 대비 증가율 */
  evGrowth: number | null;
  /** 가격을 바꾸기 전, 새 진입 레벨에서의 현재 해역 EV */
  currentEv: number;
  /** 필요 EV ÷ 현재 EV */
  evRatio: number;
  /** 덮어쓰기를 적용한 진입 레벨의 방치 배수 */
  entryBoost: number;
  /** 일반 가격 배율(등급 비율을 바꾸면 그 몫을 일반 가격이 흡수한다) */
  priceMult: number;
  /** 등급별 비율과 EV 기여 비중. 그 해역에 어종이 없는 등급은 null */
  grades: Record<RarityId, GradeCell | null>;
  /** 덮어쓰기를 적용해 잰 진입 EV(어종 가격 사다리 반올림 포함)와 시뮬레이션 전환 시간(골드를 기다린 시간) */
  achievedEv: number;
  measuredHours: number | null;
}

export interface ReversalRow {
  spot: SpotId; next: SpotId;
  /** 앞 해역에서 다음 해역 진입 직전 레벨까지 올렸을 때 EV(덮어쓰기 적용 후)와 다음 해역 진입 EV */
  level: number; ev: number; nextEv: number;
  /** 비가 1 + 허용폭을 넘는 역전 */
  reversed: boolean;
  /** 비가 1 초과 1 + 허용폭 이하인 허용 */
  tolerated: boolean;
  /** 방치 배수를 앞 해역 진입 레벨의 값으로 고정하고 입질 속도 효과만 반영한 앞 해역 EV와 그 판정 */
  evNoBoost: number;
  reversedNoBoost: boolean;
  toleratedNoBoost: boolean;
}

export interface AnchorRow { spot: SpotId; anchorEv: number; designEv: number; error: number; level: number }

export interface GradeExample {
  grade: GradeId;
  /** 마지막 해역의 일반 최대가 대비 낮 어종 최대가 비율 */
  last: number;
  /** 해역 순번에 대한 로그 선형 회귀의 순번당 배율과, 그 배율에서 마지막 해역 비율을 정확히 내는 시작 비율 */
  step: number; base: number;
  /** 마지막 해역의 밤 어종 최대가 ÷ 낮 어종 최대가. 밤 어종이 없으면 null */
  night: number | null;
}

export interface DesignReport {
  input: DesignInput;
  /** 풀이 뒤 확정된 값 */
  resolved: { growth: number; payback: number | null; gaps: (number | null)[]; solved: SolveVar | null };
  rows: DesignRow[];
  reversals: ReversalRow[];
  anchors: AnchorRow[];
  /** 레벨 차 이득이 끝나는 레벨 차(마을 해역과 그 밖의 해역) */
  boostEnds: { village: number; world: number };
  upgrades: { levels: LevelRow[]; purchases: PurchaseRow[] };
  /** 현재 제품 가격의 등급 비율을 재현하는 계수 예 */
  example: GradeExample[];
  override: FlowOverride;
  complete: boolean;
}

/** 단일 지수 곡선이 끝까지 지수로 가도록 하는 경계 레벨 */
const NO_POWER_PHASE = 1_000_000;

const perSpot = (p: PerSpot, spot: SpotId): number | null => p.by[spot] ?? p.all;

function withCurve<T>(start: number, growth: number, fn: () => T): T {
  const undo = applyRodRules({ costBase: start, costGrowth: 1 + growth, costPowerFrom: NO_POWER_PHASE });
  try { return fn(); } finally { undo(); }
}

const costSum = (from: number, count: number): number => {
  let s = 0;
  for (let lv = from; lv < from + count; lv++) s += upgradeCost(lv);
  return s;
};

const paybackAt = (base: number, growth: number, level: number): number => base * (1 + growth) ** (level - 1);

/** 해역의 구간에서 쓰는 회수 시간 — 해역별 지정이 있으면 그 값, 없으면 곡선 */
const paybackOf = (p: NonNullable<DesignInput['payback']>, base: number, spot: SpotId, level: number): number =>
  p.by[spot] ?? paybackAt(base, p.growth, level);

function entryLevelsOf(gaps: readonly (number | null)[]): number[] {
  const out = [1];
  for (let i = 0; i < SPOTS.length - 1; i++) out.push(out[i] + (gaps[i] ?? 0));
  return out;
}

/** 간격을 해역별로 풀어 낸다. 마지막 해역은 간격이 없어도 된다 */
function gapsOf(gap: PerSpot): (number | null)[] {
  return SPOTS.map((s, i) => {
    if (i === SPOTS.length - 1) return null;
    const v = perSpot(gap, s.id);
    if (v === null) throw new Error(`해역 간격이 없습니다: ${s.id} (--gap 값 또는 --gap 해역=k)`);
    if (!Number.isInteger(v) || v < 1) throw new Error(`해역 간격은 1 이상의 정수여야 합니다: ${s.id}=${v}`);
    return v;
  });
}

function indexOfSpot(spot: SpotId): number {
  const i = SPOTS.findIndex(s => s.id === spot);
  if (i < 0) throw new Error(`없는 해역입니다: ${spot}`);
  return i;
}

/** 회수 시간 방식에서 진입 레벨이 level인 해역의 EV */
const paybackEv = (level: number, base: number, pg: number): number => upgradeCost(level) / paybackAt(base, pg, level);

const lnErr = (model: number, target: number): number => Math.log(model / target);

function goldenMin(f: (x: number) => number, lo: number, hi: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi, c = b - g * (b - a), d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < 200 && b - a > 1e-12; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/** 기준점 해역 사이 간격을 정한다. 기준점마다 그 진입 레벨의 회수 시간 방식 EV가 가장 가까운 레벨을 고르고, 구간 합을 구간의 해역에 균등 분배한다(남는 레벨은 뒤 해역부터) */
function solveGaps(anchors: readonly Anchor[], start: number, growth: number, base: number, pg: number): (number | null)[] {
  const sorted = [...anchors].sort((a, b) => indexOfSpot(a.spot) - indexOfSpot(b.spot));
  const MAX_LEVEL = 600;
  const levels: number[] = [];
  withCurve(start, growth, () => {
    let prev = 1, prevIdx = 0;
    for (const a of sorted) {
      const idx = indexOfSpot(a.spot);
      let best = -1, bestErr = Infinity;
      for (let lv = prev + (idx - prevIdx); lv <= MAX_LEVEL; lv++) {
        const err = Math.abs(lnErr(paybackEv(lv, base, pg), a.ev));
        if (err < bestErr) { bestErr = err; best = lv; }
      }
      if (idx === 0) best = 1;
      levels.push(best);
      prev = best; prevIdx = idx;
    }
  });
  const gaps: (number | null)[] = SPOTS.map(() => null);
  let from = 0, fromLevel = 1, lastBase = 1;
  sorted.forEach((a, k) => {
    const to = indexOfSpot(a.spot);
    const m = to - from, span = levels[k] - fromLevel;
    if (m > 0) {
      if (span < m) throw new Error(`기준점 ${a.spot}의 진입 레벨 ${levels[k]}까지 앞 해역 ${m}개에 간격 1 이상을 줄 수 없습니다`);
      const b = Math.floor(span / m), rem = span - b * m;
      for (let i = 0; i < m; i++) gaps[from + i] = b + (i >= m - rem ? 1 : 0);
      lastBase = b;
    }
    from = to; fromLevel = levels[k];
  });
  for (let i = from; i < SPOTS.length - 1; i++) gaps[i] = lastBase;
  return gaps;
}

interface Resolved { growth: number; payback: number | null; gaps: (number | null)[]; solved: SolveVar | null }

function resolve(input: DesignInput): Resolved {
  const { solve } = input;
  if (!input.payback && !input.hours) throw new Error('--hours 또는 --payback이 필요합니다');
  if (solve && !input.payback) throw new Error('--solve는 회수 시간 방식(--payback, --payback-growth)에서만 쓸 수 있습니다');
  if (solve && input.anchors.length === 0) throw new Error('--solve에는 기준점(--anchor)이 필요합니다');
  if (solve === 'gap' && (input.gap.all !== null || Object.keys(input.gap.by).length > 0)) throw new Error('--solve gap과 --gap은 함께 줄 수 없습니다');
  if (solve === 'growth' && input.growth !== null) throw new Error('--solve growth와 --growth는 함께 줄 수 없습니다');
  if (solve === 'payback' && input.payback?.base != null) throw new Error('--solve payback과 --payback은 함께 줄 수 없습니다');
  if (solve !== 'growth' && input.growth === null) throw new Error('--growth가 필요합니다');
  if (input.payback && input.payback.base === null && solve !== 'payback') throw new Error('--payback이 필요합니다');
  if (input.payback) {
    for (const [spot, v] of Object.entries(input.payback.by)) {
      if (!(v > 0)) throw new Error(`회수 시간은 0보다 커야 합니다: ${spot}=${v}`);
      if (solve && input.anchors.some(a => a.spot === spot)) throw new Error(`기준점 해역(${spot})의 회수 시간은 기준점에서 정해지므로 지정할 수 없습니다`);
    }
    if (input.payback.base !== null && !(input.payback.base > 0)) throw new Error('--payback은 0보다 커야 합니다(시간)');
  }
  const pg = input.payback?.growth ?? 0;
  const anchors = input.anchors;
  let growth = input.growth ?? 0.1;
  let base = input.payback?.base ?? 1;
  let gaps: (number | null)[] = solve === 'gap' ? [] : gapsOf(input.gap);
  if (solve === 'gap') {
    gaps = solveGaps(anchors, input.start, growth, base, pg);
  } else if (solve === 'growth') {
    const levels = entryLevelsOf(gaps);
    growth = goldenMin(r => withCurve(input.start, r, () => anchors.reduce((s, a) => s + lnErr(paybackEv(levels[indexOfSpot(a.spot)], base, pg), a.ev) ** 2, 0)), 1e-4, 2);
  } else if (solve === 'payback') {
    const levels = entryLevelsOf(gaps);
    // 모델 EV는 1 ÷ payback에 비례하므로 로그 오차 제곱합의 최소점은 닫힌 형식이다
    const logs = withCurve(input.start, growth, () => anchors.map(a => {
      const lv = levels[indexOfSpot(a.spot)];
      return Math.log(upgradeCost(lv) / ((1 + pg) ** (lv - 1) * a.ev));
    }));
    base = Math.exp(logs.reduce((s, x) => s + x, 0) / logs.length);
  }
  return { growth, payback: input.payback ? base : null, gaps, solved: solve };
}

interface Part { p: number; ev: number; max: number }
interface Breakdown { day: Record<RarityId, Part>; night: Record<RarityId, Part>; ev: number }

/** 해역 진입 레벨의 EV를 등급과 낮밤 어종으로 나눈다. EV = 개체 확률 x 판매가 합 x 돌연변이 기댓값 x 시간당 캐치 수. max는 그 어종 무리의 최고 판매가 */
function breakdownAt(spot: SpotId, level: number): Breakdown {
  const r = rates(spot, level, 'idle');
  const k = VARIANT_EV * r.catchesPerHour;
  const empty = () => Object.fromEntries(RARITY_ORDER.map(g => [g, { p: 0, ev: 0, max: 0 }])) as Record<RarityId, Part>;
  const day = empty(), night = empty();
  for (const row of r.rows) {
    const c = (row.fish.night ? night : day)[row.fish.rarity];
    c.p += row.prob; c.ev += row.prob * row.fish.price * k;
  }
  for (const f of FISH) {
    if (f.spot !== spot) continue;
    const c = (f.night ? night : day)[f.rarity];
    c.max = Math.max(c.max, f.price);
  }
  return { day, night, ev: r.goldPerHour };
}

/** 현재 제품 가격의 등급 비율 — 일반 최대가 대비 낮 어종 최대가와, 낮 어종 대비 밤 어종 최대가 */
function currentRatios(spot: SpotId): { day: Partial<Record<GradeId, number>>; night: Partial<Record<GradeId, number>> } {
  const list = FISH.filter(f => f.spot === spot);
  const max = (g: RarityId, night: boolean) => Math.max(0, ...list.filter(f => f.rarity === g && !!f.night === night).map(f => f.price));
  const common = max('common', false);
  const day: Partial<Record<GradeId, number>> = {}, night: Partial<Record<GradeId, number>> = {};
  for (const g of GRADE_IDS) {
    const d = max(g, false), nt = max(g, true);
    if (d > 0 && common > 0) day[g] = d / common;
    if (d > 0 && nt > 0) night[g] = nt / d;
  }
  return { day, night };
}

/** 현재 제품 가격을 재현하는 계수 예 — 마지막 해역 비율을 정확히 내는 시작 비율과, 전 해역 회귀로 구한 순번당 배율, 밤 배율 */
export function gradeExample(): GradeExample[] {
  const n = SPOTS.length;
  const per = SPOTS.map(s => currentRatios(s.id));
  const out: GradeExample[] = [];
  for (const g of GRADE_IDS) {
    const pts = per.map((r, i) => [i, r.day[g]] as const).filter((x): x is readonly [number, number] => x[1] !== undefined);
    const last = per[n - 1].day[g];
    if (last === undefined || pts.length < 2) continue;
    const mx = pts.reduce((s, x) => s + x[0], 0) / pts.length, my = pts.reduce((s, x) => s + Math.log(x[1]), 0) / pts.length;
    const slope = pts.reduce((s, x) => s + (x[0] - mx) * (Math.log(x[1]) - my), 0) / pts.reduce((s, x) => s + (x[0] - mx) ** 2, 0);
    const step = Math.exp(slope);
    out.push({ grade: g, last, step, base: last / step ** (n - 1), night: per[n - 1].night[g] ?? null });
  }
  return out;
}

/** 레벨 차 이득이 끝나는 레벨 차 — 방치 배수가 하한에 닿는 가장 작은 레벨 차 */
function boostEnd(spot: SpotId): number {
  const floor = relativeIdleBoost(powerOfLevel(entryLevel(spot) + 200), spot);
  let d = 0;
  while (relativeIdleBoost(powerOfLevel(entryLevel(spot) + d), spot) !== floor) d += 1;
  return d;
}

export function designReport(input: DesignInput): DesignReport {
  const n = SPOTS.length;
  for (const a of input.anchors) indexOfSpot(a.spot);
  const seen = new Set<string>();
  for (const a of input.anchors) {
    if (seen.has(a.spot)) throw new Error(`기준점 해역이 두 번 있습니다: ${a.spot}`);
    seen.add(a.spot);
  }
  const lastId = SPOTS[n - 1].id;
  if (input.gap.by[lastId] !== undefined || input.hours?.by[lastId] !== undefined) {
    throw new Error(`마지막 해역(${lastId})은 구간이 없어 간격과 전환 시간을 받지 않습니다`);
  }
  const tol = input.reversalTolerance ?? 0;
  if (!(tol >= 0) || !Number.isFinite(tol)) throw new Error('역전 허용폭은 0 이상의 숫자여야 합니다');
  const share = input.boatShare;
  if (!(share >= 0 && share < 1)) throw new Error('배 비중은 0 이상 1 미만이어야 합니다');
  if (!(input.start > 0)) throw new Error('--start는 0보다 커야 합니다');
  const example = gradeExample();
  const res = resolve(input);
  if (!(res.growth > 0)) throw new Error('--growth는 0보다 커야 합니다');
  const { gaps } = res;
  const levels = entryLevelsOf(gaps);
  const powers = levels.map(powerOfLevel);

  // 구간별 강화비 합과 새로 사는 배
  const spans = SPOTS.map((s, i) => {
    if (i === n - 1 || gaps[i] === null) return null;
    const sum = withCurve(input.start, res.growth, () => costSum(levels[i], gaps[i]!));
    const boats = BOATS.filter(b => b.tier > s.boatTier && b.tier <= SPOTS[i + 1].boatTier);
    const total = boats.length > 0 ? sum / (1 - share) : sum;
    return { sum, boats, boatPrice: total - sum };
  });

  // 현재 해역 EV: 새 진입 레벨과 요구 파워를 적용한 제품 규칙으로 잰다
  const spotPatch = Object.fromEntries(SPOTS.map((s, i) => [s.id, { powerReq: powers[i] }]));
  const current = (() => {
    const undo = applyOverride({ spots: spotPatch, rod: { biteDecayMode: input.bite } });
    try { return SPOTS.map((s, i) => breakdownAt(s.id, levels[i])); } finally { undo(); }
  })();

  const requiredEv = SPOTS.map((s, i) => {
    if (input.payback) return withCurve(input.start, res.growth, () => upgradeCost(levels[i]) / paybackOf(input.payback!, res.payback!, s.id, levels[i]));
    const span = spans[i];
    const h = span ? perSpot(input.hours!, s.id) : null;
    if (span && h === null) throw new Error(`전환 시간 목표가 없습니다: ${s.id} (--hours 값 또는 --hours 해역=H)`);
    if (h !== null && !(h > 0)) throw new Error(`전환 시간은 0보다 커야 합니다: ${s.id}=${h}`);
    // 구간이 없는 마지막 해역: 기준점이 있으면 그 EV, 없으면 가격을 바꾸지 않은 현재 EV
    return span ? (span.sum + span.boatPrice) / h! : input.anchors.find(a => a.spot === s.id)?.ev ?? current[i].ev;
  });

  const priceMult: number[] = [], gradeMult: Partial<Record<GradeId, number>>[] = [], nightMult: Partial<Record<GradeId, number>>[] = [];
  const gradeCells: Record<RarityId, GradeCell | null>[] = [];
  SPOTS.forEach((_, i) => {
    const b = current[i];
    const cm = b.day.common.max;
    // 등급별 낮 어종 배율 a, 밤 어종 배율 bn(일반 가격 배율 c를 곱하기 전, 현재 가격 기준)
    const a: Record<string, number> = {}, bn: Record<string, number> = {};
    let evAt1 = b.day.common.ev + b.night.common.ev;
    for (const g of GRADE_IDS) {
      const d = b.day[g], nt = b.night[g];
      const curve = input.grades[g], nm = input.night[g];
      const specified = curve !== undefined && cm > 0;
      const dayTarget = specified ? curve!.base * curve!.step ** i * cm : d.max > 0 ? d.max : null;
      a[g] = d.max > 0 && specified ? dayTarget! / d.max : 1;
      bn[g] = a[g];
      if (nt.max > 0 && nm !== undefined && dayTarget !== null) bn[g] = dayTarget * nm / nt.max;
      evAt1 += d.ev * a[g] + nt.ev * bn[g];
    }
    const c = requiredEv[i] / evAt1;
    priceMult.push(c);
    const gm: Partial<Record<GradeId, number>> = {}, nmx: Partial<Record<GradeId, number>> = {};
    for (const g of GRADE_IDS) {
      if (a[g] !== 1) gm[g] = a[g];
      if (bn[g] !== a[g]) nmx[g] = bn[g] / a[g];
    }
    gradeMult.push(gm); nightMult.push(nmx);
    const cell = {} as Record<RarityId, GradeCell | null>;
    for (const g of RARITY_ORDER) {
      const d = b.day[g], nt = b.night[g];
      if (d.p + nt.p === 0) { cell[g] = null; continue; }
      const fa = g === 'common' ? 1 : a[g], fb = g === 'common' ? 1 : bn[g];
      cell[g] = {
        ratio: g === 'common' ? 1 : d.max > 0 && cm > 0 ? d.max * fa / cm : null,
        nightRatio: g === 'common' || nt.max === 0 || cm === 0 ? null : nt.max * fb / cm,
        evShare: c * (d.ev * fa + nt.ev * fb) / requiredEv[i],
      };
    }
    gradeCells.push(cell);
  });

  // 덮어쓰기: 낚싯대 곡선, 요구 파워, 가격 배율, 등급 배율, 배 가격
  const override: FlowOverride = {
    rod: { costBase: input.start, costGrowth: 1 + res.growth, costPowerFrom: NO_POWER_PHASE, ...(input.bite === 'alternate' ? { biteDecayMode: input.bite } : {}) },
    boats: {},
    spots: Object.fromEntries(SPOTS.map((s, i) => [s.id, {
      powerReq: powers[i], priceMult: priceMult[i],
      ...(Object.keys(gradeMult[i]).length > 0 ? { gradeMult: gradeMult[i] } : {}),
      ...(Object.keys(nightMult[i]).length > 0 ? { nightMult: nightMult[i] } : {}),
    }])),
  };
  for (const b of BOATS) override.boats![String(b.tier)] = { price: 0, fameReq: 0 };
  for (const span of spans) {
    if (!span || span.boats.length === 0) continue;
    const priced = span.boats.reduce((s, b) => s + b.price, 0);
    for (const b of span.boats) override.boats![String(b.tier)] = { fameReq: 0, price: Math.round(span.boatPrice * (priced > 0 ? b.price / priced : 1 / span.boats.length)) };
  }

  // 덮어쓰기를 적용해 달성 EV, 역전 검사, 새 곡선 표, 시뮬레이션 전환 시간을 잰다
  const undo = applyOverride(override);
  let achieved: number[], entryBoosts: number[], reversals: ReversalRow[], upgrades: DesignReport['upgrades'], measured: (number | null)[], complete: boolean;
  try {
    achieved = SPOTS.map((s, i) => rates(s.id, levels[i], 'idle').goldPerHour);
    entryBoosts = SPOTS.map((s, i) => rodSpec(s.id, levels[i]).idleBoost);
    reversals = SPOTS.slice(0, n - 1).map((s, i) => {
      const level = levels[i + 1] - 1;
      const ev = rates(s.id, level, 'idle').goldPerHour;
      const evNoBoost = rates(s.id, level, 'idle', { commonMult: entryBoosts[i] * rodSpec(s.id, level).gateMult }).goldPerHour;
      return { spot: s.id, next: SPOTS[i + 1].id, level, ev, nextEv: achieved[i + 1], reversed: ev / achieved[i + 1] > 1 + tol, tolerated: ev > achieved[i + 1] && ev / achieved[i + 1] <= 1 + tol, evNoBoost, reversedNoBoost: evNoBoost / achieved[i + 1] > 1 + tol, toleratedNoBoost: evNoBoost > achieved[i + 1] && evNoBoost / achieved[i + 1] <= 1 + tol };
    });
    upgrades = { levels: levelRows(1, levels[n - 1]), purchases: purchaseRows() };
    const sim = transitionReport({ axis: 'idle', maxDays: input.maxDays });
    complete = sim.complete;
    measured = SPOTS.map((_, i) => (i < sim.timings.length ? sim.timings[i].goldWait : null));
  } finally { undo(); }

  const anchors: AnchorRow[] = input.anchors.filter(a => input.payback || spans[indexOfSpot(a.spot)] !== null).map(a => {
    const i = indexOfSpot(a.spot);
    return { spot: a.spot, anchorEv: a.ev, designEv: requiredEv[i], error: requiredEv[i] / a.ev - 1, level: levels[i] };
  });

  const rows: DesignRow[] = SPOTS.map((s, i) => {
    const span = spans[i];
    const pb = input.payback ? paybackOf(input.payback, res.payback!, s.id, levels[i]) : null;
    let hours: number | null = null;
    if (span) {
      if (input.payback) {
        let t = 0;
        for (let lv = levels[i]; lv < levels[i] + gaps[i]!; lv++) t += paybackOf(input.payback, res.payback!, s.id, lv);
        hours = t + span.boatPrice / requiredEv[i];
      } else hours = perSpot(input.hours!, s.id);
    }
    return {
      spot: s.id, index: i, level: levels[i], power: powers[i], gap: gaps[i],
      upgradeSum: span ? span.sum : null, boatPrice: span ? span.boatPrice : null, hours, payback: pb,
      requiredEv: requiredEv[i], evIsTarget: !input.payback && span === null, evGrowth: i > 0 ? requiredEv[i] / requiredEv[i - 1] - 1 : null,
      currentEv: current[i].ev, evRatio: requiredEv[i] / current[i].ev, entryBoost: entryBoosts[i], priceMult: priceMult[i],
      grades: gradeCells[i], achievedEv: achieved[i], measuredHours: measured[i] ?? null,
    };
  });

  return {
    input, resolved: res, rows, reversals, anchors,
    boostEnds: { village: boostEnd(SPOTS[0].id), world: boostEnd(SPOTS.find(s => s.boatTier > 0)!.id) },
    upgrades, example, override, complete,
  };
}

/** 등급 인자 `희귀=1.5:1.03`(이름 또는 id, 시작 비율:순번당 배율. 배율을 생략하면 1)을 읽는다 */
export function parseGrade(raw: string): { grade: GradeId; curve: GradeCurve } {
  const m = /^([^=]+)=([^:]+)(?::(.+))?$/.exec(raw);
  if (!m) throw new Error(`--grade 형식은 등급=시작비율:순번당배율입니다: ${raw}`);
  const grade = GRADE_IDS.find(g => g === m[1] || RARITY[g].name === m[1]);
  if (!grade) throw new Error(`--grade의 등급이 올바르지 않습니다: ${m[1]} (${GRADE_IDS.map(g => RARITY[g].name).join(', ')} 중 하나)`);
  const base = Number(m[2]), step = m[3] === undefined ? 1 : Number(m[3]);
  if (!(base > 0) || !Number.isFinite(base) || !(step > 0) || !Number.isFinite(step)) throw new Error(`--grade의 값은 0보다 큰 숫자여야 합니다: ${raw}`);
  return { grade, curve: { base, step } };
}

/** 밤 배율 인자 `영웅=1.7`을 읽는다 */
export function parseNight(raw: string): { grade: GradeId; mult: number } {
  const m = /^([^=]+)=(.+)$/.exec(raw);
  const grade = m ? GRADE_IDS.find(g => g === m[1] || RARITY[g].name === m[1]) : undefined;
  const mult = m ? Number(m[2]) : NaN;
  if (!grade || !(mult > 0) || !Number.isFinite(mult)) throw new Error(`--night 형식은 등급=배율(0보다 큰 숫자)입니다: ${raw}`);
  return { grade, mult };
}

/** `값` 또는 `해역=값`을 읽어 PerSpot에 담는다 */
export function addPerSpot(target: PerSpot, flag: string, raw: string): void {
  const eq = raw.indexOf('=');
  if (eq < 0) {
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) throw new Error(`${flag}에는 숫자가 필요합니다: ${raw}`);
    target.all = v;
    return;
  }
  const spot = raw.slice(0, eq), text = raw.slice(eq + 1), v = Number(text);
  if (!SPOTS.some(s => s.id === spot)) throw new Error(`${flag}에 없는 해역입니다: ${spot}`);
  if (text.trim() === '' || !Number.isFinite(v)) throw new Error(`${flag}의 값은 숫자여야 합니다: ${raw}`);
  target.by[spot as SpotId] = v;
}

/** `해역=EV`를 읽는다 */
export function parseAnchor(raw: string): Anchor {
  const m = /^([^=]+)=(.+)$/.exec(raw);
  const ev = m ? Number(m[2].replace(/,/g, '')) : NaN;
  if (!m || !Number.isFinite(ev) || !(ev > 0)) throw new Error(`--anchor 형식은 해역=EV입니다: ${raw}`);
  indexOfSpot(m[1] as SpotId);
  return { spot: m[1] as SpotId, ev };
}

/** 기준점의 기본 해역 */
export const DEFAULT_ANCHOR_SPOT: SpotId = 'sthelena';

/** 해역의 현재 진입 레벨 방치 EV를 기준점으로 만든다. 설계 덮어쓰기를 적용하기 전의 현재 값이다 */
export function currentAnchor(spot: SpotId): Anchor {
  indexOfSpot(spot);
  return { spot, ev: rates(spot, entryLevel(spot), 'idle').goldPerHour };
}
