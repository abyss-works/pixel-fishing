// 공용 스택 아이템 카탈로그 — 가방, 우편 첨부, 관리자 지급, 서버 검증이 공유하는 단일 정본.
// 상태 저장 맵(items)에 들어가는 모든 스택 아이템 종류와 표시-저장 단위 변환 규칙을 통합한다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버의 import 그래프에 포함된다.
import { ARTIFACTS } from './artifacts.js';
import { ENERGY_ITEM_IDS, ENERGY_UNIT, RECIPES } from './cooking.js';
import { POTIONS } from './potions.js';
import { RARITY, RARITY_ORDER } from './rarity.js';
import type { DisplayGradeId, RarityId } from './rarity.js';

export type StackableItemKind = 'potion' | 'energy' | 'dish' | 'bait' | 'material';

export interface StackableItem {
  id: string;
  kind: StackableItemKind;
  name: string;
  /** 표시 등급 */
  grade?: DisplayGradeId;
  /** 생명의 기운 등급 — 기운 종류에만 둔다 */
  rarity?: RarityId;
  /** 표시 개수 1개당 저장 단위 (생명의 기운은 ENERGY_UNIT=10, 그 밖은 1) */
  unitSize: number;
  /** 우편 첨부 가능 여부 */
  attachable: boolean;
  /** 설명 또는 로어 */
  description?: string;
}

const POTION_ITEMS: readonly StackableItem[] = POTIONS.map(p => ({
  id: p.id,
  kind: 'potion',
  name: p.name,
  grade: p.grade,
  unitSize: 1,
  attachable: true,
  description: p.description,
}));

const ENERGY_ITEMS: readonly StackableItem[] = RARITY_ORDER.map(r => ({
  id: ENERGY_ITEM_IDS[r],
  kind: 'energy',
  name: `${RARITY[r].name} 생명의 기운`,
  grade: r,
  rarity: r,
  unitSize: ENERGY_UNIT,
  attachable: true,
}));

const COOK_ITEMS: readonly StackableItem[] = RECIPES.map(r => ({
  id: r.id,
  kind: r.kind === 'lunch' ? 'dish' : 'bait',
  name: r.name,
  grade: r.grade,
  unitSize: 1,
  attachable: true,
  description: r.description,
}));

const MATERIAL_ITEMS: readonly StackableItem[] = ARTIFACTS.map(a => ({
  id: a.materialId,
  kind: 'material',
  name: a.materialName,
  unitSize: 1,
  attachable: true,
  description: a.lore,
}));

export const STACKABLE_ITEMS: readonly StackableItem[] = [
  ...POTION_ITEMS,
  ...ENERGY_ITEMS,
  ...COOK_ITEMS,
  ...MATERIAL_ITEMS,
];

const STACKABLE_ITEM_BY_ID: ReadonlyMap<string, StackableItem> = new Map(
  STACKABLE_ITEMS.map(item => [item.id, item]),
);

/** id → 스택 아이템 정의. 없는 id나 비문자열은 undefined */
export const findStackableItem = (id: unknown): StackableItem | undefined =>
  typeof id === 'string' ? STACKABLE_ITEM_BY_ID.get(id) : undefined;

/** 등록된 스택 아이템 id인가 */
export const isStackableItemId = (id: unknown): id is string =>
  findStackableItem(id) !== undefined;

/** 우편에 첨부할 수 있는 스택 아이템 id인가 */
export const isAttachableItemId = (id: unknown): id is string =>
  findStackableItem(id)?.attachable === true;

/** 종류별 스택 아이템 목록 */
export const stackableItemsByKind = (kind: StackableItemKind): readonly StackableItem[] =>
  STACKABLE_ITEMS.filter(item => item.kind === kind);

/** 표시 개수 → 상태 저장 단위 정수. 생명의 기운 1개는 저장 단위 10으로 바뀐다. 무효 값·정확히 떨어지지 않는 소수는 0 */
export function itemStorageAmount(id: string, displayQty: number): number {
  const item = findStackableItem(id);
  if (!item || !Number.isFinite(displayQty) || displayQty <= 0) return 0;
  const raw = displayQty * item.unitSize;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-9) return 0;
  return rounded;
}

/** 상태 저장 단위 → 표시 개수. 무효 값·모르는 id는 0 */
export function itemDisplayQty(id: string, storageAmount: number): number {
  const item = findStackableItem(id);
  if (!item || !Number.isFinite(storageAmount) || storageAmount <= 0) return 0;
  return storageAmount / item.unitSize;
}
