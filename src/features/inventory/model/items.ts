// 스택 아이템 표시·첨부 모델 — 게임 카탈로그와 상한 규칙을 클라이언트 표현 계층에 맞게 감싼다.
import {
  STACKABLE_ITEMS,
  findStackableItem,
  itemStorageAmount,
  type StackableItem,
  type StackableItemKind,
} from '../../../game/content/itemCatalog';
import { ITEM_CAP } from '../../../game/rules/logic';
import type { ItemSpriteKind } from '../../../game/content/sprites/itemSprites';

export { STACKABLE_ITEMS, findStackableItem, itemStorageAmount, ITEM_CAP };
export type { StackableItem, StackableItemKind };

export const STACKABLE_ITEM_KIND_LABEL: Record<StackableItemKind, string> = {
  potion: '물약',
  energy: '생명의 기운',
  dish: '도시락',
  bait: '미끼',
  material: '재료',
};

const SPRITE_KIND: Record<StackableItemKind, ItemSpriteKind | null> = {
  potion: 'potion',
  energy: 'energy',
  dish: 'lunch',
  bait: 'bait',
  material: null,
};

export interface ItemDisplayInfo {
  id: string;
  kind: StackableItemKind;
  name: string;
  spriteKind: ItemSpriteKind | null;
  kindLabel: string;
  description?: string;
}

/** 스택 아이템 id를 표현용 이름과 스프라이트 종류로 풀어낸다. 미등록 id는 null */
export function resolveItemDisplay(id: string): ItemDisplayInfo | null {
  const item = findStackableItem(id);
  if (!item) return null;
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    spriteKind: SPRITE_KIND[item.kind],
    kindLabel: STACKABLE_ITEM_KIND_LABEL[item.kind],
    description: item.description,
  };
}

/** 우편 첨부 등 수량 상한(표시 단위 기준) */
export function maxAttachableQty(id: string): number {
  const item = findStackableItem(id);
  if (!item) return 0;
  return Math.floor(ITEM_CAP / item.unitSize);
}

/** 아이템 이름과 수량을 문장으로 포맷한다 (예: '작은 행운 물약 2개') */
export function formatItemQtyText(id: string, qty: number): string {
  const name = findStackableItem(id)?.name ?? id;
  return `${name} ${qty.toLocaleString('ko-KR')}개`;
}
