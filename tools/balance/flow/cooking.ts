// 요리 순환 지표 — 시간 제한 효과의 창(구매 미끼 30분), 레시피 순손익, 가방 한도와 자동 기운 얻기를 넣은 기운 공급.
// 제품 규칙(등급 가중치 효과 합산, 돌연변이 폼 가중치, 가방 용량, 내보낼 개체의 순서)은 불러 쓰고, 이 모듈이 갖는 값은 요리 설계 초안의 레시피와 미끼 수치뿐이다.
// 설계 초안 값은 확정이 아니며, 명세가 바뀌면 이 표를 맞춘다.
import type { SpotId } from '../../../src/game/content/spots';
import { FISH } from '../../../src/game/content/fish';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import type { RarityId } from '../../../src/game/content/rarity';
import { VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { capOfBoat, compareBlandness } from '../../../src/game/rules/logic';
import type { FishInstance } from '../../../src/game/rules/logic';
import { NO_EFFECT, checkEffect, dexRows, effectRates, spotsAt, variantEv } from './effects';
import type { DexTimes, Effect } from './effects';
import { DAY_HOURS, axisOf } from './progress';
import type { FlowAxis, RatePlan } from './progress';
import { entryLevel, rates, rng, spotOf } from '../model';
import type { Axis, Pool } from '../model';

/** 미끼 슬롯의 지속(분) — 시간 제한 효과 창의 기본 길이 */
export const BAIT_WINDOW_MIN = 30;

/** 구매 미끼의 효과(설계 초안). 희귀 미끼는 희귀 이상, 영웅 미끼는 영웅 이상, 전설 미끼는 전설 등급 가중치에 걸린다 */
export const BAIT_EFFECTS = {
  rare: { ...NO_EFFECT, rare: 0.2 },
  epic: { ...NO_EFFECT, epic: 0.4 },
  legendary: { ...NO_EFFECT, legendary: 0.6 },
} as const satisfies Record<string, Effect>;

export type BaitName = keyof typeof BAIT_EFFECTS;

export function baitEffect(name: string): Effect {
  if (!(name in BAIT_EFFECTS)) throw new Error(`알 수 없는 미끼입니다: ${name} (${Object.keys(BAIT_EFFECTS).join(', ')} 중 하나)`);
  return { ...BAIT_EFFECTS[name as BaitName] };
}

// ── 시간 제한 효과의 창 ──

export interface WindowOptions {
  axis: FlowAxis; effect: Effect; margin: number;
  /** 창 길이(분) */
  minutes: number;
  trials: number; seed: number;
}

export interface WindowRow {
  spot: SpotId; level: number;
  /** 창 안의 등급별 기대 캐치 수(효과 없음, 효과)와 전체 캐치 수 */
  catches: Record<RarityId, { base: number; with: number }>;
  totalBase: number; totalWith: number;
  /** 창 안의 기대 골드와 명성 증가 */
  goldGain: number; fameGain: number;
  /** 창 하나를 쓰고 이후 효과 없이 낚는 도감 완성 시간(시간)의 몬테카를로. with가 창을 쓴 쪽이다 */
  dex: { base: DexTimes; with: DexTimes };
  /** 창 하나가 줄이는 도감 완성 평균 시간(시간). 평균이 없으면(끝내지 못한 시도) null */
  saved: { noLegend: number | null; all: number | null; variant: number | null; epic: number | null; legendary: number | null };
  species: number; epicSpecies: number; legendarySpecies: number;
}

const savedOf = (base: { mean: number | null } | null, now: { mean: number | null } | null): number | null =>
  base?.mean != null && now?.mean != null ? base.mean - now.mean : null;

/** 창 하나의 효과 — 창 안의 등급별 기대 캐치 수와 골드, 명성 증가, 창 하나가 도감 완성 시간을 줄이는 양 */
export function windowRows(o: WindowOptions): WindowRow[] {
  checkEffect(o.effect);
  if (!(o.minutes > 0)) throw new Error('효과 창 길이는 0보다 커야 합니다(분)');
  if (!Number.isInteger(o.trials) || o.trials < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
  const hours = o.minutes / 60;
  const dex = dexRows({ axis: o.axis, effect: o.effect, margin: o.margin, trials: o.trials, seed: o.seed, windowMinutes: o.minutes });
  return spotsAt(o.margin).map(({ s }, k) => {
    const level = entryLevel(s.id) + o.margin, axis = axisOf(o.axis, s.id, level);
    const base = effectRates(s.id, level, axis, NO_EFFECT), now = effectRates(s.id, level, axis, o.effect);
    const d = dex[k];
    return {
      spot: s.id, level,
      catches: Object.fromEntries(RARITY_ORDER.map(g => [g, {
        base: (base.rarity[g] ?? 0) * base.catchesPerHour * hours, with: (now.rarity[g] ?? 0) * now.catchesPerHour * hours,
      }])) as WindowRow['catches'],
      totalBase: base.catchesPerHour * hours, totalWith: now.catchesPerHour * hours,
      goldGain: (now.goldPerHour - base.goldPerHour) * hours, fameGain: (now.famePerHour - base.famePerHour) * hours,
      dex: { base: d.base, with: d.with },
      saved: {
        noLegend: savedOf(d.base.noLegend, d.with.noLegend), all: savedOf(d.base.all, d.with.all), variant: savedOf(d.base.variant, d.with.variant),
        epic: savedOf(d.base.epic, d.with.epic), legendary: savedOf(d.base.legendary, d.with.legendary),
      },
      species: d.species, epicSpecies: d.epic, legendarySpecies: d.legendary,
    };
  });
}

// ── 레시피 순손익 ──

/** 도시락 슬롯의 지속(시간) */
export const LUNCH_HOURS = 9;

export interface Recipe {
  id: string;
  /** 가칭이다. 최종 이름은 따로 정한다 */
  name: string;
  kind: 'lunch' | 'bait';
  /** 기운 요구(등급별 개수) */
  cost: Partial<Record<RarityId, number>>;
  effect: Effect;
  /** 효과 지속(시간)과 그 동안의 낚시 방식 — 도시락은 방치, 미끼 요리는 수동 */
  hours: number;
  axis: FlowAxis;
}

const lunch = (id: string, name: string, cost: Recipe['cost'], effect: Partial<Effect>): Recipe =>
  ({ id, name, kind: 'lunch', cost, effect: { ...NO_EFFECT, ...effect }, hours: LUNCH_HOURS, axis: 'idle' });
const baitFood = (id: string, name: string, cost: Recipe['cost'], effect: Partial<Effect>): Recipe =>
  ({ id, name, kind: 'bait', cost, effect: { ...NO_EFFECT, ...effect }, hours: BAIT_WINDOW_MIN / 60, axis: 'manual' });

/** 요리 설계 초안의 레시피 중 효과 값이 정해진 것. 판정 칸 미끼는 값이 정해지지 않아 넣지 않는다 */
export const RECIPES: readonly Recipe[] = [
  lunch('quick', '재촉 도시락', { common: 200 }, { bite: 0.1 }),
  lunch('shimmer', '윤슬 도시락', { common: 100, rare: 20 }, { rare: 0.1 }),
  lunch('mutant', '아롱 도시락', { rare: 20, epic: 4 }, { variant: 0.5 }),
  lunch('trace', '흔적 도시락', { epic: 8 }, { named: 0.5 }),
  lunch('mixed', '모둠 도시락', { common: 50, rare: 5, epic: 1, legendary: 1 }, { bite: 0.05, rare: 0.05 }),
  baitFood('mutantBait', '아롱 미끼', { epic: 4, legendary: 2 }, { variant: 1 }),
];

export interface RecipeRow {
  recipe: string;
  spot: SpotId; level: number;
  /** 그 해역 낚시로만 재료를 모을 때 걸리는 실질 낚시 시간(시간). 필요한 등급이 나오지 않으면 null */
  collectHours: number | null;
  /** 재료로 쓴 물고기를 팔았다면 얻었을 골드 */
  loss: number;
  /** 효과 지속 동안 효과 없음 대비 늘어나는 골드와 명성 */
  gain: number; gainFame: number;
  /** 수입 증가 - 판매 손실, 수입 증가 ÷ 판매 손실. 재료를 모을 수 없으면 null */
  net: number | null; ratio: number | null;
}

export interface MaterialLoss {
  /** 재료로 쓴 물고기를 팔았다면 얻었을 골드 */
  loss: number;
  /** 그 해역 낚시로만 모을 때 걸리는 실질 낚시 시간(시간) */
  collect: number;
  /** 필요한 등급이 모두 나오는가 */
  feasible: boolean;
}

/** 한 해역, 한 레벨에서 레시피 재료를 그 해역 낚시로만 모을 때의 판매 손실과 모으는 시간.
 *  손실은 등급별 필요 개수 x 그 등급의 평균 판매가(돌연변이 기댓값 포함)이고, 시간은 필요한 등급 중 가장 느리게 모이는 등급이 정한다 */
export function materialLoss(recipe: Recipe, spot: SpotId, level: number, axis: FlowAxis): MaterialLoss {
  const gather = effectRates(spot, level, axisOf(axis, spot, level), NO_EFFECT);
  let loss = 0, collect = 0, feasible = true;
  for (const g of RARITY_ORDER) {
    const need = recipe.cost[g] ?? 0;
    if (need === 0) continue;
    const rows = gather.rows.filter(r => r.fish.rarity === g);
    const share = rows.reduce((a, r) => a + r.prob, 0);
    if (share === 0) { feasible = false; continue; }
    loss += need * rows.reduce((a, r) => a + r.prob * r.fish.price, 0) / share * variantEv(gather.variantShare);
    collect = Math.max(collect, need / (share * gather.catchesPerHour));
  }
  return { loss, collect, feasible };
}

export interface RecipeOptions {
  /** 재료를 모으는 낚시 방식 */
  axis: FlowAxis; margin: number;
  /** 생략하면 모든 레시피 */
  recipes?: readonly Recipe[];
}

/** 레시피 순손익 — 재료로 쓴 물고기의 판매 손실과 효과 지속 동안의 수입 증가를 견준다.
 *  손실은 등급별 필요 개수 x 그 등급의 평균 판매가(돌연변이 기댓값 포함)이고, 재료는 그 해역에서만 모은다. 가방 한도는 넣지 않는다 */
export function recipeRows(o: RecipeOptions): RecipeRow[] {
  const recipes = o.recipes ?? RECIPES;
  for (const r of recipes) checkEffect(r.effect);
  return recipes.flatMap(recipe => spotsAt(o.margin).map(({ s }) => {
    const level = entryLevel(s.id) + o.margin;
    const { loss, collect, feasible } = materialLoss(recipe, s.id, level, o.axis);
    const useAxis = axisOf(recipe.axis, s.id, level);
    const use = effectRates(s.id, level, useAxis, NO_EFFECT), now = effectRates(s.id, level, useAxis, recipe.effect);
    const gain = (now.goldPerHour - use.goldPerHour) * recipe.hours;
    return {
      recipe: recipe.id, spot: s.id, level, collectHours: feasible ? collect : null, loss, gain, gainFame: (now.famePerHour - use.famePerHour) * recipe.hours,
      net: feasible ? gain - loss : null, ratio: feasible && loss > 0 ? gain / loss : null,
    };
  }));
}

// ── 가방 한도와 자동 기운 얻기를 넣은 기운 공급 ──

/** 가방의 개체 한 칸 — 등급과 돌연변이 여부, 판매가. 내보내는 순서는 이 둘로 정해진다(크기는 순서의 마지막 기준이라 넣지 않는다) */
export interface Bucket { grade: RarityId; variant: boolean; price: number }

/** 내보내는 순서(가장 안 특별한 것이 먼저) — 개체 비교 함수를 그대로 불러, 등급마다 일반 폼과 돌연변이 폼의 대표 개체를 줄 세운다 */
export function evictionRanks(): { grade: RarityId; variant: boolean }[] {
  const proto = (grade: RarityId, variant: boolean): FishInstance => ({
    uid: '', fishId: FISH.find(f => f.rarity === grade)!.id, form: variant ? 'variant' : 'normal', size: 0, caughtAt: null, spot: null, judgment: null, locked: false,
  });
  const all = RARITY_ORDER.flatMap(grade => [false, true].map(variant => ({ grade, variant })));
  return all.sort((a, b) => compareBlandness(proto(a.grade, a.variant), proto(b.grade, b.variant)));
}

export interface FillResult {
  /** 가방이 차서 기운이 된 개체 수와 그 판매가 합, 가방에 남은 개체 수와 판매가 합 */
  auto: Record<RarityId, number>; autoGold: number;
  kept: Record<RarityId, number>; keptGold: number;
}

const zeroGrades = (): Record<RarityId, number> => ({ common: 0, rare: 0, epic: 0, legendary: 0 });

/** 낚은 순서대로 가방에 넣고, 상한을 넘기면 가장 안 특별한 개체를 기운으로 바꾼다(새 개체도 후보다). 같은 칸의 판매가는 평균으로 센다 */
export function fillBag(catches: Iterable<Bucket>, cap: number): FillResult {
  const ranks = evictionRanks();
  const slot = new Array<number>(RARITY_ORDER.length * 2);
  ranks.forEach((r, i) => { slot[RARITY_ORDER.indexOf(r.grade) * 2 + (r.variant ? 1 : 0)] = i; });
  const count = new Array<number>(ranks.length).fill(0), sum = new Array<number>(ranks.length).fill(0);
  const auto = zeroGrades();
  let autoGold = 0, total = 0;
  for (const c of catches) {
    const i = slot[RARITY_ORDER.indexOf(c.grade) * 2 + (c.variant ? 1 : 0)];
    count[i]++; sum[i] += c.price; total++;
    if (total > cap) {
      const v = count.findIndex(n => n > 0);
      const mean = sum[v] / count[v];
      count[v]--; sum[v] -= mean; total--;
      auto[ranks[v].grade]++; autoGold += mean;
    }
  }
  const kept = zeroGrades();
  ranks.forEach((r, i) => { kept[r.grade] += count[i]; });
  return { auto, autoGold, kept, keptGold: sum.reduce((a, b) => a + b, 0) };
}

export interface BagSupplyOptions {
  axis: FlowAxis; margin: number;
  /** 가방을 비운 채 판매 없이 낚는 시간(시간) */
  hours: number;
  trials: number; seed: number;
}

export interface BagSupplyRow {
  spot: SpotId; level: number;
  /** 배 단계의 가방 용량과 그 시간 동안 낚은 개체 수 */
  cap: number; catches: number;
  /** 시도 평균 — 자동으로 기운이 된 개체 수와 판매가 합, 가방에 남은 개체 수와 판매가 합 */
  auto: Record<RarityId, number>; autoGold: number;
  kept: Record<RarityId, number>; keptGold: number;
}

/** 해역마다 가방을 비운 채 판매 없이 hours시간 낚을 때 자동 기운 얻기로 모이는 등급별 기운과 가방에 남는 개체를 낸다. 캐치마다 어종과 폼을 뽑는 몬테카를로이고 시드가 같으면 같다 */
export function bagSupplyRows(o: BagSupplyOptions): BagSupplyRow[] {
  if (!(o.hours > 0)) throw new Error('낚는 시간은 0보다 커야 합니다(시간)');
  if (!Number.isInteger(o.trials) || o.trials < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
  return spotsAt(o.margin).map(({ s, i }) => {
    const level = entryLevel(s.id) + o.margin;
    const r = effectRates(s.id, level, axisOf(o.axis, s.id, level), NO_EFFECT);
    const cap = capOfBoat(s.boatTier), n = Math.round(r.catchesPerHour * o.hours);
    let total = 0;
    const cum = r.rows.map(row => (total += row.prob));
    const rand = rng(o.seed + i);
    const auto = zeroGrades(), kept = zeroGrades();
    let autoGold = 0, keptGold = 0;
    function* draw(): Generator<Bucket> {
      for (let k = 0; k < n; k++) {
        const x = rand() * total;
        let lo = 0, hi = cum.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cum[mid]) hi = mid; else lo = mid + 1; }
        const fish = r.rows[lo].fish, variant = rand() < r.variantShare;
        yield { grade: fish.rarity, variant, price: fish.price * (variant ? VARIANT_PRICE_MULT : 1) };
      }
    }
    for (let t = 0; t < o.trials; t++) {
      const f = fillBag(draw(), cap);
      for (const g of RARITY_ORDER) { auto[g] += f.auto[g] / o.trials; kept[g] += f.kept[g] / o.trials; }
      autoGold += f.autoGold / o.trials; keptGold += f.keptGold / o.trials;
    }
    return { spot: s.id, level, cap, catches: n, auto, autoGold, kept, keptGold };
  });
}

/** 기운으로 레시피를 몇 개 만들 수 있는가 — 필요한 등급 중 가장 모자란 등급이 정한다. 요구가 없으면 무한대 */
export function recipesCovered(supply: Record<RarityId, number>, recipe: Recipe): number {
  return RARITY_ORDER.reduce((m, g) => ((recipe.cost[g] ?? 0) > 0 ? Math.min(m, supply[g] / recipe.cost[g]!) : m), Number.POSITIVE_INFINITY);
}

// ── 효과 계획 ──

/** 효과가 걸리기 시작하는 배 단계의 기본값 — 인도양을 여는 배(증기선) */
export const DEFAULT_FROM_BOAT = spotOf('indian').boatTier;

export interface PlanOptions {
  effect: Effect;
  /** 이 배 단계 이상일 때만 효과가 걸린다. 기본은 인도양을 여는 배 */
  fromBoat?: number;
  /** 주면 하루(실질 낚시 8시간)에 한 번 이 레시피를 만든다고 보고 재료의 판매 손실을 시간당 비용으로 센다.
   *  그 해역에서 재료가 나오지 않으면 만들 수 없어 효과도 비용도 없다 */
  recipe?: Recipe;
}

/** 진행 시뮬레이션에 넣는 효과 계획 — 시작 배 단계 이후에 효과를 걸고, 레시피를 주면 재료 판매 손실을 비용으로 넣는다 */
export function effectPlan(o: PlanOptions): RatePlan {
  checkEffect(o.effect);
  const fromBoat = o.fromBoat ?? DEFAULT_FROM_BOAT;
  const costs = new Map<string, MaterialLoss>();
  const loss = (spot: SpotId, level: number): MaterialLoss => {
    const key = `${spot}:${level}`;
    let m = costs.get(key);
    if (!m) { m = materialLoss(o.recipe!, spot, level, 'idle'); costs.set(key, m); }
    return m;
  };
  const active = (spot: SpotId, level: number, boat: number) => boat >= fromBoat && (!o.recipe || loss(spot, level).feasible);
  return {
    rateFor: (spot: SpotId, level: number, axis: Axis, boat: number, pool: Pool = 'mixed') =>
      active(spot, level, boat) ? effectRates(spot, level, axis, o.effect, pool) : rates(spot, level, axis, {}, pool),
    costPerHour: (spot, level, _axis, boat) => (o.recipe && active(spot, level, boat) ? loss(spot, level).loss / DAY_HOURS : 0),
  };
}
