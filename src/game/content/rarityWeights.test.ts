import { describe, expect, it } from 'vitest';
import {
  RARITY_PRESETS, RARITY_TOTAL, presetStageOf, presetOfStage, rarityWeightsOf, rarityWeightOf, stableRarityShare,
} from './rarityWeights.js';
import { SPOTS } from './spots.js';
import { ZONE_IDS, topZoneOfSpot } from './zones.js';
import { RARITY_ORDER } from './rarity.js';

describe('등급 가중치 프리셋', () => {
  it('프리셋 값', () => {
    expect(RARITY_PRESETS.latest).toEqual({ rare: 2000, epic: 300, legendary: 20 });
    expect(RARITY_PRESETS.previous).toEqual({ rare: 2000, epic: 400, legendary: 60 });
    expect(RARITY_PRESETS.stable).toEqual({ rare: 2000, epic: 500, legendary: 100 });
  });

  it('단계는 가장 최근 지역에서 몇 단계 전인지로 정한다', () => {
    expect(presetStageOf(4, 5)).toBe('latest');
    expect(presetStageOf(3, 5)).toBe('previous');
    expect(presetStageOf(2, 5)).toBe('stable');
    expect(presetStageOf(0, 5)).toBe('stable');
    expect(presetOfStage('previous')).toBe(RARITY_PRESETS.previous);
  });

  it('덮어쓰기 없는 해역은 지역 단계 프리셋을 쓰고 일반은 나머지다', () => {
    expect(rarityWeightsOf('pond')).toEqual({ common: 7400, rare: 2000, epic: 500, legendary: 100 });
    expect(rarityWeightsOf('deep')).toEqual({ common: 7400, rare: 2000, epic: 500, legendary: 100 });
  });

  it('덮어쓰기 해역은 명시한 값을 쓴다', () => {
    expect(rarityWeightsOf('coron')).toEqual({ common: 7000, rare: 2000, epic: 900, legendary: 100 });
    expect(rarityWeightsOf('barrierreef')).toEqual({ common: 7400, rare: 2300, epic: 0, legendary: 300 });
    expect(rarityWeightsOf('indian')).toEqual({ common: 8150, rare: 1400, epic: 400, legendary: 50 });
    expect(rarityWeightsOf('southindian')).toEqual({ common: 7650, rare: 1500, epic: 800, legendary: 50 });
    expect(rarityWeightsOf('mozstrait')).toEqual({ common: 7670, rare: 1500, epic: 800, legendary: 30 });
    expect(rarityWeightsOf('comorodeep')).toEqual({ common: 7670, rare: 1500, epic: 800, legendary: 30 });
    expect(rarityWeightOf('coron', 'common')).toBe(7000);
  });

  it('전역 기본 확률은 안정화 프리셋이다', () => {
    expect(stableRarityShare('common')).toBeCloseTo(0.74, 10);
    expect(stableRarityShare('legendary')).toBeCloseTo(0.01, 10);
  });

  it('가드: 모든 프리셋과 해역에서 일반 > 0, 합 10000, 0 이상 정수', () => {
    const sets = [
      ...Object.values(RARITY_PRESETS).map(p => ({ common: RARITY_TOTAL - p.rare - p.epic - p.legendary, ...p })),
      ...SPOTS.map(s => rarityWeightsOf(s.id)),
    ];
    for (const w of sets) {
      expect(w.common).toBeGreaterThan(0);
      expect(RARITY_ORDER.reduce((s, r) => s + w[r], 0)).toBe(RARITY_TOTAL);
      for (const r of RARITY_ORDER) {
        expect(Number.isInteger(w[r])).toBe(true);
        expect(w[r]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('덮어쓰기는 세 등급을 모두 명시한다', () => {
    for (const s of SPOTS) {
      if (s.rarityWeight) expect(Object.keys(s.rarityWeight).sort(), s.id).toEqual(['epic', 'legendary', 'rare']);
    }
  });

  it('지역 순서는 지역 정의 순서다', () => {
    expect(ZONE_IDS).toEqual(['village', 'pacific', 'seasia', 'indian', 'madagascar']);
    expect(topZoneOfSpot('pond')).toBe('village');
  });
});
