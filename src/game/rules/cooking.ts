// 요리 규칙 — 해금, 기운 얻기, 조리와 보관함, 먹기, 슬롯 효과의 적용 범위를 판정하는 순수 함수.
// 매개변수(수량, 대기, 지속, 효과 값)는 콘텐츠 표에서 읽고 여기서 다시 적지 않는다.
// 호출부(리듀서, 서버, 화면)는 이 모듈이 돌려준 판정과 값을 쓴다 — 규칙을 다시 조립하지 않는다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import {
  AUTO_ENERGY_BOAT, COOK_KIND_RULES, COOK_STORAGE_CAP, COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL,
  ENERGY_TRANSMUTE_RATIO, ENERGY_UNIT, RECIPES, recipeById, recipeCostStored, recipeWaitMs, transmuteTargetOf,
} from '../content/cooking.js';
import type { CookKind, Recipe } from '../content/cooking.js';
import { ARTIFACTS } from '../content/artifacts.js';
import { RARITY_ORDER } from '../content/rarity.js';
import type { RarityId } from '../content/rarity.js';
import { SALE_BASES } from '../content/places.js';
import { SPOTS } from '../content/spots.js';
import type { SpotId } from '../content/spots.js';
import { addItem, instanceFish, itemCapOf, release } from './logic.js';
import type { CookingQueueItem, GameState, Judgment, SlotEffect } from './logic.js';
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

/** 기운 얻기 판정 — 게스트가 아니고, 판매 시설이 있는 거점(집, 항구)에 있거나 가공 플랜트선 이상이면 해금 판정을 한다 */
export function canExtractEnergy(state: Pick<GameState, 'boat' | 'location'>, guest = false): RuleCheck {
  if (guest) return no('account-only');
  if (!isAtSaleBase(state) && state.boat < AUTO_ENERGY_BOAT) return no('not-at-sale-base');
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

/** 지목한 개체에서 얻는 기운 — 개체 하나에서 그 등급 기운 화면 단위 1(energyYield)에 기운 획득량 보너스와 행운 배수를 반영한다 */
export function energyGain(
  state: Pick<GameState, 'bag'>,
  uids: readonly string[],
  energyYieldBonus = 0,
  energyLuck = 1,
): EnergyGain {
  const bag = new Map(state.bag.map(i => [i.uid, i]));
  const counts = Object.fromEntries(RARITY_ORDER.map(r => [r, 0])) as Record<RarityId, number>;
  const taken: string[] = [];
  for (const uid of new Set(uids)) {
    const inst = bag.get(uid);
    const fish = inst ? instanceFish(inst) : undefined;
    if (!inst || inst.locked || !fish) continue;
    counts[fish.rarity] += 1;
    taken.push(uid);
  }
  const scale = Math.max(0, 1 + energyYieldBonus) * Math.max(0, energyLuck);
  const neutral = energyYieldBonus === 0 && energyLuck === 1;
  const byGrade = Object.fromEntries(
    RARITY_ORDER.map(r => [
      r,
      counts[r] === 0 ? 0 : neutral ? energyYield(counts[r]) : Math.round(energyYield(counts[r]) * scale),
    ]),
  ) as Record<RarityId, number>;
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
  state: Pick<GameState, 'boat' | 'energyTargets' | 'bag'>,
  uids: readonly string[],
  guest: boolean,
  energyYieldBonus = 0,
  energyLuck = 1,
): OverflowPlan {
  if (guest || state.boat < AUTO_ENERGY_BOAT) return { released: [...uids], gain: energyGain(state, []) };
  const bag = new Map(state.bag.map(i => [i.uid, i]));
  const extractable = uids.filter(uid => {
    const inst = bag.get(uid);
    const fish = inst ? instanceFish(inst) : undefined;
    return fish !== undefined && energyTargetOf(state, fish.spot);
  });
  const gain = energyGain(state, extractable, energyYieldBonus, energyLuck);
  const taken = new Set(gain.uids);
  return { released: uids.filter(uid => !taken.has(uid)), gain };
}

// ---------- 조리 ----------

/** 조리 진행 — 완성 수는 시작 시각과 서버 시각에서 파생한다 */
export interface CookingProgress {
  id: string;
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
  const waitMs = recipeWaitMs(recipe);
  const start = Date.parse(c.startedAt);
  const elapsed = Math.max(0, Date.parse(now) - start);
  // 대기가 0인 조리(미끼 등)는 시작과 동시에 전부 완성이다. 0으로 나누지 않게 따로 처리한다.
  const completed = waitMs === 0
    ? c.count
    : Math.min(c.count, Number.isFinite(elapsed) ? Math.floor(elapsed / waitMs) : 0);
  const extra = c.bonus.slice(0, completed).filter(Boolean).length;
  return {
    id: c.id,
    recipe, count: c.count, completed, ready: completed + extra, pending: c.count - completed,
    nextAt: completed < c.count ? iso(start + (completed + 1) * waitMs) : null,
    finishAt: iso(start + c.count * waitMs),
  };
}

/** 완성품을 보관함(items)으로 옮기고, 현재 조리가 모두 끝나면 앞 작업 완료 시각을 이어받아 대기열을 연쇄 정산한다 */
export function settleCooking(state: GameState, now: string): GameState {
  let cur = state;
  while (cur.cooking) {
    const c = cur.cooking;
    const p = cookingProgress(cur, now);
    if (!p || p.completed === 0) break;
    const next = addItem(cur, p.recipe.id, p.ready);
    const waitMs = recipeWaitMs(p.recipe);
    if (p.pending > 0) {
      cur = {
        ...next,
        cooking: {
          id: c.id,
          recipe: c.recipe,
          count: p.pending,
          bonus: c.bonus.slice(p.completed),
          startedAt: iso(Date.parse(c.startedAt) + p.completed * waitMs),
        },
      };
      break;
    }
    if (cur.cookingQueue.length > 0) {
      const [head, ...restQueue] = cur.cookingQueue;
      const finishedAt = iso(Date.parse(c.startedAt) + c.count * waitMs);
      cur = {
        ...next,
        cooking: {
          id: head.id,
          recipe: head.recipe,
          count: head.count,
          bonus: [...head.bonus],
          startedAt: finishedAt,
        },
        cookingQueue: restQueue,
      };
      continue;
    }
    cur = { ...next, cooking: null };
    break;
  }
  return cur;
}

/** 보관함에 있는 수 — 완성 요리 아이템 수, 현재 조리 미완성 수량, 대기열 수량의 합 */
export function cookStorageUsed(
  state: Pick<GameState, 'items' | 'cooking'> & { cookingQueue?: readonly CookingQueueItem[] },
): number {
  const itemsCount = RECIPES.reduce((sum, r) => sum + (state.items[r.id] ?? 0), 0);
  const cookingCount = state.cooking?.count ?? 0;
  const queueCount = state.cookingQueue?.reduce((sum, q) => sum + q.count, 0) ?? 0;
  return itemsCount + cookingCount + queueCount;
}

/** 조리 시작 판정. 조리가 끝난 완성품은 먼저 보관함으로 정산해서 본다 */
export function canCook(state: GameState, recipeId: unknown, count: unknown, now: string, guest = false): RuleCheck {
  if (guest) return no('account-only');
  if (!isAtHome(state)) return no('not-at-home');
  const unlocked = canUseCooking(state);
  if (!unlocked.ok) return unlocked;
  const recipe = recipeById(recipeId);
  if (!recipe || typeof count !== 'number' || !Number.isInteger(count) || count < 1) return no('bad-request');
  const settled = settleCooking(state, now);
  if (count > COOK_STORAGE_CAP - cookStorageUsed(settled)) return no('storage-full');
  for (const r of RARITY_ORDER) {
    if ((settled.items[ENERGY_ITEM_IDS[r]] ?? 0) < recipeCostStored(recipe, r) * count) return no('not-enough-energy');
  }
  return OK;
}

/** 조리 취소 판정 — now까지 완성된 분량을 정산한 뒤 대상 작업 id가 현재 조리 또는 대기열에 남아 있는지 확인한다 */
export function canCancelCook(state: GameState, id: unknown, now: string, guest = false): RuleCheck {
  if (guest) return no('account-only');
  if (!isAtHome(state)) return no('not-at-home');
  const unlocked = canUseCooking(state);
  if (!unlocked.ok) return unlocked;
  if (typeof id !== 'string' || id.length === 0) return no('bad-request');
  const settled = settleCooking(state, now);
  const found = settled.cooking?.id === id || settled.cookingQueue.some(q => q.id === id);
  return found ? OK : no('cooking-not-found');
}

/** 취소 수량에 해당하는 등급별 100% 환급 기운(저장 단위) */
export function cookRefundOf(recipe: Recipe, count: number): Record<RarityId, number> {
  return Object.fromEntries(
    RARITY_ORDER.map(r => [r, recipeCostStored(recipe, r) * count]),
  ) as Record<RarityId, number>;
}

/** 기운 정방향 10:1 변환 판정 — 게스트·집 거점·해금·유효 등급·양의 정수 수량·원본 기운 보유·대상 상한 확인 */
export function canTransmuteEnergy(state: GameState, from: unknown, count: unknown, guest = false): RuleCheck {
  if (guest) return no('account-only');
  if (!isAtHome(state)) return no('not-at-home');
  const unlocked = canUseCooking(state);
  if (!unlocked.ok) return unlocked;
  const to = transmuteTargetOf(from);
  if (!to || typeof count !== 'number' || !Number.isInteger(count) || count < 1) return no('bad-request');
  const fromId = ENERGY_ITEM_IDS[from as RarityId];
  const toId = ENERGY_ITEM_IDS[to];
  const cost = count * ENERGY_TRANSMUTE_RATIO * ENERGY_UNIT;
  if (!Number.isSafeInteger(cost) || (state.items[fromId] ?? 0) < cost) return no('not-enough-energy');
  const gain = count * ENERGY_UNIT;
  if (!Number.isSafeInteger(gain) || (state.items[toId] ?? 0) + gain > itemCapOf(toId)) return no('energy-cap');
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

/** 동시에 장착할 수 있는 미끼 슬롯 수 — 기본 1칸에 보유 유물의 시스템 효과 가산을 더한다 */
export function maxBaitSlots(state: Pick<GameState, 'artifacts'>): number {
  const extra = ARTIFACTS.reduce((sum, a) =>
    state.artifacts.includes(a.id) ? sum + (a.system?.extraBaitSlots ?? 0) : sum, 0);
  return 1 + Math.max(0, extra);
}

/** 미끼 슬롯 지속 시간 배수 — 보유 유물의 감소율 합을 (1 − 합)으로 적용하고 최소 0.1배에서 멈춘다 */
export function baitDurationScale(state: Pick<GameState, 'artifacts'>): number {
  const cut = ARTIFACTS.reduce((sum, a) =>
    state.artifacts.includes(a.id) ? sum + (a.system?.baitDurationCut ?? 0) : sum, 0);
  return Math.max(0.1, clean(1 - cut));
}

/** 슬롯에 들어갈 때의 지속 시간(ms) — 미끼는 보유 유물의 지속 시간 배수를 반영한다 */
export function slotDurationMs(recipe: Recipe, state?: Pick<GameState, 'artifacts'>): number {
  const base = COOK_KIND_RULES[recipe.kind].slotMs;
  return recipe.kind === 'bait' && state ? Math.round(base * baitDurationScale(state)) : base;
}

/** 슬롯이 끝나는 시각 — 먹은 시각에 그 종류의 지속을 더한다 */
export function slotEndsAt(recipe: Recipe, now: string, state?: Pick<GameState, 'artifacts'>): string {
  return iso(Date.parse(now) + slotDurationMs(recipe, state));
}

/** 슬롯이 지금 유효한가 — 해당 종류의 콘텐츠 요리이고 끝나는 시각 전일 때만 참이다 */
export function isActiveSlot(slot: SlotEffect | null | undefined, kind: CookKind, now: string): slot is SlotEffect {
  if (!slot) return false;
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || !(nowMs < Date.parse(slot.endsAt))) return false;
  return recipeById(slot.id)?.kind === kind;
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
  /** 돌연변이 폼 가중치 독립 배수의 곱 (기본 1, 억제 요리 활성 시 ×0.5) */
  mutationMult: number;
  /** 네임드 조우 가중치 증가율의 합 */
  namedWeight: number;
  /** 낮의 추첨 풀에 밤 전용 어종을 합류시키는 효과 — 미끼 슬롯이 켜져 있는 동안 참 */
  nightUnlock: boolean;
}

export const NO_COOK_EFFECTS: ActiveCookEffects = {
  biteWaitCut: 0, rarityWeight: {}, mutationWeight: 0, mutationMult: 1, namedWeight: 0, nightUnlock: false,
};

/** 그 캐치에 걸린 슬롯과 요리 id. 걸린 슬롯의 키만 둔다 */
export interface AppliedSlots {
  lunch?: string;
  bait?: string;
  bait2?: string;
}

/**
 * 그 캐치에 걸리는 슬롯 — 슬롯 적용 범위의 단일 정의다. 도시락 슬롯은 방치(auto) 판정에만, 미끼 슬롯은 수동 판정에만
 * 걸리고, 끝나는 시각 전이며 콘텐츠에 있는 요리일 때만 걸린다. 활성 미끼는 중복을 없앤 뒤 항상 bait부터 채워 정규화한다.
 * now는 서버 시각이다 — 클라이언트가 시각을 주장할 수 없다.
 */
export function appliedSlots(state: Pick<GameState, 'slots'>, now: string, judgment: Judgment): AppliedSlots {
  if (judgment === 'auto') {
    const lunch = state.slots.lunch;
    return isActiveSlot(lunch, 'lunch', now) ? { lunch: lunch.id } : {};
  }
  const activeBaits: string[] = [];
  for (const slot of [state.slots.bait, state.slots.bait2]) {
    if (isActiveSlot(slot, 'bait', now) && !activeBaits.includes(slot.id)) {
      activeBaits.push(slot.id);
    }
  }
  if (activeBaits.length === 0) return {};
  return activeBaits.length === 1
    ? { bait: activeBaits[0] }
    : { bait: activeBaits[0], bait2: activeBaits[1] };
}

export interface SlotAmplify {
  bait?: number;
  lunch?: number;
}

/** 그 캐치에 적용하는 슬롯 효과 — 걸린 슬롯(appliedSlots)의 요리 효과에 출처별 증폭 배수를 곱한 뒤 합한다 */
export function slotEffects(
  state: Pick<GameState, 'slots'>,
  now: string,
  judgment: Judgment,
  amplify?: SlotAmplify,
): ActiveCookEffects {
  const active = Object.values(appliedSlots(state, now, judgment))
    .map(id => recipeById(id))
    .filter((r): r is Recipe => r !== undefined);
  const out: ActiveCookEffects = { ...NO_COOK_EFFECTS, rarityWeight: {} };
  for (const r of active) {
    const e = r.effects;
    const scale = 1 + (r.kind === 'bait' ? (amplify?.bait ?? 0) : (amplify?.lunch ?? 0));
    out.biteWaitCut = clean(out.biteWaitCut + (e.biteWaitCut ?? 0) * scale);
    out.mutationWeight = clean(out.mutationWeight + (e.mutationWeight ?? 0) * scale);
    if (e.mutationMult !== undefined) out.mutationMult = clean(out.mutationMult * e.mutationMult);
    out.namedWeight = clean(out.namedWeight + (e.namedWeight ?? 0) * scale);
    out.nightUnlock = out.nightUnlock || e.nightUnlock === true;
    if (e.rarityWeight) {
      for (const g of e.rarityWeight.grades) {
        out.rarityWeight[g] = clean((out.rarityWeight[g] ?? 0) + e.rarityWeight.bonus * scale);
      }
    }
  }
  return out;
}
