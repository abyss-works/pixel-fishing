// 라이브 이벤트(이벤트 1 삼총사, 이벤트 2 강태공 선수권 대회, 이벤트 3 행운왕) 순수 판정·보상 규칙.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import {
  EVENT2_SETTLEMENT_RATES,
  EVENT2_STANDARD_SPEC,
  EVENT_FISH,
  EVENT_HAT_IDS,
  eventFishById,
} from '../content/eventFish.js';
import type { EventFish, EventTrioTarget } from '../content/eventFish.js';
import type { FormId } from '../content/fish.js';
import { RARITY_ORDER } from '../content/rarity.js';
import type { RarityId } from '../content/rarity.js';
import type { SpotId } from '../content/spots.js';
import { JUDGMENT_MULT } from './balance.js';
import { pickWeighted } from './logic.js';
import type { Judgment } from './logic.js';

export type EventDexCounts = Readonly<Record<string, { readonly normal?: number; readonly variant?: number } | undefined>>;

export interface EventSettlementReward {
  readonly gold: number;
  readonly fame: number;
}

export interface Event2CatchDraw {
  readonly fish: EventFish;
  readonly form: FormId;
  readonly score: number;
}

/** 이벤트 1 슬롯 매칭 — 일반 해역에서 잡은 어종 id와 형태(normal/variant)가 정확히 일치할 때만 참이다 */
export function matchTrioSlot(
  target: EventTrioTarget,
  fishId: string,
  form: FormId,
  spot?: SpotId | string,
): boolean {
  if (spot === 'championship' || eventFishById(fishId)) return false;
  return target.fishId === fishId && target.form === form;
}

/** 이벤트 2 어획 점수 — 일반은 기본 점수, 돌연변이는 2배 점수 */
export function computeEvent2CatchScore(fish: EventFish | string, form: FormId): number {
  const entry = typeof fish === 'string' ? eventFishById(fish) : fish;
  if (!entry) return 0;
  return form === 'variant' ? entry.variant.score : entry.score;
}

/** 이벤트 2 저금통 적립 환산 — 어획 시점의 배 단계와 수동/방치 판정 기준으로 10점당 골드·고정 명성을 계산한다 */
export function computeSettlementReward(
  score: number,
  boatTier: number,
  manual: boolean,
): EventSettlementReward {
  if (!Number.isFinite(score) || score <= 0 || !Number.isFinite(boatTier)) {
    return { gold: 0, fame: 0 };
  }
  const maxTier = EVENT2_SETTLEMENT_RATES.idle.length - 1;
  const tier = Math.max(0, Math.min(maxTier, Math.trunc(boatTier)));
  const goldPer10 = manual ? EVENT2_SETTLEMENT_RATES.manual[tier] : EVENT2_SETTLEMENT_RATES.idle[tier];
  return {
    gold: Math.floor((score * goldPer10) / 10),
    fame: Math.floor((score * EVENT2_SETTLEMENT_RATES.fame) / 10),
  };
}

/** 이벤트 2 전용 도감 완성 시 새로 지급할 한정 모자 id 목록 */
export function nextUnlockedEventHats(
  dex: EventDexCounts,
  ownedHats: readonly string[],
): string[] {
  const unlocked: string[] = [];
  const allNormal = EVENT_FISH.every(f => (dex[f.id]?.normal ?? 0) > 0);
  if (allNormal && !ownedHats.includes(EVENT_HAT_IDS.normal)) {
    unlocked.push(EVENT_HAT_IDS.normal);
  }
  const allVariant = EVENT_FISH.every(f => (dex[f.id]?.variant ?? 0) > 0);
  if (allVariant && !ownedHats.includes(EVENT_HAT_IDS.variant)) {
    unlocked.push(EVENT_HAT_IDS.variant);
  }
  return unlocked;
}

/** 이벤트 2 표준 스펙 어종·폼 추첨 — 외부 보정과 낮·밤 없이 고정 등급 비중과 25% 변이를 쓴다 */
export function rollEvent2Catch(judgment: Judgment, rng: () => number): Event2CatchDraw {
  const [commonW, rareW, epicW, legendaryW] = EVENT2_STANDARD_SPEC.weights;
  const adjustedCommon = judgment === 'auto'
    ? commonW * EVENT2_STANDARD_SPEC.idleBoost
    : commonW / JUDGMENT_MULT[judgment];
  const gradeWeights: readonly (readonly [RarityId, number])[] = [
    [RARITY_ORDER[0], adjustedCommon],
    [RARITY_ORDER[1], rareW],
    [RARITY_ORDER[2], epicW],
    [RARITY_ORDER[3], legendaryW],
  ];
  const rarity = pickWeighted(gradeWeights, rng);
  const candidates = EVENT_FISH.filter(f => f.rarity === rarity);
  const fish = pickWeighted(candidates.map(f => [f, 1] as const), rng);
  const variantShare = EVENT2_STANDARD_SPEC.variantEv - 1;
  const form: FormId = rng() < variantShare ? 'variant' : 'normal';
  return {
    fish,
    form,
    score: computeEvent2CatchScore(fish, form),
  };
}
