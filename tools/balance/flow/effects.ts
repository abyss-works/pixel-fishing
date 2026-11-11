// 요리 효과 지표 — 효과를 넣었을 때 해역별 수입, 도감 완성 시간, 분해 재료 공급이 효과 없음 대비 얼마나 달라지는지 잰다.
// 확률과 가격은 측정 모델(`rates`)과 제품 추첨 규칙(`addGradeEffect`로 거는 등급 가중치 효과, 돌연변이 확률, 네임드 조우 가중치)을 그대로 불러 계산하고, 값을 복제하지 않는다.
// 효과는 여덟 가지 매개변수다. 기본값은 모두 효과 없음이다.
//   bite: 입질 대기 단축 비율(0.1은 10% 단축). 대기 전체(파워 미달 가산 포함)에 (1 - bite)를 곱한다
//   rare: 희귀 이상(희귀, 영웅, 전설) 등급 가중치 증가 비율. 등급마다 (1 + 합)을 한 번 곱하는 제품 규칙의 효과 합산에 더한다
//   epic: 영웅 이상(영웅, 전설) 등급 가중치 증가 비율. rare와 같은 방식이고 희귀 등급에는 걸지 않는다
//   legendary: 전설 등급 가중치 증가 비율. 세 등급 옵션은 등급마다 합산해 한 번만 곱한다
//   variant: 돌연변이 가중치 증가 비율. 유물과 같은 경로로 전역 돌연변이 가중치에 (1 + 증가)를 곱한다
//   size: 크기 증가 비율. 판매가와 도감 완성 조건이 크기를 쓰지 않으므로 이 지표들에 영향이 없다
//   move: 이동 속도 증가 비율. 실질 낚시 시간 밖의 이동만 줄이므로 낚시 시간당 수입은 그대로이고, 판매 왕복을 넣은 수입에서만 달라진다
//   named: 네임드 조우 가중치 증가 비율. 수입은 그대로이고 조우까지의 기대 시간만 달라진다
// 가정: 수동 낚시(미끼 슬롯)는 같은 모델의 GOOD 판정 축으로 잰다. 도감 완성은 한 해역에서만 낚을 때의 시간이다.
//   도감 완성 시간은 캐치 단위 몬테카를로이며 캐치 수를 그 조건의 캐치 속도로 시간으로 바꾼다. 시드가 같으면 결과가 같다.
//   어종 천장, 네임드 천장 외의 장치, 가방 한도, 유물은 넣지 않는다. 분해 재료의 등급별 단위는 설계 초안 값이고 바뀔 수 있어 옵션으로 받는다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import type { RarityId } from '../../../src/game/content/rarity';
import { BOUNTIES } from '../../../src/game/content/bounties';
import { MUTATION_WEIGHTS, VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { addGradeEffect, mutationWeightsOf, namedEncounterCandidates, namedWeightsOf, variantShare } from '../../../src/game/rules/logic';
import type { DrawOptions } from '../../../src/game/rules/logic';
import { NAMED_PITY_CATCHES } from '../../../src/game/rules/pity';
import { powerOfLevel } from '../../../src/game/rules/stats';
import { VARIANT_EV, entryLevel, meanCycleSec, rates, rng } from '../model';
import type { Axis, Pool, Rates, Row } from '../model';
import { expectedEncounterCatches } from './bounty';
import { axisOf } from './progress';
import type { FlowAxis } from './progress';
import { summarize } from './sample';
import type { Dist } from './sample';

export interface Effect {
  bite: number; rare: number; epic: number; legendary: number; variant: number; size: number; move: number; named: number;
}

export const NO_EFFECT: Effect = { bite: 0, rare: 0, epic: 0, legendary: 0, variant: 0, size: 0, move: 0, named: 0 };

/** 효과 매개변수 검사 — 범위를 벗어나면 오류 */
export function checkEffect(e: Effect): void {
  const bad = (msg: string) => { throw new Error(msg); };
  if (!(e.bite >= 0 && e.bite < 1)) bad('입질 대기 단축은 0 이상 100 미만(%)이어야 합니다');
  if (!(e.rare >= 0)) bad('희귀 이상 가중 증가는 0 이상(%)이어야 합니다');
  if (!(e.epic >= 0)) bad('영웅 이상 가중 증가는 0 이상(%)이어야 합니다');
  if (!(e.legendary >= 0)) bad('전설 가중 증가는 0 이상(%)이어야 합니다');
  if (!(e.variant >= 0)) bad('돌연변이 가중치 증가는 0 이상(%)이어야 합니다');
  if (!(e.size > -1)) bad('크기 증가는 -100 초과(%)여야 합니다');
  if (!(e.move > -1)) bad('이동 속도 증가는 -100 초과(%)여야 합니다');
  if (!(e.named >= 0)) bad('네임드 조우 증가는 0 이상(%)이어야 합니다');
}

/** 분해 재료의 등급별 단위 — 설계 초안(일반 1, 희귀 5, 영웅 25, 전설 125) */
export const DEFAULT_UNITS: Record<RarityId, number> = { common: 1, rare: 5, epic: 25, legendary: 125 };

/** 등급 옵션이 등급마다 더하는 가중치 증가 합 — 희귀 이상 옵션은 희귀, 영웅, 전설에, 영웅 이상 옵션은 영웅, 전설에, 전설 옵션은 전설에 걸린다 */
export function gradeBoostOf(e: Effect): Record<RarityId, number> {
  return { common: 0, rare: e.rare, epic: e.rare + e.epic, legendary: e.rare + e.epic + e.legendary };
}
/** 도감 완성 시뮬레이션이 한 시도에서 낚는 최대 캐치 수 — 넘으면 끝내지 못한 시도로 센다 */
export const DEX_CATCH_CAP = 2_000_000;

export interface EffectRates extends Rates { variantShare: number }

export const variantEv = (share: number): number => 1 + share * (VARIANT_PRICE_MULT - 1);

/** 돌연변이 가중치 증가를 넣은 해역의 돌연변이 확률 — 제품의 폼 가중치와 같은 경로다.
 *  증가가 있으면 유물과 같이 전역 가중치의 돌연변이 쪽에 (1 + 증가)를 곱하고(해역 덮어쓰기는 무시), 없으면 제품의 해역 가중치를 그대로 쓴다 */
export function variantShareOf(spot: SpotId, boost: number): number {
  const weights = mutationWeightsOf({ artifacts: [] }, spot);
  return variantShare(boost > 0 ? { variant: MUTATION_WEIGHTS.variant * (1 + boost), normal: MUTATION_WEIGHTS.normal } : weights);
}

/** 효과를 넣은 수입 — 측정 모델의 수입을 바탕으로 입질 대기 단축은 캐치 주기에, 희귀 이상, 영웅 이상, 전설 가중은 등급별로 합산해 추첨 옵션에, 돌연변이 가중치 증가는 판매가 기댓값에 반영한다 */
export function effectRates(spot: SpotId, level: number, axis: Axis, e: Effect, pool: Pool = 'mixed'): EffectRates {
  let extra: DrawOptions = {};
  const boost = gradeBoostOf(e);
  for (const g of RARITY_ORDER) if (boost[g] !== 0) extra = addGradeEffect(extra, g, boost[g]);
  const base = rates(spot, level, axis, extra, pool);
  const cycle = {
    ...base.cycle,
    biteMin: base.cycle.biteMin * (1 - e.bite), biteMax: base.cycle.biteMax * (1 - e.bite), biteExtra: base.cycle.biteExtra * (1 - e.bite),
  };
  const cph = 3600 / meanCycleSec(cycle);
  const share = variantShareOf(spot, e.variant);
  const scale = cph / base.catchesPerHour;
  return {
    ...base, cycle, catchesPerHour: cph, variantShare: share,
    goldPerHour: base.goldPerHour * scale * variantEv(share) / VARIANT_EV,
    famePerHour: base.famePerHour * scale,
  };
}

/** 해역마다 재는 낚싯대 레벨 */
const levelOf = (spot: SpotId, margin: number): number => entryLevel(spot) + margin;

/** 여유를 더한 레벨이 1 이상인 해역만 잰다 — 음수 여유에서 레벨이 없는 해역은 건너뛴다. 해역 순번은 전체 목록 기준이다 */
export const spotsAt = (margin: number): { s: (typeof SPOTS)[number]; i: number }[] =>
  SPOTS.map((s, i) => ({ s, i })).filter(({ s }) => levelOf(s.id, margin) >= 1);

// ── 1. 효과를 넣은 수입 ──

/** 판매 왕복을 넣은 수입 계산에 쓰는 해역별 가방 용량과 왕복 시간(초). 가방 채움 시간은 같은 레벨과 축의 캐치 속도로 계산한다 */
export interface TripTime { bagCap: number; tripSec: number }

export interface NamedRow {
  /** 조우 확률(캐치당)과 천장을 넣은 기대 조우 시간(시간). 조우가 일어나는 해역에서만 낸다 */
  shareBase: number; shareWith: number; hoursBase: number; hoursWith: number;
}

export interface IncomeRow {
  spot: SpotId; level: number;
  goldBase: number; goldWith: number; goldChange: number;
  fameBase: number; fameWith: number; fameChange: number;
  /** 등급별 캐치 비율(기본, 효과) */
  grade: Record<RarityId, { base: number; with: number }>;
  /** 판매 왕복을 넣은 시간당 골드 변화. 왕복 시간을 주지 않았으면 null */
  tripChange: number | null;
  /** 그 구역에 네임드 의뢰가 있고 출현 해역이 맞는 해역만 값이 있다. 조우가 없는 해역은 null */
  named: NamedRow | null;
  /** PERFECT 축일 때만 — 효과 없는 방치 시간당 골드 대비 PERFECT 시간당 골드(기본, 효과). 다른 축은 null */
  overIdle: { base: number; with: number } | null;
}

export interface IncomeOptions {
  axis: FlowAxis; effect: Effect; margin: number;
  /** 해역별 가방 용량과 왕복 시간 — 있으면 판매 왕복을 넣은 수입 변화를 함께 낸다 */
  trips?: ReadonlyMap<SpotId, TripTime>;
}

/** 모든 네임드 의뢰를 수주했다고 보고 해역마다 조우 후보가 있는지 판정한다 */
const NAMED_QUEST_IDS = BOUNTIES.filter(q => q.difficulty === 'named').map(q => q.id);

const change = (base: number, now: number): number => (base === 0 ? 0 : now / base - 1);

export function incomeRows(o: IncomeOptions): IncomeRow[] {
  checkEffect(o.effect);
  return spotsAt(o.margin).map(({ s }) => {
    const level = levelOf(s.id, o.margin), axis = axisOf(o.axis, s.id, level);
    const base = effectRates(s.id, level, axis, NO_EFFECT), now = effectRates(s.id, level, axis, o.effect);
    const trip = o.trips?.get(s.id);
    let tripChange: number | null = null;
    if (trip) {
      const fillBase = trip.bagCap / base.catchesPerHour * 3600, fillWith = trip.bagCap / now.catchesPerHour * 3600;
      const tripWith = trip.tripSec / (1 + o.effect.move);
      const kept = (fill: number, t: number) => fill / (fill + t);
      tripChange = change(base.goldPerHour * kept(fillBase, trip.tripSec), now.goldPerHour * kept(fillWith, tripWith));
    }
    const perHour = (r: EffectRates, bonus: number) => {
      const w = namedWeightsOf(s.id, bonus);
      const p = w.named / (w.named + w.none);
      return { share: p, hours: expectedEncounterCatches(p, NAMED_PITY_CATCHES) / r.catchesPerHour };
    };
    const idleGold = o.axis === 'perfect' ? effectRates(s.id, level, 'idle', NO_EFFECT).goldPerHour : null;
    const encounters = namedEncounterCandidates(NAMED_QUEST_IDS, s.id).length > 0;
    const nb = perHour(base, 0), nw = perHour(now, o.effect.named);
    return {
      spot: s.id, level,
      grade: Object.fromEntries(RARITY_ORDER.map(g => [g, { base: base.rarity[g] ?? 0, with: now.rarity[g] ?? 0 }])) as IncomeRow['grade'],
      goldBase: base.goldPerHour, goldWith: now.goldPerHour, goldChange: change(base.goldPerHour, now.goldPerHour),
      fameBase: base.famePerHour, fameWith: now.famePerHour, fameChange: change(base.famePerHour, now.famePerHour),
      tripChange,
      overIdle: idleGold === null ? null : { base: base.goldPerHour / idleGold, with: now.goldPerHour / idleGold },
      named: encounters ? { shareBase: nb.share, shareWith: nw.share, hoursBase: nb.hours, hoursWith: nw.hours } : null,
    };
  });
}

// ── 2. 도감 완성 시간 ──

export interface DexTimes {
  /** 일반 폼 전부(전설 제외), 일반 폼 전부, 돌연변이 폼 전부를 모으는 실질 낚시 시간(시간)의 분포. 시도가 하나도 끝나지 않으면 null */
  noLegend: Dist | null; all: Dist | null; variant: Dist | null;
  /** 영웅, 전설 도감 — 그 등급 어종의 일반 폼과 돌연변이 폼을 전부 모으는 시간. 끝난 시도가 없으면 null */
  epic: Dist | null; legendary: Dist | null;
}

export interface DexRow {
  spot: SpotId; level: number;
  species: number; epic: number; legendary: number;
  base: DexTimes; with: DexTimes;
}

export interface DexOptions {
  axis: FlowAxis; effect: Effect; margin: number; trials: number; seed: number;
  /** 주면 효과를 이 분 동안만 걸고 이후는 효과 없이 낚는다(시간 제한 효과). 생략하면 효과가 끝까지 이어진다 */
  windowMinutes?: number;
}

/** 효과가 있는 앞 구간 — 그 구간 동안만 이 확률과 속도로 낚고 이후는 기본 확률과 속도로 낚는다 */
export interface DexWindow { minutes: number; rows: readonly Row[]; share: number; catchesPerHour: number }

/** 한 해역의 도감 완성 시간 몬테카를로 — 캐치마다 어종과 폼을 뽑아 다섯 조건의 완성 캐치 수를 센다.
 *  window를 주면 처음 minutes분(기대 캐치 수를 반올림한 개수)은 window의 확률로 낚고 이후는 기본 확률로 낚는다. 난수를 소비하는 순서가 window 유무와 같아 같은 시드면 두 결과가 짝지어진다 */
export function dexTimes(rows: readonly Row[], share: number, catchesPerHour: number, trials: number, rand: () => number, window?: DexWindow): DexTimes {
  const n = rows.length;
  const legend = rows.map(r => r.fish.rarity === 'legendary');
  const needNoLegend = legend.filter(l => !l).length;
  const GRADES = ['epic', 'legendary'] as const;
  const gradeOf = rows.map(r => GRADES.indexOf(r.fish.rarity as (typeof GRADES)[number]));
  const gradeNeed = GRADES.map((_, k) => 2 * gradeOf.filter(g => g === k).length);
  const cumOf = (probs: readonly number[]) => { let acc = 0; return probs.map(p => (acc += p)); };
  const cum = cumOf(rows.map(r => r.prob));
  const total = cum[n - 1] ?? 0;
  const windowProb = window ? new Map(window.rows.map(r => [r.fish.id, r.prob])) : null;
  const wcum = window ? cumOf(rows.map(r => windowProb!.get(r.fish.id) ?? 0)) : cum;
  const wtotal = wcum[n - 1] ?? 0;
  const windowCatches = window ? Math.round(window.catchesPerHour * window.minutes / 60) : 0;
  const reachable = n > 0 && rows.every(r => r.prob > 0);
  const out = { noLegend: [] as number[], all: [] as number[], variant: [] as number[], grade: [[], []] as number[][] };
  if (reachable) {
    for (let t = 0; t < trials; t++) {
      const normal = new Uint8Array(n), variant = new Uint8Array(n);
      let nNormal = 0, nVariant = 0, nNoLegend = 0, catches = 0;
      const gradeHave = [0, 0];
      const tGrade = gradeNeed.map(need => (need === 0 || share <= 0 ? Number.POSITIVE_INFINITY : -1));
      let tNo = needNoLegend === 0 ? 0 : -1, tAll = -1, tVar = share > 0 ? -1 : Number.POSITIVE_INFINITY;
      while ((tNo < 0 || tAll < 0 || tVar < 0 || tGrade[0] < 0 || tGrade[1] < 0) && catches < DEX_CATCH_CAP) {
        catches++;
        const inWindow = catches <= windowCatches;
        const c = inWindow ? wcum : cum;
        const x = rand() * (inWindow ? wtotal : total);
        let lo = 0, hi = n - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (x < c[mid]) hi = mid; else lo = mid + 1; }
        if (rand() < (inWindow ? window!.share : share)) {
          if (!variant[lo]) {
            variant[lo] = 1; nVariant++; if (nVariant === n) tVar = catches;
            if (gradeOf[lo] >= 0 && ++gradeHave[gradeOf[lo]] === gradeNeed[gradeOf[lo]]) tGrade[gradeOf[lo]] = catches;
          }
        } else if (!normal[lo]) {
          normal[lo] = 1; nNormal++;
          if (gradeOf[lo] >= 0 && ++gradeHave[gradeOf[lo]] === gradeNeed[gradeOf[lo]]) tGrade[gradeOf[lo]] = catches;
          if (!legend[lo]) { nNoLegend++; if (nNoLegend === needNoLegend) tNo = catches; }
          if (nNormal === n) tAll = catches;
        }
      }
      const hours = (k: number) => (window && k > windowCatches
        ? window.minutes / 60 + (k - windowCatches) / catchesPerHour
        : k / (window ? window.catchesPerHour : catchesPerHour));
      if (tNo >= 0) out.noLegend.push(hours(tNo));
      if (tAll >= 0) out.all.push(hours(tAll));
      if (tVar >= 0 && Number.isFinite(tVar)) out.variant.push(hours(tVar));
      tGrade.forEach((k, g) => { if (k >= 0 && Number.isFinite(k)) out.grade[g].push(hours(k)); });
    }
  }
  const dist = (v: number[]) => summarize(v, trials - v.length);
  return { noLegend: dist(out.noLegend), all: dist(out.all), variant: dist(out.variant), epic: dist(out.grade[0]), legendary: dist(out.grade[1]) };
}

export function dexRows(o: DexOptions): DexRow[] {
  checkEffect(o.effect);
  if (!Number.isInteger(o.trials) || o.trials < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
  if (o.windowMinutes !== undefined && !(o.windowMinutes > 0)) throw new Error('효과 창 길이는 0보다 커야 합니다(분)');
  return spotsAt(o.margin).map(({ s, i }) => {
    const level = levelOf(s.id, o.margin), axis = axisOf(o.axis, s.id, level);
    const base = effectRates(s.id, level, axis, NO_EFFECT), now = effectRates(s.id, level, axis, o.effect);
    const run = (window?: DexWindow): DexTimes => dexTimes(base.rows, base.variantShare, base.catchesPerHour, o.trials, rng(o.seed + i), window);
    const rows = base.rows;
    return {
      spot: s.id, level, species: rows.length, epic: rows.filter(r => r.fish.rarity === 'epic').length, legendary: rows.filter(r => r.fish.rarity === 'legendary').length,
      base: run(),
      with: o.windowMinutes === undefined
        ? dexTimes(now.rows, now.variantShare, now.catchesPerHour, o.trials, rng(o.seed + i))
        : run({ minutes: o.windowMinutes, rows: now.rows, share: now.variantShare, catchesPerHour: now.catchesPerHour }),
    };
  });
}

// ── 3. 재료 공급 ──

export interface SupplyRow {
  spot: SpotId; level: number;
  /** 낚시 1시간에 분해로 모이는 등급별 재료 개수(물고기 한 마리가 재료 한 개) */
  counts: Record<RarityId, number>;
  /** 등급별 단위로 환산한 재료 점수와, 같은 시간 팔았을 때 골드 */
  score: number; gold: number;
  /** 효과를 넣은 점수와 골드 */
  scoreWith: number; goldWith: number;
}

export interface SupplyOptions {
  axis: FlowAxis; effect: Effect; margin: number;
  units: Record<RarityId, number>;
}

export function supplyRows(o: SupplyOptions): SupplyRow[] {
  checkEffect(o.effect);
  const scoreOf = (r: EffectRates) => RARITY_ORDER.reduce((s, g) => s + (r.rarity[g] ?? 0) * r.catchesPerHour * o.units[g], 0);
  return spotsAt(o.margin).map(({ s }) => {
    const level = levelOf(s.id, o.margin), axis = axisOf(o.axis, s.id, level);
    const base = effectRates(s.id, level, axis, NO_EFFECT), now = effectRates(s.id, level, axis, o.effect);
    const counts = Object.fromEntries(RARITY_ORDER.map(g => [g, (base.rarity[g] ?? 0) * base.catchesPerHour])) as Record<RarityId, number>;
    return {
      spot: s.id, level, counts, score: scoreOf(base), gold: base.goldPerHour,
      scoreWith: scoreOf(now), goldWith: now.goldPerHour,
    };
  });
}

// ── 4. 조기 진입 비교 ──

export interface EarlyRow {
  spot: SpotId; level: number;
  /** 효과 없음일 때 같은 레벨로 낚을 수 있는 가장 좋은 이전 해역, 그 해역 대비 비율 */
  alt: SpotId; ratioBase: number;
  /** 효과를 넣었을 때의 가장 좋은 이전 해역과 그 해역 대비 비율(두 해역 모두 효과를 넣은 시간당 골드) */
  altWith: SpotId; ratioWith: number;
}

export interface EarlyOptions { axis: FlowAxis; effect: Effect; margin: number }

/** 조기 진입 — 진입 레벨에 못 미치는 낚싯대(여유가 음수)로 같은 배로 열리는 해역에 들어갈 때, 같은 레벨로 낚을 수 있는 이전 해역과 견준다.
 *  효과를 넣은 값은 두 해역 모두에 효과를 걸고 그 값 중 가장 좋은 이전 해역과 비교한다 */
export function earlyRows(o: EarlyOptions): EarlyRow[] {
  checkEffect(o.effect);
  if (o.margin >= 0) return [];
  const out: EarlyRow[] = [];
  for (const { s, i } of spotsAt(o.margin)) {
    const level = levelOf(s.id, o.margin);
    const gold = (spot: SpotId, e: Effect) => effectRates(spot, level, axisOf(o.axis, spot, level), e).goldPerHour;
    const best = (e: Effect) => {
      let alt: SpotId | undefined, g = 0;
      for (const prev of SPOTS.slice(0, i)) {
        if (prev.boatTier !== s.boatTier || (prev.powerReq ?? 0) > powerOfLevel(level)) continue;
        const v = gold(prev.id, e);
        if (v > g) { alt = prev.id; g = v; }
      }
      return alt === undefined ? null : { alt, g };
    };
    const base = best(NO_EFFECT), now = best(o.effect);
    if (!base || !now) continue;
    out.push({
      spot: s.id, level, alt: base.alt, ratioBase: gold(s.id, NO_EFFECT) / base.g, altWith: now.alt, ratioWith: gold(s.id, o.effect) / now.g,
    });
  }
  return out;
}

export interface EffectsReport {
  effect: Effect; units: Record<RarityId, number>; margin: number; trials: number; seed: number;
  income: IncomeRow[]; dex: DexRow[]; supply: SupplyRow[]; early: EarlyRow[];
}
