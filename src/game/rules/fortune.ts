// 운세 — 하루(게임 날짜, KST 04:00 경계) 하나의 행운 보너스. 페널티는 없다.
// 서버가 게임 날짜마다 계정당 운세 하나를 굴려 상태에 고정한다 — 그날 안에서는
// 바뀌지 않고, 다시 접속하거나 기기를 바꿔도 같다(낙관 락이 첫 확정을 하나로 만든다).
// 운세 21종은 내부 3등급 다중 계층 확률(65%/25%/10%)로 추첨하고, 판정에서
// 다른 보너스(업적·요리·길드·유물)를 다 적용한 마지막에 독립 곱연산 배수를 곱한다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { potionById } from '../content/potions.js';
import type { Potion } from '../content/potions.js';
import { gameDayOf } from './time.js';

/** 운세 종류 — 12종(기존 fish/gold/shadow 하위 호환 포함) */
export type FortuneKind =
  | 'fish'
  | 'gold'
  | 'bite'
  | 'big'
  | 'fame'
  | 'shadow'
  | 'mutation'
  | 'night'
  | 'energy'
  | 'golden-scale'
  | 'mirage'
  | 'grand-catch';

/** 행운 배수가 걸리는 판정 대상 — 10개 보너스 채널 */
export type FortuneTarget =
  | 'rarity'
  | 'sell'
  | 'named'
  | 'biteWait'
  | 'bigCatch'
  | 'fame'
  | 'mutation'
  | 'night'
  | 'energy'
  | 'legendary';

/** 내부 추첨 등급 (화면 비노출) */
export type FortuneTier = 1 | 2 | 3;

export interface FortuneEffect {
  readonly target: FortuneTarget;
  readonly mult: number;
}

export interface FortuneEntry {
  readonly kind: FortuneKind;
  readonly index: 3 | 5;
  readonly tier: FortuneTier;
  readonly effects: readonly FortuneEffect[];
}

/** 하루의 운세 — 굴린 게임 날짜에 고정된다 */
export interface DailyFortune {
  /** 굴린 게임 날짜 — 이 날짜 동안에만 이 운세가 산다 */
  day: string;
  kind: FortuneKind;
  /** 보너스 강도 — 3(적당한 운, 40%)과 5(좋은 운, 60%). 3등급은 항상 5다 */
  index: 3 | 5;
}

/** 내부 3등급 추첨 가중치 — 1등급 65%, 2등급 25%, 3등급 10% */
export const FORTUNE_TIER_WEIGHTS: Readonly<Record<FortuneTier, number>> = {
  1: 0.65,
  2: 0.25,
  3: 0.10,
};

/** 21종 운세 마스터 카탈로그 (표준 표시 순서) */
export const FORTUNE_CATALOG: readonly FortuneEntry[] = [
  // 1등급 일반
  { kind: 'fish', index: 3, tier: 1, effects: [{ target: 'rarity', mult: 1.05 }] },
  { kind: 'fish', index: 5, tier: 1, effects: [{ target: 'rarity', mult: 1.10 }] },
  { kind: 'gold', index: 3, tier: 1, effects: [{ target: 'sell', mult: 1.05 }] },
  { kind: 'gold', index: 5, tier: 1, effects: [{ target: 'sell', mult: 1.10 }] },
  { kind: 'bite', index: 3, tier: 1, effects: [{ target: 'biteWait', mult: 0.95 }] },
  { kind: 'bite', index: 5, tier: 1, effects: [{ target: 'biteWait', mult: 0.90 }] },
  { kind: 'big', index: 3, tier: 1, effects: [{ target: 'bigCatch', mult: 1.50 }] },
  { kind: 'big', index: 5, tier: 1, effects: [{ target: 'bigCatch', mult: 2.00 }] },
  { kind: 'fame', index: 3, tier: 1, effects: [{ target: 'fame', mult: 1.50 }] },
  { kind: 'fame', index: 5, tier: 1, effects: [{ target: 'fame', mult: 2.00 }] },
  // 2등급 특수
  { kind: 'shadow', index: 3, tier: 2, effects: [{ target: 'named', mult: 1.05 }] },
  { kind: 'shadow', index: 5, tier: 2, effects: [{ target: 'named', mult: 1.10 }] },
  { kind: 'mutation', index: 3, tier: 2, effects: [{ target: 'mutation', mult: 1.05 }] },
  { kind: 'mutation', index: 5, tier: 2, effects: [{ target: 'mutation', mult: 1.10 }] },
  { kind: 'night', index: 3, tier: 2, effects: [{ target: 'night', mult: 1.05 }] },
  { kind: 'night', index: 5, tier: 2, effects: [{ target: 'night', mult: 1.10 }] },
  { kind: 'energy', index: 3, tier: 2, effects: [{ target: 'energy', mult: 1.50 }] },
  { kind: 'energy', index: 5, tier: 2, effects: [{ target: 'energy', mult: 2.00 }] },
  // 3등급 희귀 대길 (좋은 운 단일)
  { kind: 'golden-scale', index: 5, tier: 3, effects: [{ target: 'legendary', mult: 1.10 }] },
  { kind: 'mirage', index: 5, tier: 3, effects: [{ target: 'legendary', mult: 1.08 }, { target: 'mutation', mult: 1.08 }] },
  {
    kind: 'grand-catch',
    index: 5,
    tier: 3,
    effects: [{ target: 'rarity', mult: 1.10 }, { target: 'sell', mult: 1.10 }, { target: 'named', mult: 1.10 }],
  },
];

/** @deprecated 다중 효과 운세(3등급) 지원을 위해 fortuneEffectsOf / fortuneEffectMultOf를 사용한다 */
export const FORTUNE_TARGET_OF: Record<FortuneKind, FortuneTarget> = {
  fish: 'rarity',
  gold: 'sell',
  bite: 'biteWait',
  big: 'bigCatch',
  fame: 'fame',
  shadow: 'named',
  mutation: 'mutation',
  night: 'night',
  energy: 'energy',
  'golden-scale': 'legendary',
  mirage: 'legendary',
  'grand-catch': 'rarity',
};

const FORTUNE_KINDS_BY_TIER: Readonly<Record<FortuneTier, readonly FortuneKind[]>> = {
  1: ['fish', 'gold', 'bite', 'big', 'fame'],
  2: ['shadow', 'mutation', 'night', 'energy'],
  3: ['golden-scale', 'mirage', 'grand-catch'],
};

const TIER_OF_KIND: Readonly<Record<FortuneKind, FortuneTier>> = {
  fish: 1,
  gold: 1,
  bite: 1,
  big: 1,
  fame: 1,
  shadow: 2,
  mutation: 2,
  night: 2,
  energy: 2,
  'golden-scale': 3,
  mirage: 3,
  'grand-catch': 3,
};

/** 운세 키 조합 — 달력/점괘첩 집계·조회 키 */
export function fortuneKeyOf(kind: FortuneKind, index: 3 | 5): string {
  return `${kind}:${index}`;
}

const FORTUNE_ENTRY_BY_KEY = new Map<string, FortuneEntry>(
  FORTUNE_CATALOG.map(entry => [fortuneKeyOf(entry.kind, entry.index), entry]),
);

/** kind와 강도로 카탈로그 항목 조회 */
export function fortuneEntryOf(kind: FortuneKind, index: 3 | 5): FortuneEntry | undefined {
  return FORTUNE_ENTRY_BY_KEY.get(fortuneKeyOf(kind, index));
}

/** 운세에 포함된 효과 목록 반환 — 3등급은 index가 3으로 들어와도 5 항목으로 정규화해 찾는다 */
export function fortuneEffectsOf(
  fortune: Pick<DailyFortune, 'kind' | 'index'> | null | undefined,
): readonly FortuneEffect[] {
  if (!fortune) return [];
  const entry = fortuneEntryOf(fortune.kind, fortune.index)
    ?? (TIER_OF_KIND[fortune.kind] === 3 ? fortuneEntryOf(fortune.kind, 5) : undefined);
  return entry?.effects ?? [];
}

/** 특정 대상 채널에 걸리는 운세 단독 배수 — 해당 효과가 없으면 1 */
export function fortuneEffectMultOf(
  fortune: Pick<DailyFortune, 'kind' | 'index'> | null | undefined,
  target: FortuneTarget,
): number {
  for (const eff of fortuneEffectsOf(fortune)) {
    if (eff.target === target) return eff.mult;
  }
  return 1;
}

/**
 * 운세 추첨 — 1단계 등급(65/25/10), 2단계 등급 내 종류 균등, 3단계 강도(1·2등급은 3 40%/5 60%, 3등급은 5 고정).
 */
export function rollFortune(day: string, rng: () => number = Math.random): DailyFortune {
  const tierRoll = rng();
  const tier: FortuneTier = tierRoll < FORTUNE_TIER_WEIGHTS[1]
    ? 1
    : tierRoll < FORTUNE_TIER_WEIGHTS[1] + FORTUNE_TIER_WEIGHTS[2]
      ? 2
      : 3;
  const kinds = FORTUNE_KINDS_BY_TIER[tier];
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))];
  const index: 3 | 5 = tier === 3 ? 5 : rng() < 0.4 ? 3 : 5;
  return { day, kind, index };
}

/**
 * 오늘의 운세 보장 — 상태에 이 게임 날짜의 운세가 없으면 굴려 고정한다.
 * 이미 그날의 운세면 같은 상태를 돌려준다(불변 — rng를 쓰지 않는다).
 * 굴리는 시점은 그날의 첫 접속(boot)이다. 판정(catch·sell·extractEnergy)의 호출은
 * 접속 중 날짜가 바뀐 뒤처럼 운세가 아직 없는 상태의 백스톱이다.
 */
export function ensureFortune<T extends { fortune: DailyFortune | null }>(
  state: T, nowIso: string, rng: () => number = Math.random,
): T {
  const day = gameDayOf(nowIso);
  return state.fortune?.day === day ? state : { ...state, fortune: rollFortune(day, rng) };
}

/** 지금 게임 날짜의 운세 — 날짜가 지난 운세는 없는 것으로 본다 */
export function fortuneOf(state: { fortune: DailyFortune | null }, nowIso: string): DailyFortune | null {
  return state.fortune?.day === gameDayOf(nowIso) ? state.fortune : null;
}

/** 활성 비약 맵 — 비약 id → 효과가 지속되는 게임 날짜 */
export type ActivePotions = Readonly<Record<string, string>>;

/** 지금 게임 날짜에 효과가 살아 있는 비약 목록 — 날짜가 지난 항목은 제외한다 */
export function activePotionsOf(
  potions: ActivePotions | undefined,
  nowIso: string,
): Potion[] {
  if (!potions) return [];
  const day = gameDayOf(nowIso);
  const active: Potion[] = [];
  for (const [id, activeDay] of Object.entries(potions)) {
    if (activeDay !== day) continue;
    const potion = potionById(id);
    if (potion) active.push(potion);
  }
  return active;
}

/** 특정 게임 날짜에 활성인 비약들이 대상에 적용하는 독립 곱연산 배수 */
export function potionLuckMultOf(
  potions: ActivePotions | undefined,
  target: FortuneTarget,
  day: string,
): number {
  if (!potions) return 1;
  let mult = 1;
  for (const [id, activeDay] of Object.entries(potions)) {
    if (activeDay !== day) continue;
    const luck = potionById(id)?.effects.luck as Partial<Record<FortuneTarget, number>> | undefined;
    const bonus = luck?.[target];
    if (typeof bonus === 'number' && Number.isFinite(bonus) && bonus > 0) {
      mult *= 1 + bonus;
    }
  }
  return Math.round(mult * 1e9) / 1e9;
}

/**
 * 대상에 걸리는 최종 행운 배수 — 일일 운세 배수와 오늘 활성인 비약 배수를 독립 곱연산해 돌려준다.
 * 판정에서 다른 보너스를 다 적용한 마지막 곱이다.
 */
export function luckMultOf(
  fortune: DailyFortune | null,
  target: FortuneTarget,
  potions?: ActivePotions,
  day?: string,
): number {
  const fortuneMult = fortuneEffectMultOf(fortune, target);
  const potionMult = potions && day ? potionLuckMultOf(potions, target, day) : 1;
  return Math.round(fortuneMult * potionMult * 1e9) / 1e9;
}

/** 상태와 현재 시각으로 대상에 걸리는 총 행운 배수(일일 운세 × 활성 비약)를 구한다 */
export function totalLuckMultOf(
  state: { fortune: DailyFortune | null; potions?: ActivePotions },
  nowIso: string,
  target: FortuneTarget,
): number {
  return luckMultOf(fortuneOf(state, nowIso), target, state.potions, gameDayOf(nowIso));
}

/** 세이브 위생 — 운세는 하루짜리라 필드가 없는(구) 세이브는 없는 것으로 둔다.
 *  12종 kind를 모두 수용하며 3등급의 index는 5로 정규화하고, 형태가 틀린 값은 버린다 */
export function safeFortune(v: unknown): DailyFortune | null {
  const r = v as Partial<DailyFortune> | null;
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return null;
  if (typeof r.day !== 'string' || r.day.length === 0) return null;
  if (typeof r.kind !== 'string' || !Object.hasOwn(TIER_OF_KIND, r.kind)) return null;
  if (r.index !== 3 && r.index !== 5) return null;
  const kind = r.kind as FortuneKind;
  const index: 3 | 5 = TIER_OF_KIND[kind] === 3 ? 5 : r.index;
  return { day: r.day, kind, index };
}
