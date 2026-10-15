import { describe, it, expect } from 'vitest';
import { cellIndex, paletteColors, validateSprite } from './types';
import type { PixelSprite } from './types';
import { shade } from '../../../shared/lib/color';

const sprite = (over: Partial<PixelSprite> = {}): PixelSprite => ({
  w: 4, h: 2, palette: ['#000', { shade: 1 }, { shade: 0.7 }],
  frames: [['.12.', '0..0']], ...over,
});

describe('픽셀 스프라이트 데이터', () => {
  it('팔레트 — 고정 색은 그대로, shade 슬롯은 기준색에서 파생된다', () => {
    expect(paletteColors(['#000', { shade: 1 }, { shade: 0.7 }], '#c8a165'))
      .toEqual(['#000', shade('#c8a165', 1), shade('#c8a165', 0.7)]);
  });

  it('격자 문자 — 0-9a-z는 인덱스, 투명과 미지 문자는 null', () => {
    expect(cellIndex('0')).toBe(0);
    expect(cellIndex('a')).toBe(10);
    expect(cellIndex('z')).toBe(35);
    expect(cellIndex('.')).toBeNull();
    expect(cellIndex('#')).toBeNull();
  });

  it('무결성 — 올바른 격자는 오류가 없다', () => {
    expect(validateSprite(sprite())).toEqual([]);
  });

  it('무결성 — 행 수·행 길이·문자·인덱스 범위를 각각 잡아낸다', () => {
    expect(validateSprite(sprite({ frames: [['.12.']] }))).toEqual(['frame 0: 1 rows, expected 2']);
    expect(validateSprite(sprite({ frames: [['.12.', '0.0']] }))).toEqual(['frame 0 row 1: 3 cols, expected 4']);
    expect(validateSprite(sprite({ frames: [['.1#.', '0..0']] }))).toEqual(["frame 0 row 0: unknown char '#'"]);
    expect(validateSprite(sprite({ frames: [['.19.', '0..0']] }))).toEqual(['frame 0 row 0: index 9 outside palette(3)']);
    expect(validateSprite(sprite({ frames: [] }))).toEqual(['frames is empty']);
  });
});
