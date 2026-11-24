// 공개 프로필 업적 위생 처리 — 폐지된 구 업적 ID와 미수령 상태 노출을 차단한다.
import { describe, expect, it } from 'vitest';
import { ABOLISHED_ACHIEVEMENT_IDS, ACHIEVEMENTS } from '../../src/game/content/achievements.js';
import { sanitizeClaimedAchievements } from './profile.js';

describe('sanitizeClaimedAchievements', () => {
  it('현행 업적 정의에 등록되고 claimed 상태인 ID만 정렬해 돌려준다', () => {
    const activeIds = ACHIEVEMENTS.slice(0, 2).map(a => a.id).sort();
    const raw = {
      [activeIds[1]]: 'claimed',
      [activeIds[0]]: 'claimed',
      [ACHIEVEMENTS[2].id]: 'claimable',
    };
    expect(sanitizeClaimedAchievements(raw)).toEqual(activeIds);
  });

  it('폐지된 구 업적 ID와 미등록 ID는 claimed 상태여도 제외한다', () => {
    const abolished = [...ABOLISHED_ACHIEVEMENT_IDS].slice(0, 3);
    const raw: Record<string, string> = {
      'spot-basic-sea': 'claimed',
      'unknown-legacy-id': 'claimed',
    };
    for (const id of abolished) raw[id] = 'claimed';
    expect(sanitizeClaimedAchievements(raw)).toEqual(['spot-basic-sea']);
  });

  it('객체가 아닌 입력에는 빈 배열을 돌려준다', () => {
    for (const bad of [null, undefined, [], 'claimed', 123]) {
      expect(sanitizeClaimedAchievements(bad)).toEqual([]);
    }
  });
});
