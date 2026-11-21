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
  it('카운터 키 5종이 정의되어 있다', () => {
    expect(ACHIEVEMENT_COUNTER_KEYS).toEqual([
      'sell.gold', 'catch.perfect', 'catch.auto', 'catch.bait', 'named.flawless',
    ]);
  });

  it('수령형 업적 71종(진행 30 + 치장 41)과 누적 보너스 25종(23계열)이 중복 없는 id로 정의되어 있다', () => {
    expect(ACHIEVEMENTS).toHaveLength(71);
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(71);

    const progress = ACHIEVEMENTS.filter(a => a.tab === 'progress');
    expect(progress).toHaveLength(30);
    const cosmetic = ACHIEVEMENTS.filter(a => a.tab === 'cosmetic');
    expect(cosmetic).toHaveLength(41);
    expect(ACHIEVEMENTS.filter(a => a.reward.kind === 'hat')).toHaveLength(41);

    expect(CUMULATIVE_BONUS_SERIES).toHaveLength(23);
    expect(CUMULATIVE_BONUS_COUNT).toBe(25);
    expect(new Set(CUMULATIVE_BONUS_SERIES.map(s => s.id)).size).toBe(23);
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

  it('진행 업적 골드 보상이 해역별 표와 일치하고 총합이 5,362,500G다', () => {
    const expected: Record<string, number> = {
      'spot-basic-pond': 50,
      'spot-full-pond': 50,
      'spot-basic-river': 100,
      'spot-full-river': 100,
      'spot-basic-sea': 300,
      'spot-full-sea': 300,
      'spot-basic-deep': 800,
      'spot-full-deep': 800,
      'spot-basic-dragonhole': 1_500,
      'spot-full-dragonhole': 1_500,
      'spot-basic-coron': 4_000,
      'spot-full-coron': 4_000,
      'spot-basic-barrierreef': 12_000,
      'spot-full-barrierreef': 12_000,
      'spot-basic-indian': 35_000,
      'spot-full-indian': 40_000,
      'spot-basic-southindian': 100_000,
      'spot-full-southindian': 100_000,
      'spot-basic-mozstrait': 200_000,
      'spot-full-mozstrait': 150_000,
      'spot-basic-comorodeep': 350_000,
      'spot-full-comorodeep': 350_000,
      'spot-basic-benguela': 500_000,
      'spot-full-benguela': 500_000,
      'spot-basic-sthelena': 1_500_000,
      'spot-full-sthelena': 1_500_000,
      'spot-basic-azores': 3_000_000,
      'spot-full-azores': 2_500_000,
      'spot-basic-bermuda': 7_500_000,
      'spot-full-bermuda': 7_500_000,
    };
    let total = 0;
    for (const [id, gold] of Object.entries(expected)) {
      const a = achievementById(id);
      expect(a, id).toBeDefined();
      expect(a!.reward).toEqual({ kind: 'gold', gold });
      total += gold;
    }
    expect(total).toBe(25_862_500);
  });

  it('모든 업적 모자 보상과 wardrobe.ts가 1:1로 대응한다', () => {
    const achHats = HATS.filter(h => h.source === 'achievement');
    expect(achHats).toHaveLength(41);
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

  it('이름표와 조건 문구에 가운뎃점과 줄표가 없다', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name).not.toMatch(/[·—–]/);
      expect(a.desc).not.toMatch(/[·—–]/);
    }
    for (const s of CUMULATIVE_BONUS_SERIES) {
      expect(s.name).not.toMatch(/[·—–]/);
      expect(s.desc).not.toMatch(/[·—–]/);
    }
  });
});
