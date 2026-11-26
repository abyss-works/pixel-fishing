// 운세 — 하루(게임 날짜, KST 04:00 경계) 하나의 행운 보너스. 페널티는 없다.
// 21종 카탈로그·내부 3등급 다중 추첨·10개 보너스 채널(마지막 독립 곱연산)의 규칙 테스트다.
import { describe, it, expect } from 'vitest';
import { applyAction, catchDrawOptions } from './actions';
import type { ActionDeps } from './actions';
import { summarizeAway } from './away';
import type { AwayEvent } from './away';
import { NO_ACHIEVEMENT_BONUSES, biteWaitOf, createPlayerContext, saleProceedsOf } from './effects';
import { NO_GUILD_EFFECTS } from './guild';
import {
  FORTUNE_CATALOG, FORTUNE_TIER_WEIGHTS,
  activePotionsOf, computeFortuneScore, ensureFortune, fortuneEffectMultOf, fortuneEffectsOf,
  fortuneEntryOf, fortuneKeyOf, fortuneOf, fortuneScoreOf, fortuneScoreRange,
  luckMultOf, potionLuckMultOf, rollFortune, safeFortune, totalLuckMultOf,
} from './fortune';
import type { DailyFortune, FortuneKind, FortuneTarget } from './fortune';
import { energyGain, planOverflow } from './cooking';
import {
  AUTO_ENERGY_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL, RECIPES,
} from '../content/cooking';
import {
  BIG_CATCH_PERCENTILE, FISH, RARITY, buildCatchInfo, catchFameOf,
  fishDrawShares, fishDrawWeight, isBigSize, migrate, mutationWeightsOf,
  namedWeightsOf, newState, priceOfInstance, rollCatchExtras, rollFish,
  sizePercentile,
} from './logic';
import type { FishInstance, FormId, GameState } from './logic';
import { catchTooSoon } from './pacing';
import { accrueSpeciesPity } from './pity';
import type { BountyCtx } from './rules';
import { rodPower } from './stats';
import { gameDayOf } from './time';

const NOW = '2026-08-22T03:00:00.000Z';      // KST 12:00 → 게임 날짜 2026-08-22
const DAY = gameDayOf(NOW);                  // '2026-08-22'
const NEXT_NOW = '2026-08-22T19:00:00.000Z'; // KST 다음날 04:00 → 게임 날짜 2026-08-23
const NEXT_DAY = gameDayOf(NEXT_NOW);
const NIGHT_NOW = '2026-08-22T17:00:00.000Z'; // KST 02:00 (밤 정점, depth = 1)
const NIGHT_DAY = gameDayOf(NIGHT_NOW);      // '2026-08-22'

const rngOf = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
// 분포 검증용 결정적 난수 — 같은 시드면 같은 흐름
const mulberry32 = (a: number) => () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const deps = (over: Partial<ActionDeps> = {}): ActionDeps => {
  let n = 0;
  return {
    rng: () => 0.5, today: '2026-08-22', now: NOW, newUid: () => `uid-${++n}`, ...over,
  };
};

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const mkInst = (uid: string, fishId: string, form: FormId = 'normal', locked = false): FishInstance =>
  ({ uid, fishId, form, size: 20, caughtAt: null, spot: null, judgment: null, locked });
const ctx = (over: Partial<BountyCtx> = {}): BountyCtx => ({
  clearsToday: { general: 0, named: 0 }, tickets: [], complete: [], active: [], ...over,
});

const NO_FIRST = { pond: { n: 20, active: false }, river: { n: 30, active: false } };

describe('FORTUNE_CATALOG — 21종 운세 카탈로그와 효과 매핑', () => {
  it('내부 3등급 비중은 65% / 25% / 10%이고 카탈로그는 21종이다', () => {
    expect(FORTUNE_TIER_WEIGHTS).toEqual({ 1: 0.65, 2: 0.25, 3: 0.10 });
    expect(FORTUNE_CATALOG).toHaveLength(21);
    expect(FORTUNE_CATALOG.filter(e => e.tier === 1)).toHaveLength(10);
    expect(FORTUNE_CATALOG.filter(e => e.tier === 2)).toHaveLength(8);
    expect(FORTUNE_CATALOG.filter(e => e.tier === 3)).toHaveLength(3);
  });

  it('모든 21종 키·등급·효과 배수가 명세와 정확히 일치한다', () => {
    const keys = FORTUNE_CATALOG.map(e => fortuneKeyOf(e.kind, e.index));
    expect(new Set(keys).size).toBe(21);
    expect(keys).toEqual([
      'fish:3', 'fish:5',
      'gold:3', 'gold:5',
      'bite:3', 'bite:5',
      'big:3', 'big:5',
      'fame:3', 'fame:5',
      'shadow:3', 'shadow:5',
      'mutation:3', 'mutation:5',
      'night:3', 'night:5',
      'energy:3', 'energy:5',
      'golden-scale:5',
      'mirage:5',
      'grand-catch:5',
    ]);

    expect(fortuneEntryOf('fish', 3)?.effects).toEqual([{ target: 'rarity', mult: 1.05 }]);
    expect(fortuneEntryOf('fish', 5)?.effects).toEqual([{ target: 'rarity', mult: 1.10 }]);
    expect(fortuneEntryOf('gold', 3)?.effects).toEqual([{ target: 'sell', mult: 1.05 }]);
    expect(fortuneEntryOf('gold', 5)?.effects).toEqual([{ target: 'sell', mult: 1.10 }]);
    expect(fortuneEntryOf('bite', 3)?.effects).toEqual([{ target: 'biteWait', mult: 0.95 }]);
    expect(fortuneEntryOf('bite', 5)?.effects).toEqual([{ target: 'biteWait', mult: 0.90 }]);
    expect(fortuneEntryOf('big', 3)?.effects).toEqual([{ target: 'bigCatch', mult: 1.50 }]);
    expect(fortuneEntryOf('big', 5)?.effects).toEqual([{ target: 'bigCatch', mult: 2.00 }]);
    expect(fortuneEntryOf('fame', 3)?.effects).toEqual([{ target: 'fame', mult: 1.50 }]);
    expect(fortuneEntryOf('fame', 5)?.effects).toEqual([{ target: 'fame', mult: 2.00 }]);
    expect(fortuneEntryOf('shadow', 3)?.effects).toEqual([{ target: 'named', mult: 1.05 }]);
    expect(fortuneEntryOf('shadow', 5)?.effects).toEqual([{ target: 'named', mult: 1.10 }]);
    expect(fortuneEntryOf('mutation', 3)?.effects).toEqual([{ target: 'mutation', mult: 1.05 }]);
    expect(fortuneEntryOf('mutation', 5)?.effects).toEqual([{ target: 'mutation', mult: 1.10 }]);
    expect(fortuneEntryOf('night', 3)?.effects).toEqual([{ target: 'night', mult: 1.05 }]);
    expect(fortuneEntryOf('night', 5)?.effects).toEqual([{ target: 'night', mult: 1.10 }]);
    expect(fortuneEntryOf('energy', 3)?.effects).toEqual([{ target: 'energy', mult: 1.50 }]);
    expect(fortuneEntryOf('energy', 5)?.effects).toEqual([{ target: 'energy', mult: 2.00 }]);
    expect(fortuneEntryOf('golden-scale', 5)?.effects).toEqual([{ target: 'legendary', mult: 1.10 }]);
    expect(fortuneEntryOf('mirage', 5)?.effects).toEqual([
      { target: 'legendary', mult: 1.08 },
      { target: 'mutation', mult: 1.08 },
    ]);
    expect(fortuneEntryOf('grand-catch', 5)?.effects).toEqual([
      { target: 'rarity', mult: 1.10 },
      { target: 'sell', mult: 1.10 },
      { target: 'named', mult: 1.10 },
    ]);
    // 3등급은 index 3 항목이 없다
    expect(fortuneEntryOf('golden-scale', 3)).toBeUndefined();
    expect(fortuneEntryOf('mirage', 3)).toBeUndefined();
    expect(fortuneEntryOf('grand-catch', 3)).toBeUndefined();
  });

  it('fortuneEffectMultOf · fortuneEffectsOf — 복합 대길과 미적용 대상을 정확히 반환한다', () => {
    const mirage: DailyFortune = { day: DAY, kind: 'mirage', index: 5 };
    expect(fortuneEffectsOf(mirage)).toHaveLength(2);
    expect(fortuneEffectMultOf(mirage, 'legendary')).toBe(1.08);
    expect(fortuneEffectMultOf(mirage, 'mutation')).toBe(1.08);
    expect(fortuneEffectMultOf(mirage, 'sell')).toBe(1);

    const grand: DailyFortune = { day: DAY, kind: 'grand-catch', index: 5 };
    expect(fortuneEffectsOf(grand)).toHaveLength(3);
    expect(fortuneEffectMultOf(grand, 'rarity')).toBe(1.10);
    expect(fortuneEffectMultOf(grand, 'sell')).toBe(1.10);
    expect(fortuneEffectMultOf(grand, 'named')).toBe(1.10);
    expect(fortuneEffectMultOf(grand, 'energy')).toBe(1);
    expect(fortuneEffectMultOf(null, 'rarity')).toBe(1);
  });
});

describe('rollFortune — 내부 3등급 다중 계층 추첨', () => {
  it('1단계 등급(65/25/10), 2단계 등급 내 균등 종류, 3단계 강도(40/60, 3등급은 5 고정) 및 5단계 점수 배분', () => {
    // 1등급 (tierRoll < 0.65)
    expect(rollFortune(DAY, rngOf(0.0, 0.0, 0.39))).toMatchObject({ day: DAY, kind: 'fish', index: 3 });
    expect(rollFortune(DAY, rngOf(0.64, 0.25, 0.4))).toMatchObject({ day: DAY, kind: 'gold', index: 5 });
    expect(rollFortune(DAY, rngOf(0.5, 0.5, 0.5))).toMatchObject({ day: DAY, kind: 'bite', index: 5 });
    expect(rollFortune(DAY, rngOf(0.1, 0.7, 0.1))).toMatchObject({ day: DAY, kind: 'big', index: 3 });
    expect(rollFortune(DAY, rngOf(0.1, 0.99, 0.9))).toMatchObject({ day: DAY, kind: 'fame', index: 5 });

    // 2등급 (0.65 <= tierRoll < 0.90)
    expect(rollFortune(DAY, rngOf(0.65, 0.0, 0.2))).toMatchObject({ day: DAY, kind: 'shadow', index: 3 });
    expect(rollFortune(DAY, rngOf(0.75, 0.3, 0.5))).toMatchObject({ day: DAY, kind: 'mutation', index: 5 });
    expect(rollFortune(DAY, rngOf(0.80, 0.6, 0.1))).toMatchObject({ day: DAY, kind: 'night', index: 3 });
    expect(rollFortune(DAY, rngOf(0.89, 0.99, 0.9))).toMatchObject({ day: DAY, kind: 'energy', index: 5 });

    // 3등급 (tierRoll >= 0.90) — 강도 분기 없이 항상 index: 5
    expect(rollFortune(DAY, rngOf(0.90, 0.0, 0.0))).toMatchObject({ day: DAY, kind: 'golden-scale', index: 5 });
    expect(rollFortune(DAY, rngOf(0.95, 0.5, 0.0))).toMatchObject({ day: DAY, kind: 'mirage', index: 5 });
    expect(rollFortune(DAY, rngOf(0.99, 0.99, 0.0))).toMatchObject({ day: DAY, kind: 'grand-catch', index: 5 });

    expect(fortuneScoreRange('fish', 3)).toEqual([81, 84]);
    expect(fortuneScoreRange('fish', 5)).toEqual([85, 88]);
    expect(fortuneScoreRange('shadow', 3)).toEqual([89, 92]);
    expect(fortuneScoreRange('shadow', 5)).toEqual([93, 96]);
    expect(fortuneScoreRange('grand-catch', 5)).toEqual([97, 100]);

    for (const entry of FORTUNE_CATALOG) {
      const [min, max] = fortuneScoreRange(entry.kind, entry.index);
      const s = computeFortuneScore(DAY, entry.kind, entry.index, 'user-1');
      expect(s).toBeGreaterThanOrEqual(min);
      expect(s).toBeLessThanOrEqual(max);
      expect(fortuneScoreOf({ day: DAY, kind: entry.kind, index: entry.index, score: s })).toBe(s);
    }
  });

  it('분포 — 고정 시드 100,000회에서 등급 65/25/10, 등급 내 균등, 강도 40/60을 만족한다', () => {
    const rng = mulberry32(42);
    const counts = new Map<FortuneKind, number>();
    const tierCounts = { 1: 0, 2: 0, 3: 0 };
    let t12Three = 0;
    let t12Total = 0;
    const n = 100_000;
    const tierOf: Record<FortuneKind, 1 | 2 | 3> = {
      fish: 1, gold: 1, bite: 1, big: 1, fame: 1,
      shadow: 2, mutation: 2, night: 2, energy: 2,
      'golden-scale': 3, mirage: 3, 'grand-catch': 3,
    };

    for (let i = 0; i < n; i++) {
      const f = rollFortune('d', rng);
      counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
      const t = tierOf[f.kind];
      tierCounts[t]++;
      if (t === 3) {
        expect(f.index).toBe(5);
      } else {
        t12Total++;
        if (f.index === 3) t12Three++;
      }
    }

    expect(tierCounts[1] / n).toBeCloseTo(0.65, 2);
    expect(tierCounts[2] / n).toBeCloseTo(0.25, 2);
    expect(tierCounts[3] / n).toBeCloseTo(0.10, 2);
    expect(t12Three / t12Total).toBeCloseTo(0.40, 2);

    for (const k of ['fish', 'gold', 'bite', 'big', 'fame'] as const) {
      expect(Math.abs((counts.get(k) ?? 0) / tierCounts[1] - 1 / 5)).toBeLessThan(0.01);
    }
    for (const k of ['shadow', 'mutation', 'night', 'energy'] as const) {
      expect(Math.abs((counts.get(k) ?? 0) / tierCounts[2] - 1 / 4)).toBeLessThan(0.01);
    }
    for (const k of ['golden-scale', 'mirage', 'grand-catch'] as const) {
      expect(Math.abs((counts.get(k) ?? 0) / tierCounts[3] - 1 / 3)).toBeLessThan(0.015);
    }
  });
});

describe('ensureFortune · fortuneOf — 게임 날짜 키로 고정', () => {
  it('운세가 없으면 굴려 그날의 운세로 고정하고, 같은 날엔 rng를 소모하지 않는다', () => {
    const st = ensureFortune(seed(), NOW, rngOf(0.0, 0.25, 0.5));
    expect(st.fortune).toMatchObject({ day: DAY, kind: 'gold', index: 5 });
    expect(st.fortune?.score).toBeGreaterThanOrEqual(85);
    expect(st.fortune?.score).toBeLessThanOrEqual(88);
    expect(ensureFortune(st, NOW, () => { throw new Error('rng 호출 금지'); })).toBe(st);
  });

  it('게임 날짜가 바뀌면 새로 굴린다 — 날짜 경계(KST 04:00)를 쓴다', () => {
    const st = ensureFortune(
      seed({ fortune: { day: DAY, kind: 'fish', index: 3 } }), NEXT_NOW, rngOf(0.7, 0.0, 0.9),
    );
    expect(st.fortune).toMatchObject({ day: NEXT_DAY, kind: 'shadow', index: 5 });
    expect(st.fortune?.score).toBeGreaterThanOrEqual(93);
    expect(st.fortune?.score).toBeLessThanOrEqual(96);
  });

  it('fortuneOf는 당일 운세만 반환한다', () => {
    const fortune: DailyFortune = { day: DAY, kind: 'fish', index: 5 };
    expect(fortuneOf(seed({ fortune }), NOW)).toEqual(fortune);
    expect(fortuneOf(seed({ fortune }), NEXT_NOW)).toBeNull();
    expect(fortuneOf(seed(), NOW)).toBeNull();
  });
});

describe('luckMultOf — 전 10개 대상 배수와 비약 독립 곱연산', () => {
  it('모든 10개 FortuneTarget에 대해 운세 배수를 정확히 계산한다', () => {
    const allTargets: FortuneTarget[] = [
      'rarity', 'sell', 'named', 'biteWait', 'bigCatch', 'fame', 'mutation', 'night', 'energy', 'legendary',
    ];
    for (const target of allTargets) {
      expect(luckMultOf(null, target)).toBe(1);
      expect(potionLuckMultOf({ 'luck-small': DAY }, target, DAY)).toBe(
        target === 'rarity' || target === 'sell' || target === 'named' ? 1.05 : 1,
      );
    }

    expect(luckMultOf({ day: DAY, kind: 'fish', index: 3 }, 'rarity')).toBe(1.05);
    expect(luckMultOf({ day: DAY, kind: 'fish', index: 5 }, 'rarity')).toBe(1.10);
    expect(luckMultOf({ day: DAY, kind: 'gold', index: 3 }, 'sell')).toBe(1.05);
    expect(luckMultOf({ day: DAY, kind: 'gold', index: 5 }, 'sell')).toBe(1.10);
    expect(luckMultOf({ day: DAY, kind: 'bite', index: 3 }, 'biteWait')).toBe(0.95);
    expect(luckMultOf({ day: DAY, kind: 'bite', index: 5 }, 'biteWait')).toBe(0.90);
    expect(luckMultOf({ day: DAY, kind: 'big', index: 3 }, 'bigCatch')).toBe(1.50);
    expect(luckMultOf({ day: DAY, kind: 'big', index: 5 }, 'bigCatch')).toBe(2.00);
    expect(luckMultOf({ day: DAY, kind: 'fame', index: 3 }, 'fame')).toBe(1.50);
    expect(luckMultOf({ day: DAY, kind: 'fame', index: 5 }, 'fame')).toBe(2.00);
    expect(luckMultOf({ day: DAY, kind: 'shadow', index: 3 }, 'named')).toBe(1.05);
    expect(luckMultOf({ day: DAY, kind: 'shadow', index: 5 }, 'named')).toBe(1.10);
    expect(luckMultOf({ day: DAY, kind: 'mutation', index: 3 }, 'mutation')).toBe(1.05);
    expect(luckMultOf({ day: DAY, kind: 'mutation', index: 5 }, 'mutation')).toBe(1.10);
    expect(luckMultOf({ day: DAY, kind: 'night', index: 3 }, 'night')).toBe(1.05);
    expect(luckMultOf({ day: DAY, kind: 'night', index: 5 }, 'night')).toBe(1.10);
    expect(luckMultOf({ day: DAY, kind: 'energy', index: 3 }, 'energy')).toBe(1.50);
    expect(luckMultOf({ day: DAY, kind: 'energy', index: 5 }, 'energy')).toBe(2.00);
    expect(luckMultOf({ day: DAY, kind: 'golden-scale', index: 5 }, 'legendary')).toBe(1.10);
    expect(luckMultOf({ day: DAY, kind: 'mirage', index: 5 }, 'legendary')).toBe(1.08);
    expect(luckMultOf({ day: DAY, kind: 'mirage', index: 5 }, 'mutation')).toBe(1.08);
    expect(luckMultOf({ day: DAY, kind: 'grand-catch', index: 5 }, 'rarity')).toBe(1.10);
    expect(luckMultOf({ day: DAY, kind: 'grand-catch', index: 5 }, 'sell')).toBe(1.10);
    expect(luckMultOf({ day: DAY, kind: 'grand-catch', index: 5 }, 'named')).toBe(1.10);
  });

  it('활성 비약이 오늘 날짜면 일일 운세와 독립 곱연산하고 지난 날짜는 무시한다', () => {
    const potions = { 'luck-small': DAY };
    const stalePotions = { 'luck-small': '2026-08-21' };
    expect(activePotionsOf(potions, NOW).map(p => p.id)).toEqual(['luck-small']);
    expect(activePotionsOf(stalePotions, NOW)).toEqual([]);

    const gold5: DailyFortune = { day: DAY, kind: 'gold', index: 5 };
    expect(luckMultOf(gold5, 'sell', potions, DAY)).toBeCloseTo(1.155, 9); // 1.10 × 1.05
    expect(totalLuckMultOf(seed({ fortune: gold5, potions }), NOW, 'sell')).toBeCloseTo(1.155, 9);
    expect(totalLuckMultOf(seed({ fortune: gold5, potions }), NEXT_NOW, 'sell')).toBe(1);

    const grand: DailyFortune = { day: DAY, kind: 'grand-catch', index: 5 };
    expect(luckMultOf(grand, 'rarity', potions, DAY)).toBeCloseTo(1.155, 9);
    expect(luckMultOf(grand, 'sell', potions, DAY)).toBeCloseTo(1.155, 9);
    expect(luckMultOf(grand, 'named', potions, DAY)).toBeCloseTo(1.155, 9);
  });
});

describe('safeFortune — 세이브 위생 및 하위 호환', () => {
  it('필드가 없는 세이브는 null로 두고, 12종 전체와 기존 fish/gold/shadow를 보존한다', () => {
    const raw = { ...newState() } as Record<string, unknown>;
    delete raw.fortune;
    expect(migrate(raw).fortune).toBeNull();
    expect(safeFortune(undefined)).toBeNull();

    for (const entry of FORTUNE_CATALOG) {
      const f = { day: '2026-08-22', kind: entry.kind, index: entry.index };
      const migrated = migrate({ ...newState(), fortune: f }).fortune;
      expect(migrated).toMatchObject(f);
      const [min, max] = fortuneScoreRange(entry.kind, entry.index);
      expect(migrated?.score).toBeGreaterThanOrEqual(min);
      expect(migrated?.score).toBeLessThanOrEqual(max);
    }
  });

  it('3등급 운세의 index가 잘못(3) 저장돼도 5로 정규화하고 score가 범위 밖이면 폴백한다', () => {
    for (const kind of ['golden-scale', 'mirage', 'grand-catch'] as const) {
      const normalized = safeFortune({ day: '2026-08-22', kind, index: 3 });
      expect(normalized).toMatchObject({
        day: '2026-08-22', kind, index: 5,
      });
      expect(normalized?.score).toBeGreaterThanOrEqual(97);
      expect(normalized?.score).toBeLessThanOrEqual(100);
    }
    expect(safeFortune({ day: '2026-08-22', kind: 'fish', index: 3, score: 83 })?.score).toBe(83);
    expect(safeFortune({ day: '2026-08-22', kind: 'fish', index: 3, score: 100 })?.score).toBeLessThanOrEqual(84);
  });

  it('형태가 틀리면 버린다', () => {
    for (const bad of [
      5, 'gold', [],
      { day: '2026-08-22' },
      { day: '2026-08-22', kind: 'luck', index: 5 },
      { day: '2026-08-22', kind: 'gold', index: 4 },
      { day: 7, kind: 'gold', index: 5 },
      { day: '', kind: 'gold', index: 5 },
      { day: '2026-08-22', kind: '__proto__', index: 5 },
    ]) {
      expect(migrate({ ...newState(), fortune: bad }).fortune).toBeNull();
    }
  });
});

describe('채널 1~3: rarity · sell · named', () => {
  it('sell — 재물운(×1.05/×1.10)과 만선 대길(×1.10)이 판매와 미리보기에 반영된다', () => {
    const bag = [mkInst('a', 'carp')];
    const base = priceOfInstance(bag[0]);

    for (const [fortune, expectedMult] of [
      [{ day: DAY, kind: 'gold', index: 3 }, 1.05],
      [{ day: DAY, kind: 'gold', index: 5 }, 1.10],
      [{ day: DAY, kind: 'grand-catch', index: 5 }, 1.10],
    ] as const) {
      const st = seed({ bag, fortune });
      const preview = saleProceedsOf(
        createPlayerContext({ state: st, guild: NO_GUILD_EFFECTS, now: NOW, achievements: NO_ACHIEVEMENT_BONUSES }),
        bag,
      );
      expect(preview.value).toBe(Math.round(base * expectedMult));
      expect(preview.mods.find(m => m.id === 'fortune-sell')?.source).toEqual({ kind: 'fortune' });

      const out = applyAction(st, { type: 'sell', uids: ['a'] }, deps());
      if (!out.ok) throw new Error(out.error);
      expect(out.state.gold).toBe(Math.round(base * expectedMult));
    }

    // 만선 대길(×1.10) × 작은 바다 영약(×1.05) = ×1.155
    const stacked = applyAction(
      seed({ bag, fortune: { day: DAY, kind: 'grand-catch', index: 5 }, potions: { 'luck-small': DAY } }),
      { type: 'sell', uids: ['a'] },
      deps(),
    );
    if (!stacked.ok) throw new Error(stacked.error);
    expect(stacked.state.gold).toBe(Math.round(base * 1.155));
  });

  it('rarity — 풍어운(×1.05/×1.10)과 만선 대길(×1.10)이 희귀 이상 가중치에만 곱해진다', () => {
    const commonShare = (luck?: number) =>
      fishDrawShares('pond', luck === undefined ? {} : { rarityLuck: luck })
        .filter(r => r.fish.rarity === 'common').reduce((s, r) => s + r.share, 0);
    const r = (commonShare(1.05) + commonShare(1.10)) / 2;

    const weak = applyAction(
      seed({ fortune: { day: DAY, kind: 'fish', index: 3 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: () => r }),
    );
    const strong = applyAction(
      seed({ fortune: { day: DAY, kind: 'fish', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: () => r }),
    );
    const grand = applyAction(
      seed({ fortune: { day: DAY, kind: 'grand-catch', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: () => r }),
    );
    if (!weak.ok || !strong.ok || !grand.ok) throw new Error('catch failed');
    expect(FISH.find(f => f.id === weak.state.bag.at(-1)!.fishId)!.rarity).toBe('common');
    expect(FISH.find(f => f.id === strong.state.bag.at(-1)!.fishId)!.rarity).not.toBe('common');
    expect(FISH.find(f => f.id === grand.state.bag.at(-1)!.fishId)!.rarity).not.toBe('common');
  });

  it('named — 그림자 운(×1.05/×1.10)과 만선 대길(×1.10)이 네임드 조우 가중치에 곱해진다', () => {
    const sea = seed({ boat: 1 });
    const bounty = ctx({ active: ['pacific-named-megalodon'] });
    const w = namedWeightsOf('sea');
    const r = (w.named * 1.05 / (w.named * 1.05 + w.none) + w.named * 1.10 / (w.named * 1.10 + w.none)) / 2;

    const weak = applyAction(
      seed({ ...sea, fortune: { day: DAY, kind: 'shadow', index: 3 } }),
      { type: 'catch', spot: 'sea', judgment: 'auto' },
      deps({ rng: () => r, bounty }),
    );
    const strong = applyAction(
      seed({ ...sea, fortune: { day: DAY, kind: 'shadow', index: 5 } }),
      { type: 'catch', spot: 'sea', judgment: 'auto' },
      deps({ rng: () => r, bounty }),
    );
    const grand = applyAction(
      seed({ ...sea, fortune: { day: DAY, kind: 'grand-catch', index: 5 } }),
      { type: 'catch', spot: 'sea', judgment: 'auto' },
      deps({ rng: () => r, bounty }),
    );
    if (!weak.ok || !strong.ok || !grand.ok) throw new Error('catch failed');
    expect(weak.events.some(e => e.type === 'ticket')).toBe(false);
    expect(strong.events.find(e => e.type === 'ticket')?.payload).toEqual({ questId: 'pacific-named-megalodon' });
    expect(grand.events.find(e => e.type === 'ticket')?.payload).toEqual({ questId: 'pacific-named-megalodon' });
  });
});

describe('채널 4: biteWait — 입질 대기 단축', () => {
  it('합연산 보너스 적용 후 마지막에 ×0.95(적당한 운) / ×0.90(좋은 운)를 곱하고 페이싱에도 반영된다', () => {
    const plainState = seed({ rod: 1 });
    const plainCtx = createPlayerContext({
      state: plainState, guild: NO_GUILD_EFFECTS, now: NOW, achievements: NO_ACHIEVEMENT_BONUSES,
    });
    const plain = biteWaitOf(plainCtx, 'pond', 'manual');

    // 합연산 업적(-10%) + 순풍 조류운(×0.95)
    const ach = { ...NO_ACHIEVEMENT_BONUSES, biteWaitCut: 0.1 };
    const preLuck = biteWaitOf(
      createPlayerContext({ state: plainState, guild: NO_GUILD_EFFECTS, now: NOW, achievements: ach }),
      'pond',
      'manual',
    );
    const withBite3 = biteWaitOf(
      createPlayerContext({
        state: seed({ rod: 1, fortune: { day: DAY, kind: 'bite', index: 3 } }),
        guild: NO_GUILD_EFFECTS,
        now: NOW,
        achievements: ach,
      }),
      'pond',
      'manual',
    );
    expect(withBite3.min.value).toBeCloseTo(preLuck.min.value * 0.95, 9);
    expect(withBite3.max.value).toBeCloseTo(preLuck.max.value * 0.95, 9);
    expect(withBite3.min.mods.find(m => m.id === 'fortune-biteWait')?.source).toEqual({ kind: 'fortune' });
    expect(withBite3.min.mods.reduce((s, m) => s + m.delta, withBite3.min.base)).toBeCloseTo(withBite3.min.value, 9);

    // 물때 호조운(×0.90)
    const bite5State = seed({ rod: 1, fortune: { day: DAY, kind: 'bite', index: 5 } });
    const withBite5 = biteWaitOf(
      createPlayerContext({ state: bite5State, guild: NO_GUILD_EFFECTS, now: NOW, achievements: NO_ACHIEVEMENT_BONUSES }),
      'pond',
      'idle',
    );
    expect(withBite5.min.value).toBeCloseTo(plain.min.value * 0.90, 9);
    expect(withBite5.max.value).toBeCloseTo(plain.max.value * 0.90, 9);

    // 페이싱 검사도 단축된 대기 시간을 쓴다
    const reducedCycleMs = 2000 + withBite5.min.value * 1000 - 500;
    const atLimit = new Date(Date.parse(NOW) + reducedCycleMs).toISOString();
    expect(catchTooSoon(bite5State, 'pond', NOW, atLimit)).toBe(false);
    expect(catchTooSoon(plainState, 'pond', NOW, atLimit)).toBe(true);
  });
});

describe('채널 5: bigCatch — 월척 임계 백분위 기준 및 시드 무결성', () => {
  it('rollCatchExtras는 bigCatch 운세가 있어도 RNG 소비 순서와 크기를 바꾸지 않는다', () => {
    const carp = FISH.find(f => f.id === 'carp')!;
    const a = rollCatchExtras(carp, rngOf(0.4, 0.7, 0.5));
    const b = rollCatchExtras(carp, rngOf(0.4, 0.7, 0.5));
    expect(a).toEqual(b);

    // buildCatchInfo와 isBigSize만 임계 백분위(20% -> 30% / 40% / 100 상한)에 배수를 곱한다
    expect(BIG_CATCH_PERCENTILE).toBe(20);
    // Z = 0.6 -> 상위 약 27.4% (20% 초과, 30% 이하)
    const { mean, std } = { mean: 10 + carp.price * 0.15, std: (10 + carp.price * 0.15) * 0.18 };
    const size27 = mean + 0.6 * std;
    const pct27 = sizePercentile(carp, size27);
    expect(pct27).toBeGreaterThan(20);
    expect(pct27).toBeLessThanOrEqual(30);

    expect(isBigSize(carp, size27, 1)).toBe(false);
    expect(isBigSize(carp, size27, 1.5)).toBe(true);
    expect(buildCatchInfo(carp, { size: size27, form: 'normal' }, false, 1).isBig).toBe(false);
    expect(buildCatchInfo(carp, { size: size27, form: 'normal' }, false, 1.5).isBig).toBe(true);

    // Z = 0.35 -> 상위 약 36.3% (30% 초과, 40% 이하)
    const size36 = mean + 0.35 * std;
    const pct36 = sizePercentile(carp, size36);
    expect(pct36).toBeGreaterThan(30);
    expect(pct36).toBeLessThanOrEqual(40);
    expect(buildCatchInfo(carp, { size: size36, form: 'normal' }, false, 1.5).isBig).toBe(false);
    expect(buildCatchInfo(carp, { size: size36, form: 'normal' }, false, 2.0).isBig).toBe(true);

    // 100 상한 클램프 — 매우 작은 개체(상위 99.x%)도 큰 배수에서 true
    expect(isBigSize(carp, 1, 10)).toBe(true);
  });

  it('applyAction catch — 동일 시드로 big(3/5) 운세에서 크기는 같고 isBig만 기준에 따라 갈린다', () => {
    // u1 = exp(-0.6^2 / 2) ≈ 0.83527, u2 = 0 → cos(0)=1, z = 0.6 (상위 약 27.4%)
    const u1For27 = Math.exp(-0.5 * 0.6 * 0.6);
    const seq = () => rngOf(0.5, 0.5, u1For27, 0, 0.5);

    const plain = applyAction(
      seed({ fortune: { day: DAY, kind: 'gold', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: seq() }),
    );
    const big3 = applyAction(
      seed({ fortune: { day: DAY, kind: 'big', index: 3 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: seq() }),
    );
    if (!plain.ok || !big3.ok) throw new Error('catch failed');
    if (plain.result.type !== 'catch' || big3.result.type !== 'catch') throw new Error('bad result');
    expect(big3.result.fishId).toBe(plain.result.fishId);
    expect(big3.result.info.size).toBe(plain.result.info.size);
    expect(plain.result.info.isBig).toBe(false);
    expect(big3.result.info.isBig).toBe(true);
  });
});

describe('채널 6: fame — 명성 획득 배수 및 자리비움 요약', () => {
  it('catchFameOf 및 applyAction catch — 어획 명성에 ×1.50 / ×2.00을 곱해 반올림한다', () => {
    const common = FISH.find(f => f.rarity === 'common')!;
    const epic = FISH.find(f => f.rarity === 'epic')!;
    expect(catchFameOf(common, 1)).toBe(RARITY.common.fame);
    expect(catchFameOf(common, 1.5)).toBe(Math.round(RARITY.common.fame * 1.5));
    expect(catchFameOf(epic, 1.5)).toBe(Math.round(RARITY.epic.fame * 1.5));
    expect(catchFameOf(epic, 2)).toBe(Math.round(RARITY.epic.fame * 2));

    const plain = applyAction(
      seed({ fortune: { day: DAY, kind: 'gold', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: rngOf(0.1, 0.1, 0.5, 0.5, 0.5) }),
    );
    const fame3 = applyAction(
      seed({ fortune: { day: DAY, kind: 'fame', index: 3 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: rngOf(0.1, 0.1, 0.5, 0.5, 0.5) }),
    );
    const fame5 = applyAction(
      seed({ fortune: { day: DAY, kind: 'fame', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: rngOf(0.1, 0.1, 0.5, 0.5, 0.5) }),
    );
    if (!plain.ok || !fame3.ok || !fame5.ok) throw new Error('catch failed');

    const caughtFish = FISH.find(f => f.id === plain.state.bag[0].fishId)!;
    const baseFame = RARITY[caughtFish.rarity].fame;
    expect(plain.state.fame).toBe(baseFame);
    expect(fame3.state.fame).toBe(Math.round(baseFame * 1.5));
    expect(fame5.state.fame).toBe(Math.round(baseFame * 2.0));
    expect(fame5.events[0].payload.fame).toBe(Math.round(baseFame * 2.0));

    // summarizeAway는 이벤트의 fame을 우선 읽고, 없는 예전 이벤트는 기본 등급 명성으로 폴백한다
    const legacyEvent: AwayEvent = {
      type: 'catch', at: NOW,
      payload: { uid: 'u1', fishId: caughtFish.id, form: 'normal', size: 15, judgment: 'auto', spot: 'pond', isNew: false },
    };
    const boostedEvent: AwayEvent = {
      type: 'catch', at: NOW,
      payload: {
        uid: 'u2', fishId: caughtFish.id, form: 'normal', size: 15, judgment: 'auto', spot: 'pond', isNew: false,
        fame: Math.round(baseFame * 2.0),
      },
    };
    const win = { from: '2026-08-22T02:00:00.000Z', to: NOW, awayMs: 3_600_000 };
    expect(summarizeAway([legacyEvent, boostedEvent], win).fame).toBe(baseFame + Math.round(baseFame * 2.0));
  });
});

describe('채널 7: mutation — 돌연변이 비중 및 억제 요리 독립 곱연산', () => {
  it('mutation(3/5) 및 mirage(×1.08)가 억제 요리(×0.5)와 각각 독립 곱연산되고 천장 누적과 일치한다', () => {
    const calmLunch = RECIPES.find(r => r.id === 'cook-lunch-calm')!;
    expect(calmLunch).toBeDefined();
    const activeSlots = {
      lunch: { id: 'cook-lunch-calm', endsAt: '2026-08-23T00:00:00.000Z' },
      bait: null,
    };

    // 기본 mutationWeightsOf(pond) = { variant: 1, normal: 3 }, 억제 ×0.5 + mirage ×1.08 => variant = 1 * 0.5 * 1.08 = 0.54
    const expectedForms = mutationWeightsOf(seed(), 'pond', 0, 0, 1, 0, 0.5 * 1.08);
    expect(expectedForms.variant).toBeCloseTo(0.54, 9);
    const variantShare = expectedForms.variant / (expectedForms.variant + expectedForms.normal);

    // 폼 추첨 경계(rng 5번째 값): 0.5/(0.5+3)=0.142857... vs 0.54/(0.54+3)=0.15254...
    const boundaryFormRng = (0.5 / 3.5 + 0.54 / 3.54) / 2;
    const withoutMirage = applyAction(
      seed({ boat: 5, slots: activeSlots, fortune: { day: DAY, kind: 'gold', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'auto' },
      deps({ rng: rngOf(0.1, 0.1, 0.5, 0.5, boundaryFormRng) }),
    );
    const withMirage = applyAction(
      seed({ boat: 5, slots: activeSlots, fortune: { day: DAY, kind: 'mirage', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'pond', judgment: 'auto' },
      deps({ rng: rngOf(0.1, 0.1, 0.5, 0.5, boundaryFormRng) }),
    );
    if (!withoutMirage.ok || !withMirage.ok) throw new Error('catch failed');
    expect(withoutMirage.state.bag[0].form).toBe('normal');
    expect(withMirage.state.bag[0].form).toBe('variant');

    // pity 누적도 동일한 normalShare(1 - variantShare), 방치 commonMult, mirage의 legendaryLuck(×1.08)을 반영한다
    const expectedOpts = catchDrawOptions('auto', rodPower(withMirage.state), 'pond', 1, {
      phase: 'day',
      legendaryLuck: 1.08,
    });
    const expectedAccrual = accrueSpeciesPity({}, 'pond', expectedOpts, 1 - variantShare);
    for (const [id, val] of Object.entries(withMirage.state.pity)) {
      if (val !== -1) expect(val).toBeCloseTo(expectedAccrual[id], 9);
    }
  });
});

describe('채널 8: night — 밤 어종 출현 비중', () => {
  it('nightLuck은 밤 전용 어종의 개체 가중치에만 곱해지고 낮 어종에는 걸리지 않는다', () => {
    const nightFish = FISH.find(f => f.spot === 'sea' && f.night === true)!;
    const dayFish = FISH.find(f => f.spot === 'sea' && !f.night)!;
    expect(fishDrawWeight(dayFish, { phase: 'night', nightDepth: 1, nightLuck: 1.10 })).toBe(1);
    expect(fishDrawWeight(nightFish, { phase: 'night', nightDepth: 1, nightLuck: 1.10 })).toBeCloseTo(2.2, 9);

    // 밤 추첨 경계에서 night:5(×1.10)만 밤 전설 어종을 고르는 시나리오
    const sharesPlain = fishDrawShares('sea', { phase: 'night', nightDepth: 1, nightLuck: 1 });
    const sharesNight5 = fishDrawShares('sea', { phase: 'night', nightDepth: 1, nightLuck: 1.10 });
    const nightSharePlain = sharesPlain.filter(s => s.fish.night).reduce((a, b) => a + b.share, 0);
    const nightShareLucky = sharesNight5.filter(s => s.fish.night).reduce((a, b) => a + b.share, 0);
    expect(nightShareLucky).toBeGreaterThan(nightSharePlain);

    // 실제 catch 액션(밤 시각 NIGHT_NOW)에서 밤 운세가 밤 어종 비중을 높여 밤 전설 어종이 잡히는지 확인
    const plainSharesLeg = sharesPlain.filter(s => s.fish.rarity === 'legendary');
    const luckySharesLeg = sharesNight5.filter(s => s.fish.rarity === 'legendary');
    // night fish가 먼저 오도록 정렬되어 있거나 순서에 따라 가중치 비율 비교
    const legNightRatioPlain = plainSharesLeg.filter(s => s.fish.night).reduce((a, b) => a + b.share, 0)
      / plainSharesLeg.reduce((a, b) => a + b.share, 0);
    const legNightRatioLucky = luckySharesLeg.filter(s => s.fish.night).reduce((a, b) => a + b.share, 0)
      / luckySharesLeg.reduce((a, b) => a + b.share, 0);
    expect(legNightRatioLucky).toBeGreaterThan(legNightRatioPlain);

    // 실제 applyAction: 밤 전설 2종 중 낮 어종이 먼저, 밤 어종이 뒤일 때 경계 난수로 확인
    const legCands = FISH.filter(f => f.spot === 'sea' && f.rarity === 'legendary');
    expect(legCands.length).toBeGreaterThanOrEqual(2);
    const firstIsDay = !legCands[0].night;
    const totalPlain = legCands.reduce((s, f) => s + fishDrawWeight(f, { phase: 'night', nightDepth: 1, nightLuck: 1 }), 0);
    const totalLucky = legCands.reduce((s, f) => s + fishDrawWeight(f, { phase: 'night', nightDepth: 1, nightLuck: 1.10 }), 0);
    const w0Plain = fishDrawWeight(legCands[0], { phase: 'night', nightDepth: 1, nightLuck: 1 }) / totalPlain;
    const w0Lucky = fishDrawWeight(legCands[0], { phase: 'night', nightDepth: 1, nightLuck: 1.10 }) / totalLucky;
    const rFish = (w0Plain + w0Lucky) / 2;

    const plainCatch = applyAction(
      seed({ boat: 1, fortune: { day: NIGHT_DAY, kind: 'gold', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'sea', judgment: 'normal', forcePhase: 'night' },
      deps({ now: NIGHT_NOW, rng: rngOf(0.999999, rFish, 0.5, 0.5, 0.5) }),
    );
    const nightCatch = applyAction(
      seed({ boat: 1, fortune: { day: NIGHT_DAY, kind: 'night', index: 5 }, firstCatch: NO_FIRST }),
      { type: 'catch', spot: 'sea', judgment: 'normal', forcePhase: 'night' },
      deps({ now: NIGHT_NOW, rng: rngOf(0.999999, rFish, 0.5, 0.5, 0.5) }),
    );
    if (!plainCatch.ok || !nightCatch.ok) throw new Error('catch failed');
    if (firstIsDay) {
      expect(FISH.find(f => f.id === plainCatch.state.bag[0].fishId)!.night).toBeFalsy();
      expect(FISH.find(f => f.id === nightCatch.state.bag[0].fishId)!.night).toBe(true);
    } else {
      expect(FISH.find(f => f.id === plainCatch.state.bag[0].fishId)!.night).toBe(true);
      expect(FISH.find(f => f.id === nightCatch.state.bag[0].fishId)!.night).toBeFalsy();
    }
  });
});

describe('채널 9: energy — 기운 획득량(수동·자동 초과) 및 extractEnergy ensureFortune', () => {
  it('energyGain과 planOverflow에 energyLuck(×1.50/×2.00)이 반영된다', () => {
    const s = seed({ boat: AUTO_ENERGY_BOAT, bag: [mkInst('a', 'carp'), mkInst('b', 'crucian')] });
    expect(energyGain(s, ['a'], 0, 1.5).byGrade.rare).toBe(Math.round(ENERGY_PER_INDIVIDUAL * 1.5));
    expect(energyGain(s, ['a'], 0.15, 1.5).byGrade.rare).toBe(Math.round(ENERGY_PER_INDIVIDUAL * 1.15 * 1.5));
    expect(energyGain(s, ['a'], 0, 2).byGrade.rare).toBe(ENERGY_PER_INDIVIDUAL * 2);

    const overflow = planOverflow(s, ['b'], false, 0, 2);
    expect(overflow.gain.byGrade.common).toBe(ENERGY_PER_INDIVIDUAL * 2);
  });

  it('applyAction extractEnergy — 당일 운세가 없으면 ensureFortune으로 먼저 확정하고 기운 배수를 즉시 적용한다', () => {
    const s = seed({
      boat: 5,
      location: { kind: 'base', id: 'home' },
      bag: [mkInst('a', 'crucian')],
      fortune: null,
    });
    // tier 2 (0.7) -> energy (0.9) -> index 5 (0.5): ×2.00
    const out = applyAction(
      s,
      { type: 'extractEnergy', uids: ['a'] },
      deps({ rng: rngOf(0.7, 0.9, 0.5) }),
    );
    if (!out.ok) throw new Error(out.error);
    expect(out.state.fortune).toMatchObject({ day: DAY, kind: 'energy', index: 5 });
    expect(out.state.fortune?.score).toBeGreaterThanOrEqual(93);
    expect(out.state.fortune?.score).toBeLessThanOrEqual(96);
    expect(out.state.items[ENERGY_ITEM_IDS.common]).toBe(ENERGY_PER_INDIVIDUAL * 2);
    if (out.result.type !== 'extract') throw new Error('bad result');
    expect(out.result.energy.common).toBe(ENERGY_PER_INDIVIDUAL * 2);
  });

  it('applyAction catch — 가공 플랜트선 초과 자동 기운 얻기에도 energy 운세가 적용된다', () => {
    // boat 9 가방 상한만큼 잠금 개체로 채운 상태에서 1마리 더 잡으면 새 개체가 초과 기운으로 변환된다
    const fullBag = Array.from({ length: 5000 }, (_, i) => mkInst(`lock-${i}`, 'carp', 'normal', true));
    const st = seed({
      boat: AUTO_ENERGY_BOAT,
      bag: fullBag,
      fortune: { day: DAY, kind: 'energy', index: 3 }, // ×1.50
      firstCatch: NO_FIRST,
    });
    const out = applyAction(
      st,
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ rng: rngOf(0.1, 0.1, 0.5, 0.5, 0.5) }),
    );
    if (!out.ok) throw new Error(out.error);
    if (out.result.type !== 'catch') throw new Error('bad result');
    const caughtId = out.result.fishId;
    const caught = FISH.find(f => f.id === caughtId)!;
    expect(out.result.energy?.[caught.rarity]).toBe(Math.round(ENERGY_PER_INDIVIDUAL * 1.5));
  });
});

describe('채널 10: legendary — 전설 전용 가중치 및 rarityLuck 독립 곱연산', () => {
  it('legendaryLuck은 전설 등급에만 곱해지고 희귀·영웅은 변하지 않으며 rarityLuck과 독립 곱연산된다', () => {
    const shares = (o: { rarityLuck?: number; legendaryLuck?: number }) => {
      const acc: Record<string, number> = {};
      for (const { fish, share } of fishDrawShares('sea', o)) {
        acc[fish.rarity] = (acc[fish.rarity] ?? 0) + share;
      }
      return acc;
    };

    const base = shares({});
    const legOnly = shares({ legendaryLuck: 1.10 });
    const stacked = shares({ rarityLuck: 1.05, legendaryLuck: 1.10 });

    // rare / epic 비율은 legendaryLuck만으로 서로 상대 비율이 불변
    expect(legOnly.rare / legOnly.epic).toBeCloseTo(base.rare / base.epic, 9);
    // legendary / rare 비율은 정확히 1.10배
    expect((legOnly.legendary / legOnly.rare) / (base.legendary / base.rare)).toBeCloseTo(1.10, 9);
    // rarityLuck(1.05) × legendaryLuck(1.10): legendary / common 비율은 1.155배, rare / common은 1.05배
    expect((stacked.rare / stacked.common) / (base.rare / base.common)).toBeCloseTo(1.05, 9);
    expect((stacked.legendary / stacked.common) / (base.legendary / base.common)).toBeCloseTo(1.155, 9);

    // 실제 rollFish 경계에서 golden-scale(1.10) + luck-small(1.05) = 1.155 경계 검증
    const legShare110 = shares({ rarityLuck: 1.05 }).legendary;
    const legShare1155 = stacked.legendary;
    const rEdge = 1 - (legShare110 + legShare1155) / 2;
    expect(rollFish('sea', 1, () => rEdge, 1, { rarityLuck: 1.05 }).rarity).toBe('epic');
    expect(rollFish('sea', 1, () => rEdge, 1, { rarityLuck: 1.05, legendaryLuck: 1.10 }).rarity).toBe('legendary');

    // applyAction catch — golden-scale + 작은 바다 영약 독립 곱연산 (rod 10으로 해역 요구 파워 충족)
    const caught = applyAction(
      seed({
        boat: 1,
        rod: 10,
        fortune: { day: DAY, kind: 'golden-scale', index: 5 },
        potions: { 'luck-small': DAY },
        firstCatch: NO_FIRST,
      }),
      { type: 'catch', spot: 'sea', judgment: 'normal' },
      deps({ rng: rngOf(rEdge, 0.1, 0.5, 0.5, 0.5) }),
    );
    if (!caught.ok) throw new Error('catch failed');
    expect(FISH.find(f => f.id === caught.state.bag[0].fishId)!.rarity).toBe('legendary');
  });
});
