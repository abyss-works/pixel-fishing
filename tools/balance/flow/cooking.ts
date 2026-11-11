// 요리 순환 지표 — 시간 제한 효과의 창(등급 미끼 30분), 레시피 순손익, 집 기운 얻기 공급.
// 제품 규칙(등급 가중치 효과 합산, 돌연변이 폼 가중치, 가방 용량, 내보낼 개체의 순서, 배 단계로 갈 수 있는 해역)과
// 요리 콘텐츠(레시피 표, 기운 수량, 효과 값, 슬롯 지속)는 불러 쓰고, 이 모듈은 값을 갖지 않는다.
import { COOKING_UNLOCK_BOAT, COOK_KIND_RULES, RECIPES as COOK_RECIPES } from '../../../src/game/content/cooking';
import type { Recipe as CookRecipe } from '../../../src/game/content/cooking';
import { FISH } from '../../../src/game/content/fish';
import type { FormId } from '../../../src/game/content/fish';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import type { RarityId } from '../../../src/game/content/rarity';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { energyDefaultExcluded, slotEffects, slotEndsAt } from '../../../src/game/rules/cooking';
import type { ActiveCookEffects } from '../../../src/game/rules/cooking';
import { canFishSpot, capOfBoat, compareBlandness, newState, priceOf } from '../../../src/game/rules/logic';
import type { FishInstance } from '../../../src/game/rules/logic';
import { NO_EFFECT, checkEffect, dexRows, effectRates, spotsAt, variantEv } from './effects';
import type { DexTimes, Effect } from './effects';
import { DAY_HOURS, axisOf } from './progress';
import type { FlowAxis, RatePlan } from './progress';
import { entryLevel, rates, rng } from '../model';
import type { Axis, Pool } from '../model';

const HOUR_MS = 3_600_000;

/** 미끼 슬롯의 지속(분) — 시간 제한 효과 창의 기본 길이 */
export const BAIT_WINDOW_MIN = COOK_KIND_RULES.bait.slotMs / 60_000;

/** 게임이 합산한 슬롯 효과를 도구의 효과 매개변수로 옮긴다. 등급 가중은 그 등급부터 전설까지 거는 효과만 옮긴다.
 *  판정 칸(영역 폭) 효과는 이 지표가 재지 않으므로 오류다 */
export function effectOf(e: ActiveCookEffects): Effect {
  if (e.judgeWidth !== 0) throw new Error('판정 칸 효과는 이 도구가 재지 않습니다');
  const out: Effect = { ...NO_EFFECT, bite: e.biteWaitCut, variant: e.mutationWeight, named: e.namedWeight };
  const grades = RARITY_ORDER.filter(g => e.rarityWeight[g] !== undefined);
  if (grades.length > 0) {
    const from = RARITY_ORDER.indexOf(grades[0]);
    const bonus = e.rarityWeight[grades[0]]!;
    const suffix = from >= 1 && grades.length === RARITY_ORDER.length - from && grades.every((g, k) => g === RARITY_ORDER[from + k] && e.rarityWeight[g] === bonus);
    if (!suffix) throw new Error(`등급 가중이 희귀, 영웅, 전설부터 전설까지의 범위가 아닙니다: ${grades.join(', ')}`);
    out[RARITY_ORDER[from] as 'rare' | 'epic' | 'legendary'] += bonus;
  }
  return out;
}

/** 요리 하나를 그 종류의 슬롯에 담았을 때 그 캐치에 걸리는 효과 — 게임의 슬롯 효과(slotEffects)를 그대로 불러 옮긴다.
 *  도시락은 방치 판정, 미끼 요리는 수동 판정에 걸린다 */
export function effectOfRecipe(r: CookRecipe): Effect {
  const now = '2026-01-01T00:00:00.000Z';
  const slots = { lunch: null, bait: null, [r.kind]: { id: r.id, endsAt: slotEndsAt(r, now) } };
  return effectOf(slotEffects({ slots }, now, r.kind === 'lunch' ? 'auto' : 'normal'));
}

/** 등급 미끼의 효과 — 요리 콘텐츠의 희귀, 영웅, 전설 등급 미끼 레시피에서 불러온다 */
export const BAIT_EFFECTS: Readonly<Record<'rare' | 'epic' | 'legendary', Effect>> = Object.fromEntries(
  (['rare', 'epic', 'legendary'] as const).map(g => {
    const r = COOK_RECIPES.find(x => x.id === `cook-bait-${g}`);
    if (!r) throw new Error(`등급 미끼 레시피가 없습니다: ${g}`);
    return [g, effectOfRecipe(r)];
  }),
) as Record<'rare' | 'epic' | 'legendary', Effect>;

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
export const LUNCH_HOURS = COOK_KIND_RULES.lunch.slotMs / HOUR_MS;

export interface Recipe {
  id: string;
  name: string;
  kind: 'lunch' | 'bait';
  /** 기운 요구(등급별 개수) */
  cost: Partial<Record<RarityId, number>>;
  effect: Effect;
  /** 효과 지속(시간)과 그 동안의 낚시 방식 — 도시락은 방치, 미끼 요리는 수동 */
  hours: number;
  axis: FlowAxis;
}

/** 요리 콘텐츠의 레시피를 도구의 레시피로 옮긴다. 지속은 종류별 슬롯 지속이다 */
export const recipeOf = (r: CookRecipe): Recipe => ({
  id: r.id, name: r.name, kind: r.kind, cost: { ...r.cost }, effect: effectOfRecipe(r),
  hours: COOK_KIND_RULES[r.kind].slotMs / HOUR_MS, axis: r.kind === 'lunch' ? 'idle' : 'manual',
});

/** 요리 콘텐츠의 레시피 중 이 도구가 효과를 재는 것. 판정 칸(영역 폭) 효과 레시피는 재지 않아 뺀다 */
export const RECIPES: readonly Recipe[] = COOK_RECIPES.filter(r => r.effects.judgeWidth === undefined).map(recipeOf);

/** 레시피 기운 수량 덮어쓰기 — 레시피 id별 등급별 개수. 덮어쓴 레시피의 요구를 통째로 바꾼다(적지 않은 등급은 0) */
export type CostOverrides = Readonly<Record<string, Partial<Record<RarityId, number>>>>;

/** 명령줄 `id=등급:개수,등급:개수` 한 덩어리를 읽는다. 등급은 common, rare, epic, legendary다 */
export function parseCostSpec(spec: string): { id: string; cost: Partial<Record<RarityId, number>> } {
  const usage = `--cost는 레시피id=등급:개수,등급:개수 형식이어야 합니다: ${spec}`;
  const eq = spec.indexOf('=');
  if (eq <= 0 || eq === spec.length - 1) throw new Error(usage);
  const cost: Partial<Record<RarityId, number>> = {};
  for (const part of spec.slice(eq + 1).split(',')) {
    const [grade, count, ...rest] = part.split(':');
    if (grade === undefined || count === undefined || rest.length > 0 || grade === '' || count.trim() === '') throw new Error(usage);
    if (!(RARITY_ORDER as readonly string[]).includes(grade)) throw new Error(`알 수 없는 등급입니다: ${grade} (${RARITY_ORDER.join(', ')} 중 하나)`);
    if (Object.hasOwn(cost, grade)) throw new Error(`--cost에 같은 등급이 두 번 있습니다: ${grade}`);
    if (!/^\d+$/.test(count)) throw new Error(usage);
    cost[grade as RarityId] = Number(count);
  }
  return { id: spec.slice(0, eq), cost };
}

/** 측정 입력만 바꿔 레시피의 기운 요구를 덮어쓴다. 콘텐츠 레시피는 바꾸지 않고 새 목록을 돌려준다 */
export function withCostOverrides(recipes: readonly Recipe[], overrides: CostOverrides): Recipe[] {
  for (const [id, cost] of Object.entries(overrides)) {
    if (!recipes.some(r => r.id === id)) throw new Error(`알 수 없는 레시피입니다: ${id} (${recipes.map(r => r.id).join(', ')} 중 하나)`);
    for (const [g, n] of Object.entries(cost)) {
      if (!(RARITY_ORDER as readonly string[]).includes(g)) throw new Error(`알 수 없는 등급입니다: ${g} (${RARITY_ORDER.join(', ')} 중 하나)`);
      if (!Number.isInteger(n) || (n as number) < 0) throw new Error(`기운 수량은 0 이상의 정수여야 합니다: ${id} ${g}:${n}`);
    }
    if (!Object.values(cost).some(n => (n as number) > 0)) throw new Error(`기운 수량이 모두 0입니다. 요구가 하나는 있어야 합니다: ${id}`);
  }
  return recipes.map(r => {
    const o = overrides[r.id];
    return o ? { ...r, cost: Object.fromEntries(RARITY_ORDER.filter(g => (o[g] ?? 0) > 0).map(g => [g, o[g]!])) } : r;
  });
}

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

// ── 집 기운 얻기 공급 ──

/** 가방의 개체 한 종류 — 어종과 폼. 폼은 일반과 돌연변이뿐이다. 내보내는 순서의 단위이고 크기는 순서의 마지막 기준이라 넣지 않는다 */
export interface Bucket { fishId: string; variant: boolean }

/** 내보내는 순서의 한 칸 — 어종, 폼과 그 개체의 등급, 판매가 */
export interface EvictSlot { fishId: string; grade: RarityId; variant: boolean; price: number }

const FORMS: readonly FormId[] = ['normal', 'variant'];

/** 내보내는 순서(가장 안 특별한 것이 먼저) — 어종마다 두 폼의 대표 개체를 게임의 개체 비교 함수로 줄 세운다 */
export function evictionOrder(): EvictSlot[] {
  const proto = (fishId: string, form: FormId): FishInstance => ({ uid: '', fishId, form, size: 0, caughtAt: null, spot: null, judgment: null, locked: false });
  return FISH.flatMap(f => FORMS.map(form => ({ f, form })))
    .sort((a, b) => compareBlandness(proto(a.f.id, a.form), proto(b.f.id, b.form)))
    .map(({ f, form }) => ({ fishId: f.id, grade: f.rarity, variant: form === 'variant', price: priceOf(f, form) }));
}

const ORDER = evictionOrder();
const slotKey = (fishId: string, variant: boolean) => `${fishId}:${variant ? 1 : 0}`;
const SLOT_OF = new Map(ORDER.map((s, i) => [slotKey(s.fishId, s.variant), i] as const));

export interface FillResult {
  /** 가방이 차서 놓아준 개체 수와 그 판매가 합, 가방에 남은 개체 수와 판매가 합 */
  released: Record<RarityId, number>; releasedGold: number;
  kept: Record<RarityId, number>; keptGold: number;
}

const zeroGrades = (): Record<RarityId, number> => ({ common: 0, rare: 0, epic: 0, legendary: 0 });

/** 낚은 순서대로 가방에 넣고, 상한을 넘기면 가장 안 특별한 개체를 놓아준다(새 개체도 후보다). 기운 얻기는 집에서만 하므로 놓아준 개체는 기운이 되지 않는다 */
export function fillBag(catches: Iterable<Bucket>, cap: number): FillResult {
  const count = new Array<number>(ORDER.length).fill(0);
  const released = zeroGrades();
  let releasedGold = 0, total = 0, low = ORDER.length;
  for (const c of catches) {
    const i = SLOT_OF.get(slotKey(c.fishId, c.variant));
    if (i === undefined) throw new Error(`알 수 없는 어종입니다: ${c.fishId}`);
    count[i]++; total++;
    if (i < low) low = i;
    if (total > cap) {
      while (count[low] === 0) low++;
      count[low]--; total--;
      released[ORDER[low].grade]++; releasedGold += ORDER[low].price;
    }
  }
  const kept = zeroGrades();
  let keptGold = 0;
  ORDER.forEach((s, i) => { kept[s.grade] += count[i]; keptGold += count[i] * s.price; });
  return { released, releasedGold, kept, keptGold };
}

/** 집에 들르는 간격의 하한(시간) */
export const MIN_VISIT_HOURS = 0.25;

export interface BagSupplyOptions {
  axis: FlowAxis; margin: number;
  /** 집 기운 얻기가 열리는 배 단계. 이 단계 이상의 배 단계마다 낸다. 기본은 요리 콘텐츠의 해금 배 단계 */
  unlockBoat?: number;
  /** 가방을 비운 채 판매 없이 낚는 시간(시간) */
  hours: number;
  trials: number; seed: number;
  /** 낚시 중 수동 낚시의 비율(0 이상 1 이하). 주면 axis 대신 방치와 수동을 이 비율로 섞는다. 생략하면 axis로만 낚는다 */
  manualShare?: number;
  /** 집에 들러 가방을 기운으로 바꾸고 비우는 간격(시간). 생략하면 낚는 시간 전체에 한 번 들른다 */
  visitHours?: number;
}

export interface BagSupplyRow {
  /** 플레이어의 배 단계 — 가방 용량과 기본 선택이 이 단계로 정해진다 */
  boat: number;
  spot: SpotId; level: number;
  /** 가방 용량과 그 시간 동안 낚은 개체 수 */
  cap: number; catches: number;
  /** 이 해역이 그 배 단계의 가장 앞선 두 해역이라 기본 선택에서 빠지는가 */
  frontmost: boolean;
  /** 시도 평균 — 가방에 남은 개체 수와 판매가 합, 가방이 차서 놓아준 개체 수와 판매가 합 */
  kept: Record<RarityId, number>; keptGold: number;
  released: Record<RarityId, number>; releasedGold: number;
  /** 가방에 남은 개체 가운데 해역 기본 선택대로 기운으로 바꾼 등급별 개수와 그 개체의 판매가 합. 가장 앞선 두 해역이면 모두 0이다 */
  energy: Record<RarityId, number>; energyGold: number;
}

/** 집 기운 얻기가 열린 배 단계마다, 그 배로 갈 수 있는 해역에서 가방을 비운 채 판매 없이 hours시간 낚은 뒤 집에서 해역 기본 선택대로 기운으로 바꾼 등급별 개수를 낸다.
 *  캐치마다 어종과 폼을 뽑는 몬테카를로이고 시드가 같으면 같다. 가방 용량은 그 배 단계의 용량이고, 낚싯대는 그 해역의 진입 레벨(에 여유를 더한 값)이다.
 *  방문 간격마다 가방을 비우므로 한 구간이 가방 용량을 넘을 때만 개체를 놓아주고, 구간별 결과를 더한다 */
export function bagSupplyRows(o: BagSupplyOptions): BagSupplyRow[] {
  if (!(o.hours > 0)) throw new Error('낚는 시간은 0보다 커야 합니다(시간)');
  if (!Number.isInteger(o.trials) || o.trials < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
  if (o.manualShare !== undefined && !(o.manualShare >= 0 && o.manualShare <= 1)) throw new Error('수동 비율은 0 이상 1 이하여야 합니다');
  if (o.visitHours !== undefined && !(o.visitHours >= MIN_VISIT_HOURS)) throw new Error(`방문 간격은 ${MIN_VISIT_HOURS}시간 이상이어야 합니다`);
  const unlock = o.unlockBoat ?? COOKING_UNLOCK_BOAT;
  const stages = [...new Set(SPOTS.map(s => s.boatTier))].filter(b => b >= unlock).sort((a, b) => a - b);
  const visit = Math.min(o.visitHours ?? o.hours, o.hours);
  const segments: number[] = [];
  for (let left = o.hours; left > 1e-9; left -= visit) segments.push(Math.min(visit, left));
  const modes: { axis: FlowAxis; share: number }[] = o.manualShare === undefined
    ? [{ axis: o.axis, share: 1 }]
    : [{ axis: 'idle' as const, share: 1 - o.manualShare }, { axis: 'manual' as const, share: o.manualShare }].filter(m => m.share > 0);
  return stages.flatMap(boat => {
    const state = { ...newState(), boat }, front = new Set<SpotId>(energyDefaultExcluded(boat));
    return spotsAt(o.margin).filter(({ s }) => canFishSpot(state, s.id)).map(({ s, i }) => {
      const level = entryLevel(s.id) + o.margin;
      const sources = modes.map(m => {
        const r = effectRates(s.id, level, axisOf(m.axis, s.id, level), NO_EFFECT);
        let total = 0;
        const cum = r.rows.map(row => (total += row.prob));
        return { r, share: m.share, cum, total };
      });
      const cap = capOfBoat(boat);
      // 반올림은 누적 기대값에 한 번만 하고 구간별 수는 그 차이로 정해 구간이 많아도 오차가 쌓이지 않는다
      let elapsed = 0;
      const upTo = (src: (typeof sources)[number], hours: number) => Math.round(src.r.catchesPerHour * hours * src.share);
      const counts = segments.map(seg => {
        const from = elapsed;
        elapsed += seg;
        return sources.map(src => upTo(src, elapsed) - upTo(src, from));
      });
      const n = counts.reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0);
      const rand = rng(o.seed + i);
      const kept = zeroGrades(), released = zeroGrades();
      let keptGold = 0, releasedGold = 0;
      function* draw(segment: number[]): Generator<Bucket> {
        for (let m = 0; m < sources.length; m++) {
          const { r, total, cum } = sources[m];
          for (let k = 0; k < segment[m]; k++) {
            const x = rand() * total;
            let lo = 0, hi = cum.length - 1;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cum[mid]) hi = mid; else lo = mid + 1; }
            yield { fishId: r.rows[lo].fish.id, variant: rand() < r.variantShare };
          }
        }
      }
      for (let t = 0; t < o.trials; t++) {
        for (const segment of counts) {
          const f = fillBag(draw(segment), cap);
          for (const g of RARITY_ORDER) { kept[g] += f.kept[g] / o.trials; released[g] += f.released[g] / o.trials; }
          keptGold += f.keptGold / o.trials; releasedGold += f.releasedGold / o.trials;
        }
      }
      const frontmost = front.has(s.id);
      return {
        boat, spot: s.id, level, cap, catches: n, frontmost, kept, keptGold, released, releasedGold,
        energy: frontmost ? zeroGrades() : { ...kept }, energyGold: frontmost ? 0 : keptGold,
      };
    });
  });
}

/** 기운으로 레시피를 몇 개 만들 수 있는가 — 필요한 등급 중 가장 모자란 등급이 정한다. 요구가 없으면 무한대 */
export function recipesCovered(supply: Record<RarityId, number>, recipe: Recipe): number {
  return RARITY_ORDER.reduce((m, g) => ((recipe.cost[g] ?? 0) > 0 ? Math.min(m, supply[g] / recipe.cost[g]!) : m), Number.POSITIVE_INFINITY);
}

// ── 효과 계획 ──

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
  const fromBoat = o.fromBoat ?? COOKING_UNLOCK_BOAT;
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
