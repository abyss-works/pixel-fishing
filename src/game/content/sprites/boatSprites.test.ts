import { describe, it, expect } from 'vitest';
import { BOAT_PALETTE, BOAT_SPRITES, BOAT_WATERLINE } from './boatSprites.generated';
import { cellIndex, validateSprite, TRANSPARENT } from './types';
import { BOATS as ALL_BOATS } from '../boats';

// 스프라이트 생성기에 아직 단계가 없는 배(가공 플랜트선) — 생성 파일이 갱신되면 이 목록을 비운다
const SPRITE_PENDING_TIERS: readonly number[] = [9];
const BOATS = ALL_BOATS.filter(b => !SPRITE_PENDING_TIERS.includes(b.tier));

describe('배 스프라이트 (생성 파일)', () => {
  it('배 데이터의 모든 단계에 32×16 격자가 있고 무결성 오류가 없다', () => {
    for (const b of BOATS) {
      const s = BOAT_SPRITES[b.tier];
      expect(s, b.name).toBeDefined();
      expect([s.w, s.h], b.name).toEqual([32, 16]);
      expect(validateSprite(s), b.name).toEqual([]);
    }
  });

  it('흘수선 행에는 선체가 있고 그 위에 갑판이 있다 — 필드 배치 기준', () => {
    for (const b of BOATS) {
      const rows = BOAT_SPRITES[b.tier].frames[0];
      expect(rows[BOAT_WATERLINE].includes(TRANSPARENT) && rows[BOAT_WATERLINE].replaceAll(TRANSPARENT, '').length > 8, b.name).toBe(true);
      expect(rows[BOAT_WATERLINE - 2].replaceAll(TRANSPARENT, '').length, b.name).toBeGreaterThan(0);
    }
  });

  it('격자의 모든 인덱스가 공용 팔레트 안에 있고 단계가 오를수록 선체가 길다', () => {
    let prevWidth = 0;
    for (const b of BOATS) {
      const rows = BOAT_SPRITES[b.tier].frames[0];
      for (const row of rows) for (const ch of row) {
        if (ch === TRANSPARENT) continue;
        expect(cellIndex(ch)!, b.name).toBeLessThan(BOAT_PALETTE.length);
      }
      const hull = rows[BOAT_WATERLINE].replaceAll(TRANSPARENT, '').length;
      expect(hull, b.name).toBeGreaterThanOrEqual(prevWidth);
      prevWidth = hull;
    }
  });
});
