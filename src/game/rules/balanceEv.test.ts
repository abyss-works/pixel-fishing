import { describe, expect, it } from 'vitest';
import { SPOTS } from '../content/spots';
import { FISH } from '../content/fish';
import { RARITY } from '../content/rarity';
import { goldEV } from './logic';
import { powerOfLevel } from './stats';
import { idleDialsOf, relativeIdleBoost } from './power';
import {
  rates as legacyRates,
  entryLevel as legacyEntryLevel,
  moveGap as legacyMoveGap,
  perfectOverIdle as legacyPerfectOverIdle,
  NIGHT_SHARE as LEGACY_NIGHT_SHARE,
  VARIANT_EV as LEGACY_VARIANT_EV,
  SPEC_MARGIN as LEGACY_SPEC_MARGIN,
} from '../../../tools/balance/model';
import {
  AXES,
  AXIS_LABEL,
  NIGHT_DEPTH_WEIGHTS,
  NIGHT_SHARE,
  SPEC_MARGIN,
  VARIANT_EV,
  axisAvailable,
  axisOptions,
  createBalanceEvEngine,
  cycleOf,
  cycleSecAt,
  entryLevel,
  famePerCatchDay,
  goldPerCatchDay,
  meanCycleSec,
  mixedRows,
  moveGap,
  perfectOverIdle,
  plateauLevel,
  rates,
  rodSpec,
  spotAxisHourlyGold,
  spotOf,
} from './balanceEv';

describe('balanceEv 통합 EV 엔진', () => {
  it('기본 상수와 전 해역 레거시 측정 모델의 산출값이 부동소수점까지 일치한다', () => {
    expect(NIGHT_SHARE).toBe(LEGACY_NIGHT_SHARE);
    expect(VARIANT_EV).toBe(LEGACY_VARIANT_EV);
    expect(SPEC_MARGIN).toBe(LEGACY_SPEC_MARGIN);
    expect(AXES).toEqual(['idle', 'normal', 'good', 'perfect']);
    expect(AXIS_LABEL).toEqual({ normal: '무판정', good: 'GOOD', perfect: 'PERFECT', idle: '방치' });

    const weightSum = NIGHT_DEPTH_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    expect(weightSum).toBeCloseTo(1, 12);

    for (let i = 0; i < SPOTS.length; i++) {
      const spot = SPOTS[i].id;
      const entry = entryLevel(spot);
      expect(entry).toBe(legacyEntryLevel(spot));
      expect(spotOf(spot).id).toBe(spot);

      const cur = rates(spot, entry, 'idle');
      const legacy = legacyRates(spot, entry, 'idle');
      expect(cur.goldPerHour).toBe(legacy.goldPerHour);
      expect(cur.famePerHour).toBe(legacy.famePerHour);
      expect(cur.catchesPerHour).toBe(legacy.catchesPerHour);
      expect(cur.goldPerCatch * cur.catchesPerHour).toBeCloseTo(cur.goldPerHour, 10);
      expect(cur.famePerCatch * cur.catchesPerHour).toBeCloseTo(cur.famePerHour, 10);

      expect(perfectOverIdle(spot, entry)).toBe(legacyPerfectOverIdle(spot, entry));

      const gap = moveGap(i, 'mixed');
      const legacyGap = legacyMoveGap(i, 'mixed');
      expect(gap.gold).toBe(legacyGap.gold);
      expect(gap.from).toBe(legacyGap.from);
      expect(gap.fromGold).toBe(legacyGap.fromGold);
      expect(gap.ratio).toBe(legacyGap.ratio);
      expect(gap.diff).toBe(legacyGap.diff);
    }
  });

  it('plateauLevel은 방치 배수 하한에 도달하는 최소 레벨(entryLevel + 4)과 일치한다', () => {
    for (const s of SPOTS) {
      const entry = entryLevel(s.id);
      const plateau = plateauLevel(s.id);
      const target = idleDialsOf(s.id).plateau;

      expect(plateau).toBe(entry + 4);
      expect(relativeIdleBoost(powerOfLevel(plateau), s.id)).toBe(target);
      if (plateau > entry) {
        expect(relativeIdleBoost(powerOfLevel(plateau - 1), s.id)).toBeGreaterThan(target);
      }
    }
  });

  it('rates는 priceOf 오버라이드와 시간대별 풀·축 옵션을 정확히 반영한다', () => {
    const spot = 'sea';
    const entry = entryLevel(spot);
    const base = rates(spot, entry, 'idle');
    const doubled = rates(spot, entry, 'idle', {}, 'mixed', f => f.price * 2);

    expect(doubled.goldPerCatch).toBeCloseTo(base.goldPerCatch * 2, 10);
    expect(doubled.goldPerHour).toBeCloseTo(base.goldPerHour * 2, 10);
    expect(doubled.famePerCatch).toBe(base.famePerCatch);

    const dayRows = mixedRows(spot, {}, 'day');
    expect(dayRows.reduce((s, r) => s + r.prob, 0)).toBeCloseTo(1, 12);

    const specAtEntry = rodSpec(spot, entry);
    expect(axisAvailable(specAtEntry, 'normal')).toBe(true);
    expect(axisAvailable(specAtEntry, 'good')).toBe(true);
    expect(axisAvailable(specAtEntry, 'perfect')).toBe(false);
    expect(axisOptions(specAtEntry, 'idle')).toEqual({ commonMult: specAtEntry.idleBoost });

    const cycle = cycleOf(specAtEntry, 'idle');
    expect(meanCycleSec(cycle)).toBeCloseTo(cycleSecAt(cycle, 0.5), 12);
  });

  it('spotAxisHourlyGold는 5개 축과 priceOf·budgets·fishWeights 오버라이드를 반영한다', () => {
    const spot = 'indian';
    const base = spotAxisHourlyGold(spot);
    const entry = entryLevel(spot);
    const plateau = plateauLevel(spot);

    expect(base.entryLevel).toBe(entry);
    expect(base.plateauLevel).toBe(plateau);
    expect(base.goldPerHour.normal).toBe(rates(spot, entry, 'normal').goldPerHour);
    expect(base.goldPerHour.good).toBe(rates(spot, entry, 'good').goldPerHour);
    expect(base.goldPerHour.perfect).toBe(rates(spot, entry, 'perfect').goldPerHour);
    expect(base.goldPerHour.idleWorst).toBe(rates(spot, entry, 'idle').goldPerHour);
    expect(base.goldPerHour.idleBest).toBe(rates(spot, plateau, 'idle').goldPerHour);

    const customPrice = spotAxisHourlyGold(spot, {
      priceOf: f => f.price + 100,
    });
    expect(customPrice.goldPerHour.idleWorst).toBeGreaterThan(base.goldPerHour.idleWorst);

    const targetFish = FISH.find(f => f.spot === spot && f.rarity === 'rare')!;
    const boostedWeight = spotAxisHourlyGold(spot, {
      fishWeights: { [targetFish.id]: 10 },
      budgets: { common: 1000, rare: 5000, epic: 500, legendary: 100 },
    });
    expect(boostedWeight.goldPerHour.normal).not.toBe(base.goldPerHour.normal);
  });

  it('goldPerCatchDay와 famePerCatchDay는 낮 풀 1회 캐치 기대값을 반환한다', () => {
    for (const s of SPOTS) {
      expect(goldPerCatchDay(s.id)).toBeCloseTo(goldEV(s.id), 10);

      const dayRows = mixedRows(s.id, {}, 'day');
      const expectedFame = dayRows.reduce((sum, r) => sum + r.prob * RARITY[r.fish.rarity].fame, 0);
      expect(famePerCatchDay(s.id)).toBeCloseTo(expectedFame, 12);
    }

    const tripled = goldPerCatchDay('pond', {}, f => f.price * 3);
    expect(tripled).toBeCloseTo(goldEV('pond') * 3, 10);

    const weighted = goldPerCatchDay('pond', {
      budgets: { common: 1000, rare: 8000, epic: 1000, legendary: 0 },
    });
    expect(weighted).toBeCloseTo(
      goldEV('pond', { budgets: { common: 1000, rare: 8000, epic: 1000, legendary: 0 } }),
      10,
    );
  });

  it('createBalanceEvEngine에 선택적 규칙 함수를 주입하면 해당 엔진 계산에만 반영된다', () => {
    const custom = createBalanceEvEngine({
      powerOfLevel: lv => lv * 10,
      minLevelOfPower: p => Math.max(1, Math.ceil(p / 10)),
      relativeIdleBoost: (power, spot) => {
        const req = spotOf(spot).powerReq ?? 0;
        return power >= req + 20 ? 3 : 5;
      },
    });

    expect(custom.entryLevel('sea')).toBe(4);
    expect(custom.plateauLevel('sea')).toBe(6);
    expect(custom.rodSpec('sea', 4).power).toBe(40);
    expect(custom.spotAxisHourlyGold('sea').plateauLevel).toBe(6);

    // 기본 엔진은 영향받지 않는다
    expect(entryLevel('sea')).toBe(6);
    expect(plateauLevel('sea')).toBe(10);
  });
});
