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
import { NO_EFFECT, artifactSummaryOf, checkEffect, effectRates, parseArtifacts, resolveZoneSpots } from './effects';
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
  'named.flawless',
  'sell.gold',
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
  variant?: number;
  big?: number;
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
  'bite', 'rare', 'epic', 'legendary', 'variant', 'big', 'size', 'move', 'sell', 'named', 'artifactBoost', 'zone',
]);

const LEGENDARY_IDS = new Set(FISH.filter(f => f.rarity === 'legendary').map(f => f.id));
const ZONE_ID_SET = new Set<string>(ZONE_IDS);
const STATIC_KEY_SET = new Set<string>(STATIC_COUNTER_KEYS);
const BIG_PROB_BASE = BIG_CATCH_PERCENTILE / 100;

/** 레벨이 있는 유물을 교환(1)부터 최고 레벨(Lv5)까지 올리는 데 필요한 총 재료 수 */
const MAX_ARTIFACT_MATERIALS = 1 + Array.from(
  { length: ARTIFACT_MAX_LEVEL - 1 },
  (_, k) => artifactLevelCost(k + 2),
).reduce((a, b) => a + b, 0);

const clean = (x: number): number => Math.round(x * 1e9) / 1e9;

/** 지원하는 카운터 키인지 판정한다 — 기본 키와 구역·전설 어종 수동 손맛 키 */
export function isValidCounterKey(key: string): boolean {
  if (STATIC_KEY_SET.has(key)) return true;
  if (key.startsWith('manual.total.')) return ZONE_ID_SET.has(key.slice('manual.total.'.length));
  if (key.startsWith('manual.variant.')) return ZONE_ID_SET.has(key.slice('manual.variant.'.length));
  if (key.startsWith('manual.legendary.')) {
    const rest = key.slice('manual.legendary.'.length);
    return ZONE_ID_SET.has(rest) || LEGENDARY_IDS.has(rest);
  }
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
    if (typeof lv !== 'number' || !Number.isInteger(lv) || lv < 1 || lv > ARTIFACT_MAX_LEVEL) {
      throw new Error(`유물 레벨은 1에서 ${ARTIFACT_MAX_LEVEL} 사이의 정수여야 합니다: ${id}=${String(lv)}`);
    }
    if (!artifactHasLevel(art) && lv > 1) throw new Error(`전설 유물은 레벨이 없습니다(Lv1 고정): ${id}`);
    out[id] = lv;
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
    } else if (k === 'rare' || k === 'epic' || k === 'legendary' || k === 'variant' || k === 'big' || k === 'named' || k === 'artifactBoost') {
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

  // 모든 단계가 해금됐을 때 해역별 누적 입질 대기 단축이 1(100%) 이상이 되지 않는지 사전 검증한다
  const allBoost = rules.reduce((s, r) => s + r.effects.reduce((a, e) => a + (e.artifactBoost ?? 0), 0), 0);
  const artBiteMax = artifacts ? artifactSummaryOf(artifacts, allBoost).bite : 0;
  for (const sp of SPOTS) {
    let biteSum = artBiteMax;
    for (const r of rules) {
      for (const e of r.effects) {
        if (e.zone === undefined || resolveZoneSpots(e.zone).includes(sp.id)) {
          biteSum = clean(biteSum + (e.bite ?? 0));
        }
      }
    }
    if (!(biteSum < 1)) {
      throw new Error(`누적 입질 대기 단축(${(biteSum * 100).toFixed(1)}%)이 100% 이상입니다(${sp.id})`);
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
  /** 특정 해역에서 현재 누적 활성화된 효과와 월척 확률 */
  activeFor(spot: SpotId): { effect: Effect; bigProb: number };
  /** 현재 시점의 카운터 보너스를 고정한 RatePlan 스냅샷(정상 상태 계산용) */
  snapshotPlan(basePlan?: RatePlan): RatePlan;
  /** 표본 경로 캐치 1건 반영 */
  recordCatch(spot: SpotId, axis: Axis, c: Catch, baitActive: boolean, isBig: boolean): void;
  /** 기댓값 경로 1스텝 반영 */
  recordStep(spot: SpotId, axis: Axis, r: Rates, catches: number, goldEarned: number, baitActive: boolean): void;
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

  // 유물 보유 및 재료 추적 — 초기 보유 Lv5 유물을 maxArtifact에 반영
  const baseArtifacts: ArtifactLevels = config.artifacts ? { ...config.artifacts } : {};
  const maxedArtifacts = new Set<string>(
    Object.entries(baseArtifacts)
      .filter(([id, lv]) => {
        const a = artifactById(id);
        return a !== undefined && artifactHasLevel(a) && lv >= ARTIFACT_MAX_LEVEL;
      })
      .map(([id]) => id),
  );
  const namedMaterials = new Map<string, number>();
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
  const effectCache = new Map<string, { effect: Effect; bigProb: number }>();

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

  const computeFor = (spot: SpotId, list: readonly CompiledEffect[]): { effect: Effect; bigProb: number } => {
    let bite = 0, rare = 0, epic = 0, legendary = 0, variant = 0, big = 0, size = 0, move = 0, sell = 0, named = 0, artifactBoost = 0;
    for (const item of list) {
      if (item.spots !== null && !item.spots.has(spot)) continue;
      const e = item.effect;
      if (e.bite) bite = clean(bite + e.bite);
      if (e.rare) rare = clean(rare + e.rare);
      if (e.epic) epic = clean(epic + e.epic);
      if (e.legendary) legendary = clean(legendary + e.legendary);
      if (e.variant) variant = clean(variant + e.variant);
      if (e.big) big = clean(big + e.big);
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
    };
    checkEffect(effect);
    const bigProb = Math.min(1, BIG_PROB_BASE * (1 + big));
    return { effect, bigProb };
  };

  const activeFor = (spot: SpotId): { effect: Effect; bigProb: number } => {
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
    || (e.sell ?? 0) !== 0 || (e.big ?? 0) !== 0;

  const mergeEffects = (a: Effect, b: Effect): Effect => {
    const sell = clean((a.sell ?? 0) + (b.sell ?? 0));
    const big = clean((a.big ?? 0) + (b.big ?? 0));
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
          const { effect } = computeFor(spot, frozen);
          if (!basePlan) return hasEffect(effect) ? effectRates(spot, level, axis, effect, pool) : effectRates(spot, level, axis, NO_EFFECT, pool);
          const baseEffect = (basePlan as RatePlan & { effectAt?: (s: SpotId, lv: number, b: number) => Effect | null }).effectAt?.(spot, level, boat);
          if (baseEffect) return effectRates(spot, level, axis, mergeEffects(baseEffect, effect), pool);
          return hasEffect(effect) ? effectRates(spot, level, axis, effect, pool) : basePlan.rateFor(spot, level, axis, boat, pool);
        },
        costPerHour: (spot, level, axis, boat) => (basePlan ? basePlan.costPerHour(spot, level, axis, boat) : 0),
      };
    },
    recordCatch(spot: SpotId, axis: Axis, c: Catch, baitActive: boolean, isBig: boolean) {
      add('sell.gold', c.gold);
      if (axis === 'idle') {
        add('catch.auto', 1);
      } else {
        const z = zoneOf(spot);
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
    recordStep(spot: SpotId, axis: Axis, r: Rates, catches: number, goldEarned: number, baitActive: boolean) {
      add('sell.gold', goldEarned);
      if (axis === 'idle') {
        add('catch.auto', catches);
      } else {
        const z = zoneOf(spot);
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
        const vShare = (r as Partial<EffectRates>).variantShare ?? variantShare(mutationWeightsOf({ artifacts: [] }, spot));
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
      const levelables = artifactsOfZone(zone).filter(a => artifactHasLevel(a));
      for (const art of levelables) {
        if (maxedArtifacts.has(art.id)) continue;
        const count = (namedMaterials.get(art.id) ?? 0) + 1;
        namedMaterials.set(art.id, count);
        if (count >= MAX_ARTIFACT_MATERIALS) {
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
