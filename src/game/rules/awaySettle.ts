// 방치 구간 순수 정산 엔진 — 주어진 시간 구간의 어획을 기대 캐치 주기로 분할해 결정적으로 시뮬레이션한다.
// React·플랫폼·DB 의존 없이 기존 규칙 함수(applyAction·biteWaitOf·summarizeAway 등)만 조합한다.
import { recipeById } from '../content/cooking.js';
import type { SpotId } from '../content/spots.js';
import { achievementBonusesOf } from './achievements.js';
import { applyAction } from './actions.js';
import type { ActionDeps, ApplyOutcome } from './actions.js';
import { summarizeAway } from './away.js';
import type { AwayEvent, AwaySummary } from './away.js';
import { CATCH_MS } from './balance.js';
import { biteWaitOf, createPlayerContext } from './effects.js';
import type { AchievementBonuses } from './effects.js';
import { NO_GUILD_EFFECTS } from './guild.js';
import type { GuildEffects } from './guild.js';
import { rodStats } from './logic.js';
import type { GameState } from './logic.js';
import { RARITY_ORDER } from '../content/rarity.js';
import type { RarityId } from '../content/rarity.js';
import { canFish } from './rules.js';
import type { BountyCtx } from './rules.js';
import { gameDayOf } from './time.js';

const HOUR_MS = 60 * 60 * 1000;

/** 기본 최대 정산 구간 상한(24시간) */
export const DEFAULT_MAX_IDLE_WINDOW_MS = 24 * HOUR_MS;

export interface IdleCycleContext {
  state: GameState;
  spotId: SpotId;
  atMs: number;
  atIso: string;
  guild: GuildEffects;
  achievements: AchievementBonuses;
}

/** 향후 방치 기본화·확률 개편 시 정산 규칙만 교체할 수 있는 선택적 주입 포인트 */
export interface IdleSettleRules {
  /** 도시락 슬롯 활성 필수 여부 (기본 true) */
  requireLunchbox?: boolean;
  /** 기대 캐치 주기(ms) 오버라이드 */
  cycleMs?: number | ((ctx: IdleCycleContext) => number);
  /** 어획 추첨 보정 배수 오버라이드 */
  integrityModifier?: number | ((ctx: IdleCycleContext) => number);
  /** 단일 자동 어획 실행기 오버라이드 (기본: applyAction catch auto) */
  runCatch?: (state: GameState, spotId: SpotId, deps: ActionDeps) => ApplyOutcome;
}

export interface SettleIdleWindowInput {
  state: GameState;
  spotId: SpotId;
  fromMs: number;
  toMs: number;
  seed: number | string;
  /** 도시락 만료 시각(ms). 생략 시 상태의 활성 도시락 슬롯에서 파생한다 */
  lunchboxExpiresAtMs?: number | null;
  /** 최대 정산 구간 길이(ms). 기본 24시간 */
  maxWindowMs?: number;
  guild?: GuildEffects | null;
  bounty?: BountyCtx | null;
  guest?: boolean;
  integrityModifier?: number;
  newUid?: (index: number, atIso: string) => string;
  rules?: IdleSettleRules;
}

export interface IdleSettleResult {
  nextState: GameState;
  catches: number;
  autoExtracted: number;
  autoReleased: number;
  summary: AwaySummary;
  events: AwayEvent[];
  settledAtMs: number;
  settledMs: number;
}

function hashSeed(seed: number | string): number {
  const str = typeof seed === 'number' ? String(seed) : seed;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 시드 기반 결정적 [0, 1) 난수 생성기 */
export function createSeededRng(seed: number | string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveLunchboxExpiresAtMs(state: GameState, override?: number | null): number | null {
  if (override !== undefined) {
    return typeof override === 'number' && Number.isFinite(override) ? override : null;
  }
  const lunch = state.slots.lunch;
  if (!lunch || recipeById(lunch.id)?.kind !== 'lunch') return null;
  const parsed = Date.parse(lunch.endsAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultIdleCycleMs(
  state: GameState,
  spotId: SpotId,
  atIso: string,
  guild: GuildEffects,
  achievements: AchievementBonuses,
): number {
  const ctx = createPlayerContext({ state, guild, now: atIso, achievements });
  const wait = biteWaitOf(ctx, spotId, 'idle');
  const meanWaitSec = (wait.min.value + wait.max.value) / 2;
  const sweepSec = rodStats(state.rod).sweep;
  return Math.max(1000, Math.round((meanWaitSec + sweepSec) * 1000 + CATCH_MS));
}

function emptySummary(fromMs: number, settledAtMs: number): AwaySummary {
  const fromIso = Number.isFinite(fromMs) ? new Date(fromMs).toISOString() : new Date(0).toISOString();
  const toIso = Number.isFinite(settledAtMs) ? new Date(settledAtMs).toISOString() : fromIso;
  const energy = Object.fromEntries(RARITY_ORDER.map(r => [r, 0])) as Record<RarityId, number>;
  return {
    from: fromIso,
    to: toIso,
    awayMs: 0,
    catches: 0,
    value: 0,
    fame: 0,
    perHour: { catches: 0, value: 0, fame: 0 },
    grades: RARITY_ORDER.map(rarity => ({ rarity, count: 0, share: 0 })),
    variants: { count: 0, share: 0 },
    newFish: [],
    released: { count: 0, value: 0 },
    extracted: { count: 0, energy },
    bagFullAfterMs: null,
    spot: null,
  };
}

function emptyResult(state: GameState, fromMs: number): IdleSettleResult {
  const safeFrom = Number.isFinite(fromMs) ? fromMs : 0;
  return {
    nextState: state,
    catches: 0,
    autoExtracted: 0,
    autoReleased: 0,
    summary: emptySummary(safeFrom, safeFrom),
    events: [],
    settledAtMs: safeFrom,
    settledMs: 0,
  };
}

function defaultRunCatch(state: GameState, spotId: SpotId, deps: ActionDeps): ApplyOutcome {
  return applyAction(state, { type: 'catch', spot: spotId, judgment: 'auto' }, deps);
}

/**
 * 자리 비움(방치) 구간을 기대 캐치 주기로 분할해 결정적으로 정산한다.
 * 구간 유효성·도시락 만료·최대 정산 상한(기본 24시간)을 적용한 뒤, 각 어획 시각의 낮/밤과 가방 초과를 시뮬레이션한다.
 */
export function settleIdleWindow(input: SettleIdleWindowInput): IdleSettleResult {
  const { state, spotId, fromMs, toMs, seed, rules } = input;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return emptyResult(state, fromMs);
  }

  const maxWindowMs = input.maxWindowMs ?? DEFAULT_MAX_IDLE_WINDOW_MS;
  if (!Number.isFinite(maxWindowMs) || maxWindowMs <= 0) {
    return emptyResult(state, fromMs);
  }

  const requireLunchbox = rules?.requireLunchbox ?? true;
  const lunchExpiresMs = resolveLunchboxExpiresAtMs(state, input.lunchboxExpiresAtMs);
  if (requireLunchbox && (lunchExpiresMs === null || lunchExpiresMs <= fromMs)) {
    return emptyResult(state, fromMs);
  }

  const cappedEndMs = Math.min(toMs, fromMs + maxWindowMs);
  const effectiveEndMs = requireLunchbox && lunchExpiresMs !== null
    ? Math.min(cappedEndMs, lunchExpiresMs)
    : cappedEndMs;

  if (effectiveEndMs <= fromMs) {
    return emptyResult(state, fromMs);
  }

  if (!canFish(state, spotId).ok) {
    return emptyResult(state, fromMs);
  }

  const guild = input.guild ?? NO_GUILD_EFFECTS;
  const rng = createSeededRng(seed);
  const seedTag = hashSeed(seed).toString(36);
  const uidFactory = input.newUid ?? ((index: number) => `away-${seedTag}-${index}`);
  const runCatch = rules?.runCatch ?? defaultRunCatch;

  let currentState = state;
  let cursorMs = fromMs;
  let catchIndex = 0;
  let catches = 0;
  let autoExtracted = 0;
  let autoReleased = 0;
  const events: AwayEvent[] = [];

  while (cursorMs < effectiveEndMs) {
    const cursorIso = new Date(cursorMs).toISOString();
    const achievements = achievementBonusesOf(currentState);
    const cycleCtx: IdleCycleContext = {
      state: currentState,
      spotId,
      atMs: cursorMs,
      atIso: cursorIso,
      guild,
      achievements,
    };

    const rawCycleMs = typeof rules?.cycleMs === 'function'
      ? rules.cycleMs(cycleCtx)
      : (rules?.cycleMs ?? defaultIdleCycleMs(currentState, spotId, cursorIso, guild, achievements));
    const stepMs = Number.isFinite(rawCycleMs) ? Math.max(1, Math.floor(rawCycleMs)) : 1000;

    const catchAtMs = cursorMs + stepMs;
    if (catchAtMs > effectiveEndMs) break;
    if (requireLunchbox && lunchExpiresMs !== null && catchAtMs >= lunchExpiresMs) break;

    const catchIso = new Date(catchAtMs).toISOString();
    const integrity = typeof rules?.integrityModifier === 'function'
      ? rules.integrityModifier({ ...cycleCtx, atMs: catchAtMs, atIso: catchIso })
      : (rules?.integrityModifier ?? input.integrityModifier);

    const deps: ActionDeps = {
      rng,
      today: gameDayOf(catchIso),
      now: catchIso,
      newUid: () => uidFactory(catchIndex, catchIso),
      bounty: input.bounty ?? null,
      guild,
      guest: input.guest === true,
      ...(integrity !== undefined ? { integrityModifier: integrity } : {}),
    };

    const out = runCatch(currentState, spotId, deps);
    if (!out.ok) break;

    currentState = out.state;
    catches += 1;
    if (out.result.type === 'catch') {
      autoReleased += out.result.released.length;
      autoExtracted += out.result.extracted?.length ?? 0;
    }
    for (const ev of out.events) {
      events.push({ type: ev.type, at: catchIso, payload: ev.payload });
    }

    cursorMs = catchAtMs;
    catchIndex += 1;
  }

  const settledAtMs = effectiveEndMs;
  const settledMs = settledAtMs - fromMs;
  const summary = summarizeAway(events, {
    from: new Date(fromMs).toISOString(),
    to: new Date(settledAtMs).toISOString(),
    awayMs: settledMs,
  });

  return {
    nextState: currentState,
    catches,
    autoExtracted,
    autoReleased,
    summary,
    events,
    settledAtMs,
    settledMs,
  };
}
