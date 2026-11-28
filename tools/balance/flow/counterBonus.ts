// 카운터 임계점 연동 보너스 — JSON 스키마 검증과 시뮬레이션 진행 중 동적 누적 합산을 맡는다.
// 같은 대상에 걸리는 보너스 효과는 모두 합산해 (1 ± 합)으로 한 번만 적용한다.
import { readFileSync } from 'node:fs';
import { ARTIFACT_MAX_LEVEL, artifactById, artifactHasLevel, artifactLevelCost, artifactsOfZone } from '../../../src/game/content/artifacts';
import type { BountyZone } from '../../../src/game/content/bounties';
import { FISH } from '../../../src/game/content/fish';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { ZONE_IDS } from '../../../src/game/content/zones';
import { BIG_CATCH_PERCENTILE } from '../../../src/game/rules/balance';
import { mutationWeightsOf, variantShare } from '../../../src/game/rules/logic';
import { zoneOf } from '../model';
import type { Axis, Pool, Rates } from '../model';
import { NO_EFFECT, artifactSummaryOf, checkEffect, effectRates, parseArtifacts, resolveArtifactLevel, resolveZoneSpots, scaleSlotEffect } from './effects';
import type { ArtifactLevels, Effect, EffectRates } from './effects';
import type { RatePlan } from './progress';
import type { Catch } from './sample';

/** 고정 카운터 키 목록 */
export const STATIC_COUNTER_KEYS = [
  'manual.total',
  'manual.legendary.total',
  'manual.variant.total',
  'catch.auto',
  'catch.perfect',
  'catch.bait',
  'catch.lunch',
  'named.flawless',
  'sell.gold',
  'energy.spent',
  'bigSpecies',
  'maxArtifact',
] as const;

export type StaticCounterKey = (typeof STATIC_COUNTER_KEYS)[number];

/** 단계별 효과 — 비율 값(0.05 = +5% 또는 입질 대기 -5%). 모두 생략 가능 */
export interface CounterBonusEffect {
  bite?: number;
  rare?: number;
  epic?: number;
  legendary?: number;
  nightWeight?: number;
  variant?: number;
  big?: number;
  bagCap?: number;
  energyYield?: number;
  baitAmplify?: number;
  lunchAmplify?: number;
  size?: number;
  move?: number;
  sell?: number;
  named?: number;
  artifactBoost?: number;
  /** 지정하면 해당 구역 또는 해역에서만 효과가 적용된다 */
  zone?: string;
}

export interface CounterBonusRule {
  counter: string;
  thresholds: number[];
  effects: CounterBonusEffect[];
}

export interface CounterBonusConfig {
  /** (선택) 유물 효과 배율(artifactBoost)이 걸릴 보유 유물 레벨 맵 */
  artifacts?: ArtifactLevels;
  rules: CounterBonusRule[];
}

/** 시뮬레이션 중 임계점을 넘어 해금된 단계 기록 */
export interface CounterUnlock {
  counter: string;
  threshold: number;
  /** 해금 시각(누적 실질 낚시 시간, 시간) */
  hours: number;
  /** 해금 당시 낚던 해역 */
  spot: SpotId;
  effect: CounterBonusEffect;
}

const ALLOWED_TOP_KEYS = new Set(['artifacts', 'rules']);
const ALLOWED_RULE_KEYS = new Set(['counter', 'thresholds', 'effects']);
const ALLOWED_EFFECT_KEYS = new Set([
  'bite', 'rare', 'epic', 'legendary', 'nightWeight', 'variant', 'big', 'bagCap', 'energyYield', 'baitAmplify', 'lunchAmplify',
  'size', 'move', 'sell', 'named', 'artifactBoost', 'zone',
]);

const LEGENDARY_IDS = new Set(FISH.filter(f => f.rarity === 'legendary').map(f => f.id));
const ZONE_ID_SET = new Set<string>(ZONE_IDS);
const SEA_ZONE_ID_SET = new Set<string>(ZONE_IDS.filter(z => z !== 'village'));
const STATIC_KEY_SET = new Set<string>(STATIC_COUNTER_KEYS);
const BIG_PROB_BASE = BIG_CATCH_PERCENTILE / 100;

/** 레벨이 있는 유물을 교환(1)부터 최고 레벨(Lv5)까지 올리는 데 필요한 총 재료 수 */
const MAX_ARTIFACT_MATERIALS = 1 + Array.from(
  { length: ARTIFACT_MAX_LEVEL - 1 },
  (_, k) => artifactLevelCost(k + 2),
).reduce((a, b) => a + b, 0);

const clean = (x: number): number => Math.round(x * 1e9) / 1e9;

/** 지원하는 카운터 키인지 판정한다 — 기본 키, 구역·전설 어종 수동 손맛 키, 바다 구역 도감(수동+방치) 키 */
export function isValidCounterKey(key: string): boolean {
  if (STATIC_KEY_SET.has(key)) return true;
  if (key.startsWith('manual.total.')) return ZONE_ID_SET.has(key.slice('manual.total.'.length));
  if (key.startsWith('manual.variant.')) return ZONE_ID_SET.has(key.slice('manual.variant.'.length));
  if (key.startsWith('manual.legendary.')) {
    const rest = key.slice('manual.legendary.'.length);
    return ZONE_ID_SET.has(rest) || LEGENDARY_IDS.has(rest);
  }
  if (key.startsWith('dex.legendary.day.')) return SEA_ZONE_ID_SET.has(key.slice('dex.legendary.day.'.length));
  if (key.startsWith('dex.legendary.night.')) return SEA_ZONE_ID_SET.has(key.slice('dex.legendary.night.'.length));
  if (key.startsWith('dex.variant.')) return SEA_ZONE_ID_SET.has(key.slice('dex.variant.'.length));
  return false;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseArtifactsField(raw: unknown): ArtifactLevels {
  if (typeof raw === 'string') return parseArtifacts(raw);
  if (!isPlainObject(raw)) throw new Error('artifacts는 문자열(예: "all:5") 또는 유물id별 레벨 객체여야 합니다');
  const out: ArtifactLevels = {};
  for (const [id, lv] of Object.entries(raw)) {
    const art = artifactById(id);
    if (!art) throw new Error(`알 수 없는 유물입니다: ${id}`);
    if (typeof lv !== 'number') {
      throw new Error(`유물 레벨은 1에서 ${ARTIFACT_MAX_LEVEL} 사이의 정수여야 합니다: ${id}=${String(lv)}`);
    }
    out[id] = resolveArtifactLevel(art, lv, `${id}=${String(lv)}`);
  }
  return out;
}

function parseEffect(raw: unknown, ctx: string): CounterBonusEffect {
  if (!isPlainObject(raw)) throw new Error(`${ctx}: 효과는 객체여야 합니다`);
  const out: CounterBonusEffect = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ALLOWED_EFFECT_KEYS.has(k)) throw new Error(`${ctx}: 알 수 없는 효과 항목입니다: ${k}`);
    if (k === 'zone') {
      if (typeof v !== 'string') throw new Error(`${ctx}: zone은 문자열이어야 합니다`);
      resolveZoneSpots(v);
      out.zone = v;
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${ctx}: ${k}는 유한한 숫자여야 합니다`);
    if (k === 'bite') {
      if (!(v >= 0 && v < 1)) throw new Error(`${ctx}: 입질 대기 단축(bite)은 0 이상 1 미만이어야 합니다`);
      out.bite = v;
    } else if (
      k === 'rare' || k === 'epic' || k === 'legendary' || k === 'nightWeight'
      || k === 'variant' || k === 'big' || k === 'bagCap' || k === 'energyYield'
      || k === 'baitAmplify' || k === 'lunchAmplify' || k === 'named' || k === 'artifactBoost'
    ) {
      if (!(v >= 0)) throw new Error(`${ctx}: ${k}는 0 이상이어야 합니다`);
      out[k] = v;
    } else if (k === 'size' || k === 'move' || k === 'sell') {
      if (!(v > -1)) {
        const label = k === 'sell' ? '판매가 증가(sell)' : k === 'move' ? '이동 속도 증가(move)' : '크기 증가(size)';
        throw new Error(`${ctx}: ${label}는 -1보다 커야 합니다`);
      }
      out[k] = v;
    }
  }
  return out;
}

/** 미검증 JSON 값을 카운터 보너스 설정으로 파싱·검증한다 */
export function parseCounterBonus(raw: unknown): CounterBonusConfig {
  if (!isPlainObject(raw)) throw new Error('카운터 보너스 설정은 JSON 객체여야 합니다');
  for (const k of Object.keys(raw)) {
    if (!ALLOWED_TOP_KEYS.has(k)) throw new Error(`알 수 없는 최상위 항목입니다: ${k}`);
  }
  const artifacts = raw.artifacts !== undefined ? parseArtifactsField(raw.artifacts) : undefined;
  if (!Array.isArray(raw.rules) || raw.rules.length === 0) {
    throw new Error('rules는 1개 이상의 규칙 배열이어야 합니다');
  }
  const rules: CounterBonusRule[] = raw.rules.map((item, idx) => {
    const ctx = `rules[${idx}]`;
    if (!isPlainObject(item)) throw new Error(`${ctx}: 규칙은 객체여야 합니다`);
    for (const k of Object.keys(item)) {
      if (!ALLOWED_RULE_KEYS.has(k)) throw new Error(`${ctx}: 알 수 없는 규칙 항목입니다: ${k}`);
    }
    if (typeof item.counter !== 'string' || !isValidCounterKey(item.counter)) {
      throw new Error(`${ctx}: 알 수 없는 카운터 키입니다: ${String(item.counter)}`);
    }
    if (!Array.isArray(item.thresholds) || item.thresholds.length === 0) {
      throw new Error(`${ctx}: thresholds는 1개 이상의 숫자 배열이어야 합니다`);
    }
    const thresholds: number[] = [];
    for (let i = 0; i < item.thresholds.length; i++) {
      const t = item.thresholds[i];
      if (typeof t !== 'number' || !Number.isFinite(t) || !(t > 0)) {
        throw new Error(`${ctx}: 임계점은 0보다 큰 숫자여야 합니다: ${String(t)}`);
      }
      if (i > 0 && !(t > thresholds[i - 1])) {
        throw new Error(`${ctx}: 임계점 배열은 엄격한 오름차순이어야 합니다`);
      }
      thresholds.push(t);
    }
    if (!Array.isArray(item.effects) || item.effects.length !== thresholds.length) {
      throw new Error(`${ctx}: effects 배열의 길이는 thresholds 길이(${thresholds.length})와 같아야 합니다`);
    }
    const effects = item.effects.map((e, k) => parseEffect(e, `${ctx}.effects[${k}]`));
    return { counter: item.counter, thresholds, effects };
  });

  // 모든 단계가 해금됐을 때 해역별 누적 입질 대기 단축(< 1)과 sell/move/size 하한(> -1)을 사전 검증한다
  const zoneSpotCache = new Map<string, Set<SpotId>>();
  const spotsOfZone = (zone: string): Set<SpotId> => {
    let set = zoneSpotCache.get(zone);
    if (!set) {
      set = new Set<SpotId>(resolveZoneSpots(zone));
      zoneSpotCache.set(zone, set);
    }
    return set;
  };
  for (const sp of SPOTS) {
    let biteSum = 0, sellSum = 0, moveSum = 0, sizeSum = 0, boostSum = 0;
    for (const r of rules) {
      for (const e of r.effects) {
        if (e.zone === undefined || spotsOfZone(e.zone).has(sp.id)) {
          biteSum = clean(biteSum + (e.bite ?? 0));
          sellSum = clean(sellSum + (e.sell ?? 0));
          moveSum = clean(moveSum + (e.move ?? 0));
          sizeSum = clean(sizeSum + (e.size ?? 0));
          boostSum = clean(boostSum + (e.artifactBoost ?? 0));
        }
      }
    }
    if (artifacts) {
      const art = artifactSummaryOf(artifacts, boostSum);
      biteSum = clean(biteSum + art.bite);
      if (sp.boatTier >= 1 && art.sail > 0) moveSum = clean(moveSum + art.sail);
    }
    if (!(biteSum < 1)) {
      throw new Error(`누적 입질 대기 단축(${(biteSum * 100).toFixed(1)}%)이 100% 이상입니다(${sp.id})`);
    }
    if (!(sellSum > -1)) {
      throw new Error(`누적 판매가 증가(${(sellSum * 100).toFixed(1)}%)가 -100% 이하입니다(${sp.id})`);
    }
    if (!(moveSum > -1)) {
      throw new Error(`누적 이동 속도 증가(${(moveSum * 100).toFixed(1)}%)가 -100% 이하입니다(${sp.id})`);
    }
    if (!(sizeSum > -1)) {
      throw new Error(`누적 크기 증가(${(sizeSum * 100).toFixed(1)}%)가 -100% 이하입니다(${sp.id})`);
    }
  }

  return artifacts ? { artifacts, rules } : { rules };
}

/** 파일 경로에서 카운터 보너스 JSON을 읽어 검증한다 */
export function loadCounterBonus(filePath: string): CounterBonusConfig {
  const text = readFileSync(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`카운터 보너스 JSON 구문 오류: ${e instanceof Error ? e.message : String(e)}`);
  }
  return parseCounterBonus(parsed);
}

/** 시뮬레이션 중 카운터 누적과 임계점 해금·효과 합산을 관리하는 추적기 */
export interface CounterBonusTracker {
  /** 현재 해금된 단계 수에 따라 바뀌는 캐시 무효화 버전 */
  readonly version: number;
  /** 월척(bigSpecies) 또는 대어 보너스를 추적해야 하는가 */
  readonly needsBigTrack: boolean;
  /** 해금된 단계 목록(시간 순) */
  readonly unlocks: CounterUnlock[];
  /** 특정 해역에서 현재 누적 활성화된 효과·확률·보조 배율 */
  activeFor(spot: SpotId): {
    effect: Effect;
    bigProb: number;
    bagCap: number;
    energyYield: number;
    baitAmplify: number;
    lunchAmplify: number;
  };
  /** 현재 시점의 카운터 보너스를 고정한 RatePlan 스냅샷(정상 상태 계산용) */
  snapshotPlan(basePlan?: RatePlan): RatePlan;
  /** 표본 경로 캐치 1건 반영 */
  recordCatch(spot: SpotId, axis: Axis, c: Catch, baitActive: boolean, isBig: boolean, lunchActive?: boolean): void;
  /** 기댓값 경로 1스텝 반영 */
  recordStep(spot: SpotId, axis: Axis, r: Rates, catches: number, goldEarned: number, baitActive: boolean, lunchActive?: boolean): void;
  /** 네임드 토벌 1회 완료 반영(무결점 토벌 + 유물 재료 누적) */
  recordNamedClear(zone: BountyZone): void;
  /** 임계점 도달 여부를 검사해 새 보너스를 누적 활성화한다. 해금이 하나라도 있으면 true */
  evaluate(hours: number, spot: SpotId): boolean;
}

interface CompiledEffect {
  effect: CounterBonusEffect;
  spots: Set<SpotId> | null;
}

export function createCounterBonusTracker(config: CounterBonusConfig): CounterBonusTracker {
  const counters = new Map<string, number>();
  const bigSeen = new Set<string>();
  const bigLog = new Map<string, number>();
  let analyticBig = false;
  let version = 0;

  // 유물 보유 및 재료 추적 — 초기 보유 Lv5 유물과 전설 유물(Lv5 고정)을 maxArtifact에 반영
  const baseArtifacts: ArtifactLevels = config.artifacts ? { ...config.artifacts } : {};
  const maxedArtifacts = new Set<string>(
    Object.entries(baseArtifacts)
      .filter(([id, lv]) => {
        const a = artifactById(id);
        return a !== undefined && (!artifactHasLevel(a) || lv >= ARTIFACT_MAX_LEVEL);
      })
      .map(([id]) => id),
  );
  const namedMaterials = new Map<string, number>();
  for (const [id, lv] of Object.entries(baseArtifacts)) {
    if (maxedArtifacts.has(id)) continue;
    const a = artifactById(id);
    if (!a || !artifactHasLevel(a) || lv < 1) continue;
    const spent = 1 + Array.from({ length: lv - 1 }, (_, k) => artifactLevelCost(k + 2)).reduce((s, c) => s + c, 0);
    namedMaterials.set(id, spent);
  }
  if (maxedArtifacts.size > 0) counters.set('maxArtifact', maxedArtifacts.size);

  const needsBigTrack = config.rules.some(
    r => r.counter === 'bigSpecies' || r.effects.some(e => (e.big ?? 0) > 0),
  );

  // 각 규칙의 다음 미해금 단계 인덱스와 해역 범위 캐시
  const nextTier = config.rules.map(() => 0);
  const compiled: CompiledEffect[][] = config.rules.map(r =>
    r.effects.map(effect => ({
      effect,
      spots: effect.zone === undefined ? null : new Set<SpotId>(resolveZoneSpots(effect.zone)),
    })),
  );
  const activeCompiled: CompiledEffect[] = [];
  const unlocks: CounterUnlock[] = [];
  type ActiveSnapshot = ReturnType<CounterBonusTracker['activeFor']>;
  const effectCache = new Map<string, ActiveSnapshot>();

  const add = (key: string, delta: number) => {
    if (delta > 0) counters.set(key, (counters.get(key) ?? 0) + delta);
  };

  const currentBigSpecies = (): number => {
    if (!analyticBig) return bigSeen.size;
    let expected = 0;
    for (const logMiss of bigLog.values()) expected += 1 - Math.exp(logMiss);
    return expected;
  };

  const valueOf = (counter: string): number =>
    counter === 'bigSpecies' ? currentBigSpecies() : (counters.get(counter) ?? 0);

  const computeFor = (spot: SpotId, list: readonly CompiledEffect[]): ActiveSnapshot => {
    let bite = 0, rare = 0, epic = 0, legendary = 0, nightWeight = 0, variant = 0, big = 0;
    let bagCap = 0, energyYield = 0, baitAmplify = 0, lunchAmplify = 0;
    let size = 0, move = 0, sell = 0, named = 0, artifactBoost = 0;
    for (const item of list) {
      if (item.spots !== null && !item.spots.has(spot)) continue;
      const e = item.effect;
      if (e.bite) bite = clean(bite + e.bite);
      if (e.rare) rare = clean(rare + e.rare);
      if (e.epic) epic = clean(epic + e.epic);
      if (e.legendary) legendary = clean(legendary + e.legendary);
      if (e.nightWeight) nightWeight = clean(nightWeight + e.nightWeight);
      if (e.variant) variant = clean(variant + e.variant);
      if (e.big) big = clean(big + e.big);
      if (e.bagCap) bagCap = clean(bagCap + e.bagCap);
      if (e.energyYield) energyYield = clean(energyYield + e.energyYield);
      if (e.baitAmplify) baitAmplify = clean(baitAmplify + e.baitAmplify);
      if (e.lunchAmplify) lunchAmplify = clean(lunchAmplify + e.lunchAmplify);
      if (e.size) size = clean(size + e.size);
      if (e.move) move = clean(move + e.move);
      if (e.sell) sell = clean(sell + e.sell);
      if (e.named) named = clean(named + e.named);
      if (e.artifactBoost) artifactBoost = clean(artifactBoost + e.artifactBoost);
    }
    if (Object.keys(baseArtifacts).length > 0) {
      const art = artifactSummaryOf(baseArtifacts, artifactBoost);
      const isOcean = (SPOTS.find(s => s.id === spot)?.boatTier ?? 0) >= 1;
      bite = clean(bite + art.bite);
      variant = clean(variant + art.variant);
      if (isOcean && art.sail > 0) move = clean(move + art.sail);
    }
    const effect: Effect = {
      ...NO_EFFECT,
      bite, rare, epic, legendary, variant, size, move, named,
      ...(sell !== 0 ? { sell } : {}),
      ...(big !== 0 ? { big } : {}),
      ...(nightWeight !== 0 ? { nightWeight } : {}),
    };
    checkEffect(effect);
    const bigProb = Math.min(1, BIG_PROB_BASE * (1 + big));
    return { effect, bigProb, bagCap, energyYield, baitAmplify, lunchAmplify };
  };

  const activeFor = (spot: SpotId): ActiveSnapshot => {
    const key = `${version}:${spot}`;
    let cached = effectCache.get(key);
    if (!cached) {
      cached = computeFor(spot, activeCompiled);
      effectCache.set(key, cached);
    }
    return cached;
  };

  const hasEffect = (e: Effect): boolean =>
    e.bite !== 0 || e.rare !== 0 || e.epic !== 0 || e.legendary !== 0 || e.variant !== 0
    || e.size !== 0 || e.move !== 0 || e.named !== 0 || e.night !== 0
    || (e.sell ?? 0) !== 0 || (e.big ?? 0) !== 0 || (e.nightWeight ?? 0) !== 0;

  const mergeEffects = (a: Effect, b: Effect): Effect => {
    const sell = clean((a.sell ?? 0) + (b.sell ?? 0));
    const big = clean((a.big ?? 0) + (b.big ?? 0));
    const nightWeight = clean((a.nightWeight ?? 0) + (b.nightWeight ?? 0));
    const merged: Effect = {
      bite: clean(a.bite + b.bite),
      rare: clean(a.rare + b.rare),
      epic: clean(a.epic + b.epic),
      legendary: clean(a.legendary + b.legendary),
      variant: clean(a.variant + b.variant),
      size: clean(a.size + b.size),
      move: clean(a.move + b.move),
      named: clean(a.named + b.named),
      night: a.night > 0 || b.night > 0 ? 1 : 0,
      ...(sell !== 0 ? { sell } : {}),
      ...(big !== 0 ? { big } : {}),
      ...(nightWeight !== 0 ? { nightWeight } : {}),
    };
    checkEffect(merged);
    return merged;
  };

  return {
    get version() { return version; },
    needsBigTrack,
    unlocks,
    activeFor,
    snapshotPlan(basePlan?: RatePlan): RatePlan {
      const frozen = [...activeCompiled];
      return {
        rateFor: (spot: SpotId, level: number, axis: Axis, boat: number, pool: Pool = 'mixed'): Rates => {
          const snap = computeFor(spot, frozen);
          if (!basePlan) return hasEffect(snap.effect) ? effectRates(spot, level, axis, snap.effect, pool) : effectRates(spot, level, axis, NO_EFFECT, pool);
          const baseEffect = (basePlan as RatePlan & { effectAt?: (s: SpotId, lv: number, b: number) => Effect | null }).effectAt?.(spot, level, boat);
          if (baseEffect) {
            const amp = axis === 'idle' ? snap.lunchAmplify : snap.baitAmplify;
            return effectRates(spot, level, axis, mergeEffects(scaleSlotEffect(baseEffect, amp), snap.effect), pool);
          }
          return hasEffect(snap.effect) ? effectRates(spot, level, axis, snap.effect, pool) : basePlan.rateFor(spot, level, axis, boat, pool);
        },
        costPerHour: (spot, level, axis, boat) => (basePlan ? basePlan.costPerHour(spot, level, axis, boat) : 0),
      };
    },
    recordCatch(spot: SpotId, axis: Axis, c: Catch, baitActive: boolean, isBig: boolean, lunchActive = false) {
      const z = zoneOf(spot);
      add('sell.gold', c.gold);
      if (SEA_ZONE_ID_SET.has(z)) {
        if (c.fish.rarity === 'legendary') {
          add(c.fish.night ? `dex.legendary.night.${z}` : `dex.legendary.day.${z}`, 1);
        }
        if (c.variant) add(`dex.variant.${z}`, 1);
      }
      if (axis === 'idle') {
        add('catch.auto', 1);
        if (lunchActive) add('catch.lunch', 1);
      } else {
        add('manual.total', 1);
        add(`manual.total.${z}`, 1);
        if (axis === 'perfect') add('catch.perfect', 1);
        if (c.fish.rarity === 'legendary') {
          add('manual.legendary.total', 1);
          add(`manual.legendary.${z}`, 1);
          add(`manual.legendary.${c.fish.id}`, 1);
        }
        if (c.variant) {
          add('manual.variant.total', 1);
          add(`manual.variant.${z}`, 1);
        }
      }
      if (baitActive) add('catch.bait', 1);
      if (isBig) bigSeen.add(c.fish.id);
    },
    recordStep(spot: SpotId, axis: Axis, r: Rates, catches: number, goldEarned: number, baitActive: boolean, lunchActive = false) {
      const z = zoneOf(spot);
      add('sell.gold', goldEarned);
      const vShare = (r as Partial<EffectRates>).variantShare ?? variantShare(mutationWeightsOf({ artifacts: [] }, spot));
      if (SEA_ZONE_ID_SET.has(z)) {
        let dayLegShare = 0;
        let nightLegShare = 0;
        for (const row of r.rows) {
          if (row.fish.rarity === 'legendary') {
            if (row.fish.night) nightLegShare += row.prob;
            else dayLegShare += row.prob;
          }
        }
        if (dayLegShare > 0) add(`dex.legendary.day.${z}`, catches * dayLegShare);
        if (nightLegShare > 0) add(`dex.legendary.night.${z}`, catches * nightLegShare);
        if (vShare > 0) add(`dex.variant.${z}`, catches * vShare);
      }
      if (axis === 'idle') {
        add('catch.auto', catches);
        if (lunchActive) add('catch.lunch', catches);
      } else {
        add('manual.total', catches);
        add(`manual.total.${z}`, catches);
        if (axis === 'perfect') add('catch.perfect', catches);
        const legShare = r.rarity.legendary ?? 0;
        if (legShare > 0) {
          add('manual.legendary.total', catches * legShare);
          add(`manual.legendary.${z}`, catches * legShare);
          for (const row of r.rows) {
            if (row.fish.rarity === 'legendary') add(`manual.legendary.${row.fish.id}`, catches * row.prob);
          }
        }
        if (vShare > 0) {
          add('manual.variant.total', catches * vShare);
          add(`manual.variant.${z}`, catches * vShare);
        }
      }
      if (baitActive) add('catch.bait', catches);
      if (needsBigTrack) {
        analyticBig = true;
        const { bigProb } = activeFor(spot);
        for (const row of r.rows) {
          const p = row.prob * bigProb;
          if (p > 0) bigLog.set(row.fish.id, (bigLog.get(row.fish.id) ?? 0) + catches * Math.log1p(-p));
        }
      }
    },
    recordNamedClear(zone: BountyZone) {
      add('named.flawless', 1);
      const zoneArts = artifactsOfZone(zone);
      for (const art of zoneArts) {
        if (maxedArtifacts.has(art.id)) continue;
        const needed = artifactHasLevel(art) ? MAX_ARTIFACT_MATERIALS : 1;
        const count = (namedMaterials.get(art.id) ?? 0) + 1;
        namedMaterials.set(art.id, count);
        if (count >= needed) {
          maxedArtifacts.add(art.id);
          counters.set('maxArtifact', maxedArtifacts.size);
        }
        break;
      }
    },
    evaluate(hours: number, spot: SpotId): boolean {
      let changed = false;
      for (let i = 0; i < config.rules.length; i++) {
        const rule = config.rules[i];
        const val = valueOf(rule.counter);
        while (nextTier[i] < rule.thresholds.length && val >= rule.thresholds[nextTier[i]]) {
          const k = nextTier[i]++;
          activeCompiled.push(compiled[i][k]);
          unlocks.push({
            counter: rule.counter,
            threshold: rule.thresholds[k],
            hours,
            spot,
            effect: rule.effects[k],
          });
          changed = true;
        }
      }
      if (changed) {
        version += 1;
        effectCache.clear();
      }
      return changed;
    },
  };
}
