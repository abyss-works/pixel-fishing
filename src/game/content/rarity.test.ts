// 표시 등급 — 네 등급에 특수를 더한 표시용 식별자. 등급 가중이나 명성 계산에 쓰이는 등급 정의와 따로 둔다.
import { describe, expect, it } from 'vitest';
import { DISPLAY_GRADE, DISPLAY_GRADE_ORDER, RARITY, RARITY_ORDER, displayGradeRank } from './rarity';

describe('표시 등급', () => {
  it('특수는 표시 이름 특수와 색 #69f0ae를 가진다', () => {
    expect(DISPLAY_GRADE.special).toEqual({ name: '특수', color: '#69f0ae' });
  });

  it('네 등급의 이름과 색은 등급 정의와 같다', () => {
    for (const g of RARITY_ORDER) expect(DISPLAY_GRADE[g], g).toEqual({ name: RARITY[g].name, color: RARITY[g].color });
  });

  it('특수는 등급 정의와 등급 순서에 들지 않는다', () => {
    expect(Object.keys(RARITY)).not.toContain('special');
    expect(RARITY_ORDER).not.toContain('special');
  });

  it('등급순 목록에서 특수는 네 단계 뒤다', () => {
    expect(DISPLAY_GRADE_ORDER).toEqual([...RARITY_ORDER, 'special']);
    expect(displayGradeRank('special')).toBeGreaterThan(displayGradeRank('legendary'));
    expect(displayGradeRank('common')).toBeLessThan(displayGradeRank('rare'));
  });
});
