// 방치 구간 순수 정산 엔진 — 주어진 시간 구간의 어획을 기대 캐치 주기로 분할해 결정적으로 시뮬레이션한다.
// React·플랫폼·DB 의존 없이 기존 규칙 함수(applyAction·biteWaitOf·summarizeAway·diffWrites 등)만 조합한다.
import { bountyById } from '../content/bounties.js';
import { recipeById } from '../content/cooking.js';
import { FISH } from '../content/fish.js';
import type { AchievementCounters } from '../content/achievements.js';
import { RARITY_ORDER } from '../content/rarity.js';
import type { RarityId } from '../content/rarity.js';
import type { SpotId } from '../content/spots.js';
import { achievementBonusesOf, counterIncrementsForEvents } from './achievements.js';
import { applyAction, diffWrites } from './actions.js';
import type { ActionDeps, ApplyOutcome, GameEvent, StateWrites } from './actions.js';
import { summarizeAway } from './away.js';
import type { AwayEvent, AwaySettleEventPayload, AwaySummary } from './away.js';
import { CATCH_MS } from './balance.js';
import { biteWaitOf, createPlayerContext } from './effects.js';
import type { AchievementBonuses } from './effects.js';
import type { DailyFortune } from './fortune.js';
import { NO_GUILD_EFFECTS } from './guild.js';
import type { GuildEffects, GuildLogKind } from './guild.js';
import { matchBountyCatch, rodStats } from './logic.js';
import type { GameState } from './logic.js';
import { canFish } from './rules.js';
import type { BountyCtx } from './rules.js';
import { gameDayOf } from './time.js';

const HOUR_MS = 60 * 60 * 1000;

/** 기본 최대 정산 구간 상한(20시간) */
export const DEFAULT_MAX_IDLE_WINDOW_MS = 20 * HOUR_MS;

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
  /** 도시락 슬롯 활성 필수 여부 (기본 false — 도시락 없이도 방치 가능) */
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
  /** 최대 정산 구간 길이(ms). 기본 20시간 */
  maxWindowMs?: number;
  guild?: GuildEffects | null;
  bounty?: BountyCtx | null;
  guest?: boolean;
  integrityModifier?: number;
  newUid?: (index: number, atIso: string) => string;
  rules?: IdleSettleRules;
}

export interface IdleSettleCommitData {
  fameDelta: number;
  goldDelta: number;
  /** 네임드 도전권 발급 목록 — 같은 questId는 마지막 추정 포획 시각(issuedAt)을 유지한다 */
  ticketQuests: { questId: string; issuedAt: string }[];
  /** 일반 의뢰별 누적 진행 증가량 */
  bountyMatches: Record<string, number>;
  /** 업적 카운터 누적 증분 */
  achievementDeltas: AchievementCounters;
  /** 길드 명성 기여 증가량 */
  guildFameDelta: number;
  /** 전설 포획 항해일지 항목 */
  guildLogs: { kind: GuildLogKind; detail: string; at: string }[];
  /** 트리오 이벤트 집계용 포획 카운트 */
  trioCatches: { fishId: string; form: 'normal' | 'variant'; count: number; lastAt: string }[];
  /** 정산 중 게임 날짜 경계를 넘며 확정된 일일 운세 목록 */
  fortunes: DailyFortune[];
}

export interface IdleSettleResult {
  nextState: GameState;
  catches: number;
  autoExtracted: number;
  autoReleased: number;
  summary: AwaySummary;
  events: AwayEvent[];
  writes: StateWrites;
  compactEvent: AwaySettleEventPayload;
  commitData: IdleSettleCommitData;
  settledAtMs: number;
  settledMs: number;
}

const EMPTY_WRITES: StateWrites = {
  instancesAdded: [],
  instancesRemoved: [],
  instancesMoved: [],
  instancesLocked: [],
  records: [],
};

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

function buildCompactEvent(spotId: SpotId, summary: AwaySummary): AwaySettleEventPayload {
  const grades = Object.fromEntries(RARITY_ORDER.map(r => [r, 0])) as Record<RarityId, number>;
  for (const g of summary.grades) grades[g.rarity] = g.count;
  const bagFullAt = summary.bagFullAfterMs !== null
    ? new Date(Date.parse(summary.from) + summary.bagFullAfterMs).toISOString()
    : null;
  return {
    spot: summary.spot ?? spotId,
    from: summary.from,
    to: summary.to,
    awayMs: summary.awayMs,
    catches: summary.catches,
    value: summary.value,
    fame: summary.fame,
    grades,
    variants: summary.variants.count,
    newFish: summary.newFish,
    released: summary.released,
    extracted: summary.extracted,
    bagFullAt,
  };
}

function emptyCommitData(): IdleSettleCommitData {
  return {
    fameDelta: 0,
    goldDelta: 0,
    ticketQuests: [],
    bountyMatches: {},
    achievementDeltas: {},
    guildFameDelta: 0,
    guildLogs: [],
    trioCatches: [],
    fortunes: [],
  };
}

function emptyResult(state: GameState, spotId: SpotId, fromMs: number): IdleSettleResult {
  const safeFrom = Number.isFinite(fromMs) ? fromMs : 0;
  const summary = emptySummary(safeFrom, safeFrom);
  return {
    nextState: state,
    catches: 0,
    autoExtracted: 0,
    autoReleased: 0,
    summary,
    events: [],
    writes: EMPTY_WRITES,
    compactEvent: buildCompactEvent(spotId, summary),
    commitData: emptyCommitData(),
    settledAtMs: safeFrom,
    settledMs: 0,
  };
}

function defaultRunCatch(state: GameState, spotId: SpotId, deps: ActionDeps): ApplyOutcome {
  return applyAction(state, { type: 'catch', spot: spotId, judgment: 'auto' }, deps);
}

/**
 * 자리 비움(방치) 구간을 기대 캐치 주기로 분할해 결정적으로 정산한다.
 * 구간 유효성·강태공 선수권 대회 제외·최대 정산 상한(기본 20시간)을 적용한 뒤,
 * 각 포획 추정 시각의 버프·운세·낮/밤·가방 초과·도전권을 시뮬레이션하고 DB diff 커밋 데이터를 함께 반환한다.
 */
export function settleIdleWindow(input: SettleIdleWindowInput): IdleSettleResult {
  const { state, spotId, fromMs, toMs, seed, rules } = input;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return emptyResult(state, spotId, fromMs);
  }
  // 경품 경쟁 구역(강태공 선수권 대회)은 일반 방치 서버 큐 정산에서 제외한다
  if (spotId === 'championship') {
    return emptyResult(state, spotId, fromMs);
  }

  const maxWindowMs = input.maxWindowMs ?? DEFAULT_MAX_IDLE_WINDOW_MS;
  if (!Number.isFinite(maxWindowMs) || maxWindowMs <= 0) {
    return emptyResult(state, spotId, fromMs);
  }

  const requireLunchbox = rules?.requireLunchbox ?? false;
  const lunchExpiresMs = resolveLunchboxExpiresAtMs(state, input.lunchboxExpiresAtMs);
  if (requireLunchbox && (lunchExpiresMs === null || lunchExpiresMs <= fromMs)) {
    return emptyResult(state, spotId, fromMs);
  }

  const cappedEndMs = Math.min(toMs, fromMs + maxWindowMs);
  const effectiveEndMs = requireLunchbox && lunchExpiresMs !== null
    ? Math.min(cappedEndMs, lunchExpiresMs)
    : cappedEndMs;

  if (effectiveEndMs <= fromMs) {
    return emptyResult(state, spotId, fromMs);
  }

  if (!canFish(state, spotId).ok) {
    return emptyResult(state, spotId, fromMs);
  }

  const guild = input.guild ?? NO_GUILD_EFFECTS;
  const rng = createSeededRng(seed);
  const seedTag = hashSeed(seed).toString(36);
  const uidFactory = input.newUid ?? ((index: number) => `away-${seedTag}-${index}`);
  const runCatch = rules?.runCatch ?? defaultRunCatch;
  const activeGeneralQuests = (input.bounty?.active ?? [])
    .map(id => bountyById(id))
    .filter((q): q is NonNullable<ReturnType<typeof bountyById>> => Boolean(q && q.difficulty !== 'named'));

  let currentState = state;
  let cursorMs = fromMs;
  let catchIndex = 0;
  let catches = 0;
  let autoExtracted = 0;
  let autoReleased = 0;
  const events: AwayEvent[] = [];
  const rawGameEvents: GameEvent[] = [];
  const ticketMap = new Map<string, string>();
  const bountyMatches: Record<string, number> = {};
  const guildLogs: { kind: GuildLogKind; detail: string; at: string }[] = [];
  const trioMap = new Map<string, { fishId: string; form: 'normal' | 'variant'; count: number; lastAt: string }>();
  const fortuneMap = new Map<string, DailyFortune>();
  const initialFortuneDay = state.fortune?.day ?? null;

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

    const prevFortuneDay = currentState.fortune?.day ?? null;
    const out = runCatch(currentState, spotId, deps);
    if (!out.ok) break;

    currentState = out.state;
    if (currentState.fortune && currentState.fortune.day !== prevFortuneDay && currentState.fortune.day !== initialFortuneDay) {
      fortuneMap.set(currentState.fortune.day, currentState.fortune);
    }

    catches += 1;
    if (out.result.type === 'catch') {
      autoReleased += out.result.released.length;
      autoExtracted += out.result.extracted?.length ?? 0;
    }

    for (const ev of out.events) {
      rawGameEvents.push(ev);
      events.push({ type: ev.type, at: catchIso, payload: ev.payload });
      const p = ev.payload as { fishId?: unknown; form?: unknown; spot?: unknown; questId?: unknown };
      if (ev.type === 'ticket' && typeof p.questId === 'string' && bountyById(p.questId)) {
        ticketMap.set(p.questId, catchIso);
      } else if (ev.type === 'catch' && typeof p.fishId === 'string') {
        const caughtForm = p.form === 'variant' ? 'variant' : 'normal';
        const fishDef = FISH.find(f => f.id === p.fishId);
        if (fishDef?.rarity === 'legendary') {
          guildLogs.push({
            kind: 'legendary',
            detail: caughtForm === 'variant' ? `${p.fishId}|variant` : p.fishId,
            at: catchIso,
          });
        }
        for (const q of activeGeneralQuests) {
          if (matchBountyCatch(q, spotId, p.fishId)) {
            bountyMatches[q.id] = (bountyMatches[q.id] ?? 0) + 1;
          }
        }
        const trioKey = `${p.fishId}:${caughtForm}`;
        const prevTrio = trioMap.get(trioKey);
        if (prevTrio) {
          prevTrio.count += 1;
          prevTrio.lastAt = catchIso;
        } else {
          trioMap.set(trioKey, { fishId: p.fishId, form: caughtForm, count: 1, lastAt: catchIso });
        }
      }
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
  const writes = catches > 0 ? diffWrites(state, currentState) : EMPTY_WRITES;
  const compactEvent = buildCompactEvent(spotId, summary);
  const fameDelta = currentState.fame - state.fame;
  const goldDelta = currentState.gold - state.gold;

  return {
    nextState: currentState,
    catches,
    autoExtracted,
    autoReleased,
    summary,
    events,
    writes,
    compactEvent,
    commitData: {
      fameDelta,
      goldDelta,
      ticketQuests: [...ticketMap].map(([questId, issuedAt]) => ({ questId, issuedAt })),
      bountyMatches,
      achievementDeltas: counterIncrementsForEvents(rawGameEvents),
      guildFameDelta: Math.max(0, fameDelta),
      guildLogs,
      trioCatches: [...trioMap.values()],
      fortunes: [...fortuneMap.values()],
    },
    settledAtMs,
    settledMs,
  };
}
