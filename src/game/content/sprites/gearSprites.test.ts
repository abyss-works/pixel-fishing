import { describe, it, expect } from 'vitest';
import { GEAR_PALETTE, ROD_SPRITE } from './gearSprites.generated';
import { cellIndex, validateSprite, TRANSPARENT } from './types';

describe('장비 스프라이트 (생성 파일)', () => {
  it('낚싯대 격자는 32×16이고 무결성 오류가 없으며 인덱스가 팔레트 안에 있다', () => {
    expect([ROD_SPRITE.w, ROD_SPRITE.h]).toEqual([32, 16]);
    expect(validateSprite(ROD_SPRITE)).toEqual([]);
    let opaque = 0;
    for (const row of ROD_SPRITE.frames[0]) for (const ch of row) {
      if (ch === TRANSPARENT) continue;
      opaque++;
      expect(cellIndex(ch)!).toBeLessThan(GEAR_PALETTE.length);
    }
    expect(opaque).toBeGreaterThan(40);
  });
});
