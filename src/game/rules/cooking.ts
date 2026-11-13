// 요리 규칙 — 해금, 기운 얻기, 조리와 보관함, 먹기, 슬롯 효과의 적용 범위를 판정하는 순수 함수.
// 매개변수(수량, 대기, 지속, 효과 값)는 콘텐츠 표에서 읽고 여기서 다시 적지 않는다.
// 호출부(리듀서, 서버, 화면)는 이 모듈이 돌려준 판정과 값을 쓴다 — 규칙을 다시 조립하지 않는다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import {
  AUTO_ENERGY_BOAT, COOK_KIND_RULES, COOK_STORAGE_CAP, COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL, RECIPES, recipeById, recipeCostStored,
} from '../content/cooking.js';
import type { Recipe } from '../content/cooking.js';
import { RARITY_ORDER } from '../content/rarity.js';
import type { RarityId } from '../content/rarity.js';
import { SALE_BASES } from '../content/places.js';
import { SPOTS } from '../content/spots.js';
import type { SpotId } from '../content/spots.js';
import { addItem, instanceFish, release } from './logic.js';
import type { GameState, Judgment } from './logic.js';
import type { RejectReason, RuleCheck } from './rules.js';

const OK: RuleCheck = { ok: true };
const no = (reason: RejectReason): RuleCheck => ({ ok: false, reason });

/** 부동소수 오차를 걷어 낸다 — 0.05 + 0.05가 0.1에서 어긋나지 않게 한다 */
const clean = (x: number): number => Math.round(x * 1e9) / 1e9;

// ---------- 해금 ----------

/** 요리(기운 얻기, 부엌, 두 슬롯)가 열렸는가 — 배 단계에서 파생하며 저장하지 않는다 */
export const cookingUnlocked = (boat: number): boolean => boat >= COOKING_UNLOCK_BOAT;

/** 요리를 쓸 수 있는가 — 위치를 보지 않는 동작(덮어쓰기, 먹기)의 해금 판정 */
export function canUseCooking(state: Pick<GameState, 'boat'>): RuleCheck {
  return cookingUnlocked(state.boat) ? OK : no('cooking-locked');
}

const isAtHome = (state: Pick<GameState, 'location'>): boolean =>
  state.location.kind === 'base' && state.location.id === 'home';

/** 판매 시설이 있는 거점(집, 항구)에 있는가 — 거점 데이터의 표로 판정한다. 모르는 거점은 아니다 */
const isAtSaleBase = (state: Pick<GameState, 'location'>): boolean =>
  state.location.kind === 'base' && Object.hasOwn(SALE_BASES, state.location.id) && SALE_BASES[state.location.id];

// ---------- 기운 얻기 ----------

/** 기운 얻기 기본 선택에서 빠지는 해역 — 배 단계로 갈 수 있는 해역 중 해역 순서로 가장 앞선 해역 하나 */
export function energyDefaultExcluded(boat: number): SpotId[] {
  return SPOTS.filter(s => s.boatTier <= boat).slice(-1).map(s => s.id);
}

/** 그 해역의 기본 선택 — 제외 해역만 꺼짐 */
const energyDefaultOf = (boat: number, spot: string): boolean =>
  !(energyDefaultExcluded(boat) as string[]).includes(spot);

/** 그 해역의 기운 대상 여부 — 덮어쓴 값이 있으면 그 값, 없으면 기본값(제외 해역만 꺼짐) */
export function energyTargetOf(state: Pick<GameState, 'boat' | 'energyTargets'>, spot: string): boolean {
  const override = Object.hasOwn(state.energyTargets, spot) ? state.energyTargets[spot] : undefined;
  if (typeof override === 'boolean') return override;
  return energyDefaultOf(state.boat, spot);
}

export interface EnergyTargetRow {
  spot: SpotId;
  /** 지금 기운 대상인가 */
  on: boolean;
  /** 지금 값이 기본값과 같은가 */
  isDefault: boolean;
  /** 플레이어가 고른 값(덮어쓰기)이 저장돼 있는가 */
  overridden: boolean;
}

/** 기운 얻기 해역 선택 목록 — 배 단계로 갈 수 있는 해역을 해역 순서로. 켜짐과 기본값 여부의 단일 정의다 */
export function energyTargetRows(state: Pick<GameState, 'boat' | 'energyTargets'>): EnergyTargetRow[] {
  return SPOTS.filter(s => s.boatTier <= state.boat).map(s => {
    const on = energyTargetOf(state, s.id);
    return {
      spot: s.id, on, isDefault: on === energyDefaultOf(state.boat, s.id),
      overridden: typeof state.energyTargets[s.id] === 'boolean' && Object.hasOwn(state.energyTargets, s.id),
    };
  });
}

/** 기운 얻기 계열(대상 고르기 포함)의 해금 판정 — 해금 거부 사유만 기운 얻기용이다 */
export function canUseEnergy(state: Pick<GameState, 'boat'>): RuleCheck {
  return cookingUnlocked(state.boat) ? OK : no('energy-locked');
}

/** 기운 얻기 판정 — 판매 시설이 있는 거점(집, 항구)에서, 해금된 뒤에만 한다 */
export function canExtractEnergy(state: Pick<GameState, 'boat' | 'location'>): RuleCheck {
  if (!isAtSaleBase(state)) return no('not-at-sale-base');
  return canUseEnergy(state);
}

export interface EnergyGain {
  /** 기운이 되는 개체의 uid — 가방에 있고 잠기지 않았으며 콘텐츠에 있는 어종인 것만, 중복 없이 */
  uids: string[];
  /** 등급별로 얻는 기운(저장 단위). 등급은 개체의 어종 등급에서 정한다 */
  byGrade: Record<RarityId, number>;
}

/** 개체 n마리에서 얻는 기운(저장 단위) — 개체 하나의 산출을 한 곳에서 정한다 */
export const energyYield = (individuals: number): number => individuals * ENERGY_PER_INDIVIDUAL;

/** 지목한 개체에서 얻는 기운 — 개체 하나에서 그 등급 기운 화면 단위 1(energyYield). 어종, 크기, 폼은 산출에 영향을 주지 않는다 */
export function energyGain(state: Pick<GameState, 'bag'>, uids: readonly string[]): EnergyGain {
  const bag = new Map(state.bag.map(i => [i.uid, i]));
  const byGrade = Object.fromEntries(RARITY_ORDER.map(r => [r, 0])) as Record<RarityId, number>;
  const taken: string[] = [];
  for (const uid of new Set(uids)) {
    const inst = bag.get(uid);
    const fish = inst ? instanceFish(inst) : undefined;
    if (!inst || inst.locked || !fish) continue;
    byGrade[fish.rarity] += energyYield(1);
    taken.push(uid);
  }
  return { uids: taken, byGrade };
}

/** 기운 얻기 적용 — 개체를 가방에서 지우고 등급별 기운을 쌓는다 */
export function applyEnergyGain(state: GameState, gain: EnergyGain): GameState {
  let next = release(state, gain.uids);
  for (const r of RARITY_ORDER) next = addItem(next, ENERGY_ITEM_IDS[r], gain.byGrade[r]);
  return next;
}

export interface OverflowPlan {
  /** 놓아줄 개체의 uid */
  released: string[];
  /** 기운으로 바꿀 개체와 얻는 기운 - 양은 기운 얻기(energyGain)와 같다 */
  gain: EnergyGain;
}

/** 가방이 차서 내보낼 개체를 놓아줄 것과 기운으로 바꿀 것으로 나눈다.
 *  가공 플랜트선을 가진 계정(게스트 제외)은 개체의 서식 해역이 지금 기운 대상이면 기운을 얻고, 아니면 놓아준다.
 *  내보낼 개체는 가방 상한 규칙이 이미 골랐으므로 여기서 다른 개체로 바꾸지 않는다.
 *  state.bag에는 내보낼 개체가 들어 있어야 한다 */
export function planOverflow(
  state: Pick<GameState, 'boat' | 'energyTargets' | 'bag'>, uids: readonly string[], guest: boolean,
): OverflowPlan {
  if (guest || state.boat < AUTO_ENERGY_BOAT) return { released: [...uids], gain: energyGain(state, []) };
  const bag = new Map(state.bag.map(i => [i.uid, i]));
  const extractable = uids.filter(uid => {
    const inst = bag.get(uid);
    const fish = inst ? instanceFish(inst) : undefined;
    return fish !== undefined && energyTargetOf(state, fish.spot);
  });
  const gain = energyGain(state, extractable);
  const taken = new Set(gain.uids);
  return { released: uids.filter(uid => !taken.has(uid)), gain };
}

// ---------- 조리 ----------

/** 조리 진행 — 완성 수는 시작 시각과 서버 시각에서 파생한다 */
export interface CookingProgress {
  recipe: Recipe;
  /** 넣은 수량 */
  count: number;
  /** 대기를 마친 수량(넣은 수량을 넘지 않는다) */
  completed: number;
  /** 보관함에 들어갈 완성품 수 — 대기를 마친 수량에 그 수량의 추가 완성분을 더한 값 */
  ready: number;
  /** 아직 완성되지 않은 수량 */
  pending: number;
  /** 다음 완성 시각(UTC ISO). 모두 완성됐으면 null */
  nextAt: string | null;
  /** 넣은 수량이 모두 완성되는 시각(UTC ISO) */
  finishAt: string;
}

const iso = (ms: number): string => new Date(ms).toISOString();

export function cookingProgress(state: Pick<GameState, 'cooking'>, now: string): CookingProgress | null {
  const c = state.cooking;
  const recipe = c ? recipeById(c.recipe) : undefined;
  if (!c || !recipe) return null;
  const waitMs = COOK_KIND_RULES[recipe.kind].waitMs;
  const start = Date.parse(c.startedAt);
  const elapsed = Math.max(0, Date.parse(now) - start);
  const completed = Math.min(c.count, Number.isFinite(elapsed) ? Math.floor(elapsed / waitMs) : 0);
  const extra = c.bonus.slice(0, completed).filter(Boolean).length;
  return {
    recipe, count: c.count, completed, ready: completed + extra, pending: c.count - completed,
    nextAt: completed < c.count ? iso(start + (completed + 1) * waitMs) : null,
    finishAt: iso(start + c.count * waitMs),
  };
}

/** 완성품을 보관함(items)으로 옮기고 남은 조리의 시작 시각을 이어 붙인다. 완성된 것이 없으면 같은 상태를 돌려준다 */
export function settleCooking(state: GameState, now: string): GameState {
  const p = cookingProgress(state, now);
  const c = state.cooking;
  if (!p || !c || p.completed === 0) return state;
  const stored = addItem(state, p.recipe.id, p.ready);
  if (p.pending === 0) return { ...stored, cooking: null };
  const waitMs = COOK_KIND_RULES[p.recipe.kind].waitMs;
  return {
    ...stored,
    cooking: {
      recipe: c.recipe, count: p.pending, bonus: c.bonus.slice(p.completed),
      startedAt: iso(Date.parse(c.startedAt) + p.completed * waitMs),
    },
  };
}

/** 보관함에 있는 수 — 완성 요리 아이템 수와 조리 중인 수량의 합 */
export function cookStorageUsed(state: Pick<GameState, 'items' | 'cooking'>): number {
  return RECIPES.reduce((sum, r) => sum + (state.items[r.id] ?? 0), 0) + (state.cooking?.count ?? 0);
}

/** 조리 시작 판정. 조리가 끝난 완성품은 먼저 보관함으로 정산해서 본다 */
export function canCook(state: GameState, recipeId: unknown, count: unknown, now: string): RuleCheck {
  if (!isAtHome(state)) return no('not-at-home');
  const unlocked = canUseCooking(state);
  if (!unlocked.ok) return unlocked;
  const recipe = recipeById(recipeId);
  if (!recipe || typeof count !== 'number' || !Number.isInteger(count) || count < 1) return no('bad-request');
  const settled = settleCooking(state, now);
  if (count > COOK_STORAGE_CAP - cookStorageUsed(settled)) return no('storage-full');
  if (settled.cooking) return no('cooking-busy');
  for (const r of RARITY_ORDER) {
    if ((settled.items[ENERGY_ITEM_IDS[r]] ?? 0) < recipeCostStored(recipe, r) * count) return no('not-enough-energy');
  }
  return OK;
}

/** 먹기(쓰기) 판정. 조리가 끝난 완성품은 먼저 보관함으로 정산해서 본다. 위치 제한은 없다 */
export function canEat(state: GameState, item: unknown, now: string): RuleCheck {
  const unlocked = canUseCooking(state);
  if (!unlocked.ok) return unlocked;
  const recipe = recipeById(item);
  if (!recipe) return no('bad-request');
  return (settleCooking(state, now).items[recipe.id] ?? 0) >= 1 ? OK : no('item-not-owned');
}

/** 슬롯이 끝나는 시각 — 먹은 시각에 그 종류의 지속을 더한다 */
export function slotEndsAt(recipe: Recipe, now: string): string {
  return iso(Date.parse(now) + COOK_KIND_RULES[recipe.kind].slotMs);
}

// ---------- 슬롯 효과 ----------

/** 지금 적용 중인 요리 효과의 합 — 같은 대상에 걸리는 효과는 더해서 한 번 적용한다 */
export interface ActiveCookEffects {
  /** 입질 대기 감소율의 합 */
  biteWaitCut: number;
  /** 등급별 가중치 증가율의 합 */
  rarityWeight: Partial<Record<RarityId, number>>;
  /** 돌연변이 폼 가중치 증가율의 합 */
  mutationWeight: number;
  /** 네임드 조우 가중치 증가율의 합 */
  namedWeight: number;
}

export const NO_COOK_EFFECTS: ActiveCookEffects = {
  biteWaitCut: 0, rarityWeight: {}, mutationWeight: 0, namedWeight: 0,
};

/** 그 캐치에 걸린 슬롯과 요리 id. 걸린 슬롯의 키만 둔다 */
export interface AppliedSlots {
  lunch?: string;
  bait?: string;
}

/**
 * 그 캐치에 걸리는 슬롯 — 슬롯 적용 범위의 단일 정의다. 도시락 슬롯은 방치(auto) 판정에만, 미끼 슬롯은 수동 판정에만
 * 걸리고, 끝나는 시각 전이며 콘텐츠에 있는 요리일 때만 걸린다. now는 서버 시각이다 — 클라이언트가 시각을 주장할 수 없다.
 */
export function appliedSlots(state: Pick<GameState, 'slots'>, now: string, judgment: Judgment): AppliedSlots {
  const kind = judgment === 'auto' ? 'lunch' : 'bait';
  const slot = state.slots[kind];
  if (slot === null || !(Date.parse(now) < Date.parse(slot.endsAt)) || recipeById(slot.id) === undefined) return {};
  return { [kind]: slot.id };
}

/** 그 캐치에 적용하는 슬롯 효과 — 걸린 슬롯(appliedSlots)의 요리 효과를 합한다 */
export function slotEffects(state: Pick<GameState, 'slots'>, now: string, judgment: Judgment): ActiveCookEffects {
  const active = Object.values(appliedSlots(state, now, judgment))
    .map(id => recipeById(id))
    .filter((r): r is Recipe => r !== undefined);
  const out: ActiveCookEffects = { ...NO_COOK_EFFECTS, rarityWeight: {} };
  for (const { effects: e } of active) {
    out.biteWaitCut = clean(out.biteWaitCut + (e.biteWaitCut ?? 0));
    out.mutationWeight = clean(out.mutationWeight + (e.mutationWeight ?? 0));
    out.namedWeight = clean(out.namedWeight + (e.namedWeight ?? 0));
    if (e.rarityWeight) {
      for (const g of e.rarityWeight.grades) {
        out.rarityWeight[g] = clean((out.rarityWeight[g] ?? 0) + e.rarityWeight.bonus);
      }
    }
  }
  return out;
}
