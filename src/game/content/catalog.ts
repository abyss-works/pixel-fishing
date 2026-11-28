// 단일 어종 카탈로그 읽기 계층 — 상시 어종(FISH)과 기간제 이벤트 어종(EVENT_FISH)을
// 원본 배열은 분리 유지한 채 화면·위젯·무결성 조회용 단일 인터페이스로 제공한다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { EVENT_FISH } from './eventFish.js';
import type { EventFish } from './eventFish.js';
import { FISH } from './fish.js';
import type { Fish, FishShape, FormId } from './fish.js';
import type { RarityId } from './rarity.js';
import type { SpotId } from './spots.js';
import { VARIANT_PRICE_MULT } from '../rules/balance.js';

export type FishCatalogKind = 'regular' | 'event';

export type CatchValue =
  | { kind: 'gold'; amount: number }
  | { kind: 'score'; amount: number };

export interface CatalogFish {
  readonly catalog: FishCatalogKind;
  readonly id: string;
  readonly name: string;
  readonly spot: SpotId;
  readonly rarity: RarityId;
  readonly color: string;
  readonly shape: FishShape;
  readonly lore: string;
  readonly night?: boolean;
  readonly variant: {
    readonly name: string;
    readonly color: string;
    readonly lore: string;
  };
  /** 스프라이트·카드 렌더링용 Fish 호환 뷰 */
  readonly sprite: Fish;
  /** 폼별 가치(일반 어종은 골드, 이벤트 어종은 점수) */
  readonly valueOf: (form: FormId) => CatchValue;
}

function regularEntry(fish: Fish): CatalogFish {
  return {
    catalog: 'regular',
    id: fish.id,
    name: fish.name,
    spot: fish.spot,
    rarity: fish.rarity,
    color: fish.color,
    shape: fish.shape,
    lore: fish.lore,
    ...(fish.night ? { night: true } : {}),
    variant: fish.variant,
    sprite: fish,
    valueOf: (form: FormId): CatchValue => ({
      kind: 'gold',
      amount: form === 'variant' ? Math.round(fish.price * VARIANT_PRICE_MULT) : fish.price,
    }),
  };
}

function eventEntry(ef: EventFish): CatalogFish {
  const sprite: Fish = {
    id: ef.id,
    name: ef.name,
    spot: 'championship',
    rarity: ef.rarity,
    price: ef.score,
    color: ef.color,
    shape: ef.shape,
    lore: ef.lore,
    variant: {
      name: ef.variant.name,
      color: ef.variant.color,
      lore: ef.variant.lore,
    },
  };
  return {
    catalog: 'event',
    id: ef.id,
    name: ef.name,
    spot: 'championship',
    rarity: ef.rarity,
    color: ef.color,
    shape: ef.shape,
    lore: ef.lore,
    variant: sprite.variant,
    sprite,
    valueOf: (form: FormId): CatchValue => ({
      kind: 'score',
      amount: form === 'variant' ? ef.variant.score : ef.score,
    }),
  };
}

export const CATALOG_FISH: readonly CatalogFish[] = [
  ...FISH.map(regularEntry),
  ...EVENT_FISH.map(eventEntry),
];

const CATALOG_BY_ID: ReadonlyMap<string, CatalogFish> = new Map(
  CATALOG_FISH.map(entry => [entry.id, entry]),
);

/** 일반·이벤트 어종을 단일 키로 조회한다(상시 도감·경제 규칙에는 FISH를 직접 쓴다) */
export function catalogFishById(id: unknown): CatalogFish | undefined {
  return typeof id === 'string' ? CATALOG_BY_ID.get(id) : undefined;
}

/** 해역에 출현하는 어종 목록을 단일 카탈로그에서 조회한다 */
export function catalogFishOfSpot(spotId: SpotId): readonly CatalogFish[] {
  return CATALOG_FISH.filter(entry => entry.spot === spotId);
}

/** 어종 ID와 폼으로 표시 가치(골드 또는 점수)를 계산한다 */
export function catalogValueOf(fishId: unknown, form: FormId = 'normal'): CatchValue | null {
  const entry = catalogFishById(fishId);
  return entry ? entry.valueOf(form) : null;
}
