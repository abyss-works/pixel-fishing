import { describe, it, expect } from 'vitest';
import { wobbleOffsets, rasterize } from './sprite';
import type { PixelSprite } from '../../content/sprites/types';

// 머리(왼쪽) 6칸 + 꼬리(오른쪽) 6칸 — 물고기는 왼쪽을 본다
const fish: PixelSprite = {
  w: 16, h: 4, palette: [{ shade: 1 }],
  frames: [[
    '................',
    '..000000000000..',
    '..000000000000..',
    '................',
  ]],
};

describe('열 흔들기', () => {
  it('머리 쪽 열은 움직이지 않고 꼬리 쪽 열만 움직인다', () => {
    const anyMoves = [0, 0.3, 0.7, 1.1].some(t => wobbleOffsets(fish, t, 3).slice(8).some(v => v !== 0));
    expect(anyMoves).toBe(true);
    for (const t of [0, 0.3, 0.7, 1.1]) {
      const off = wobbleOffsets(fish, t, 3);
      expect(off.length).toBe(fish.w);
      expect(off.slice(0, 8).every(v => v === 0), `t=${t}`).toBe(true);
    }
  });

  it('이동량은 한 격자 셀(배율 px)을 넘지 않고 정수다', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1, 2.3]) {
      for (const v of wobbleOffsets(fish, t, 4)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(4);
      }
    }
  });

  it('전부 투명한 격자는 움직이지 않는다', () => {
    const empty: PixelSprite = { w: 4, h: 1, palette: [], frames: [['....']] };
    expect(wobbleOffsets(empty, 0.4, 3)).toEqual([0, 0, 0, 0]);
  });
});

describe('래스터 캐시', () => {
  it('jsdom(canvas 없음)에서는 null을 돌려주고 던지지 않는다', () => {
    expect(rasterize(fish, ['#fff'], 2)).toBeNull();
    expect(rasterize(fish, ['#fff'], 2, 0, { outline: '#000', aura: '#ffd54f' })).toBeNull();
  });
});
