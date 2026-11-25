import { describe, it, expect } from 'vitest';
import {
  ABOLISHED_ACHIEVEMENT_IDS,
  ACHIEVEMENT_COUNTER_KEYS,
  ACHIEVEMENTS,
  CUMULATIVE_BONUS_COUNT,
  CUMULATIVE_BONUS_SERIES,
  achievementById,
  achievementForHatId,
} from './achievements';
import { hatById, HATS } from './wardrobe';

describe('업적 콘텐츠', () => {
  it('카운터 키 7종이 정의되어 있다', () => {
    expect(ACHIEVEMENT_COUNTER_KEYS).toEqual([
      'sell.gold', 'energy.spent', 'catch.perfect', 'catch.auto', 'catch.bait', 'catch.lunch', 'named.flawless',
    ]);
  });

  it('수령형 업적 82종(진행 30 + 치장 52)과 누적 보너스 37종(전역 11 + 지역 18 + 유물 8)으로 총 119종이 중복 없는 id로 정의되어 있다', () => {
    expect(ACHIEVEMENTS).toHaveLength(82);
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(82);

    const progress = ACHIEVEMENTS.filter(a => a.tab === 'progress');
    expect(progress).toHaveLength(30);
    const cosmetic = ACHIEVEMENTS.filter(a => a.tab === 'cosmetic');
    expect(cosmetic).toHaveLength(52);
    expect(ACHIEVEMENTS.filter(a => a.reward.kind === 'hat')).toHaveLength(52);

    expect(CUMULATIVE_BONUS_SERIES).toHaveLength(37);
    expect(CUMULATIVE_BONUS_COUNT).toBe(37);
    expect(ACHIEVEMENTS.length + CUMULATIVE_BONUS_COUNT).toBe(119);
    expect(new Set(CUMULATIVE_BONUS_SERIES.map(s => s.id)).size).toBe(37);
    expect(CUMULATIVE_BONUS_SERIES.filter(s => s.scope === 'global')).toHaveLength(11);
    expect(CUMULATIVE_BONUS_SERIES.filter(s => s.scope === 'zone')).toHaveLength(18);
    expect(CUMULATIVE_BONUS_SERIES.filter(s => s.scope === 'artifact')).toHaveLength(8);
  });

  it('폐지된 옛 업적 id는 재사용하지 않는다', () => {
    for (const a of ACHIEVEMENTS) {
      expect(ABOLISHED_ACHIEVEMENT_IDS.has(a.id), a.id).toBe(false);
    }
    for (const s of CUMULATIVE_BONUS_SERIES) {
      expect(ABOLISHED_ACHIEVEMENT_IDS.has(s.id), s.id).toBe(false);
      for (const step of s.steps) {
        expect(ABOLISHED_ACHIEVEMENT_IDS.has(step.id), step.id).toBe(false);
      }
    }
  });

  it('진행 업적 골드 보상이 해역별 표와 일치하고 총합이 103,451,480G다', () => {
    const expected: Record<string, number> = {
      'spot-basic-pond': 140,
      'spot-full-pond': 140,
      'spot-basic-river': 400,
      'spot-full-river': 400,
      'spot-basic-sea': 1_200,
      'spot-full-sea': 1_200,
      'spot-basic-deep': 3_000,
      'spot-full-deep': 3_000,
      'spot-basic-dragonhole': 6_000,
      'spot-full-dragonhole': 6_000,
      'spot-basic-coron': 14_000,
      'spot-full-coron': 16_000,
      'spot-basic-barrierreef': 40_000,
      'spot-full-barrierreef': 60_000,
      'spot-basic-indian': 140_000,
      'spot-full-indian': 160_000,
      'spot-basic-southindian': 400_000,
      'spot-full-southindian': 400_000,
      'spot-basic-mozstrait': 600_000,
      'spot-full-mozstrait': 800_000,
      'spot-basic-comorodeep': 1_400_000,
      'spot-full-comorodeep': 1_400_000,
      'spot-basic-benguela': 2_000_000,
      'spot-full-benguela': 2_000_000,
      'spot-basic-sthelena': 6_000_000,
      'spot-full-sthelena': 6_000_000,
      'spot-basic-azores': 10_000_000,
      'spot-full-azores': 12_000_000,
      'spot-basic-bermuda': 30_000_000,
      'spot-full-bermuda': 30_000_000,
    };
    let total = 0;
    for (const [id, gold] of Object.entries(expected)) {
      const a = achievementById(id);
      expect(a, id).toBeDefined();
      expect(a!.reward).toEqual({ kind: 'gold', gold });
      total += gold;
    }
    expect(total).toBe(103_451_480);
    for (let i = 0; i < 30; i += 2) {
      expect((ACHIEVEMENTS[i].reward as { gold: number }).gold)
        .toBeLessThanOrEqual((ACHIEVEMENTS[i + 1].reward as { gold: number }).gold);
    }
  });

  it('모든 업적 모자 보상과 wardrobe.ts가 1:1로 대응한다', () => {
    const achHats = HATS.filter(h => h.source === 'achievement');
    expect(achHats).toHaveLength(52);
    for (const h of achHats) {
      const a = achievementForHatId(h.id);
      expect(a, h.id).toBeDefined();
      expect(a!.id).toBe(h.achievementId);
      expect(a!.reward).toEqual({ kind: 'hat', hatId: h.id });
    }
    for (const a of ACHIEVEMENTS) {
      if (a.reward.kind === 'hat') {
        expect(hatById(a.reward.hatId)?.source).toBe('achievement');
      }
    }
  });

  it('이름표와 조건 문구에 가운뎃점과 줄표, 금지된 내부 용어가 없다', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name).not.toMatch(/[·—–]/);
      expect(a.desc).not.toMatch(/[·—–]/);
      expect(a.name).not.toMatch(/전역|일반 폼|완결|일반 기운 기준|수동 낚시/);
      expect(a.desc).not.toMatch(/전역|일반 폼|완결|일반 기운 기준|수동 낚시/);
    }
    for (const s of CUMULATIVE_BONUS_SERIES) {
      expect(s.name).not.toMatch(/[·—–]/);
      expect(s.desc).not.toMatch(/[·—–]/);
      expect(s.name).not.toMatch(/전역|일반 폼|완결|일반 기운 기준|수동 낚시/);
      expect(s.desc).not.toMatch(/전역|일반 폼|완결|일반 기운 기준|수동 낚시/);
    }
  });
});
