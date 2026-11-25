import { describe, expect, it } from 'vitest';
import { POTIONS, POTION_BY_ID, isPotionId, potionById } from './potions';

const FORBIDDEN_CHARS = /[·—–\p{Extended_Pictographic}]/u;

describe('물약 카탈로그', () => {
  it('첫 특수 물약(작은 행운 물약)이 확정 스펙과 문구 규칙을 만족한다', () => {
    const luckSmall = potionById('luck-small');
    expect(luckSmall).toBeDefined();
    expect(luckSmall).toEqual({
      id: 'luck-small',
      name: '작은 행운 물약',
      grade: 'special',
      description: '사용하면 한국 시간 새벽 4시까지 모든 운 배율이 +5%p 올라요.',
      duration: 'game-day',
      effects: {
        luck: { rarity: 0.05, sell: 0.05, named: 0.05 },
      },
    });
  });

  it('모든 물약은 고유 id와 금지 문자 없는 이름·설명을 가진다', () => {
    expect(POTIONS.length).toBeGreaterThan(0);
    const ids = POTIONS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of POTIONS) {
      expect(POTION_BY_ID.get(p.id)).toBe(p);
      expect(isPotionId(p.id)).toBe(true);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(FORBIDDEN_CHARS.test(p.name)).toBe(false);
      expect(FORBIDDEN_CHARS.test(p.description)).toBe(false);
    }
  });

  it('등록되지 않은 id나 비문자열 입력은 거부한다', () => {
    expect(isPotionId('unknown-potion')).toBe(false);
    expect(isPotionId(null)).toBe(false);
    expect(isPotionId(123)).toBe(false);
    expect(potionById('unknown-potion')).toBeUndefined();
    expect(potionById(undefined)).toBeUndefined();
  });
});
