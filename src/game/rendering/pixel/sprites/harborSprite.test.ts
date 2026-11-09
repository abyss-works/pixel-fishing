// 항구 그림은 부두 사각형과 맞닿는 픽셀이 있어야 한다 — 사각형 경계와 그린 모양이 어긋나 생기는 빈칸을 막는다.
import { describe, expect, it } from 'vitest';
import { HARBORS } from '../../../world';
import type { Rect } from '../../../world';
import { BUILDING_SPRITES } from './buildings';

function drawnRects(building: Rect, flip: boolean): Rect[] {
  const out: Rect[] = [];
  const ctx = { fillStyle: '', fillRect: (x: number, y: number, w: number, h: number) => out.push({ x, y, w, h }) };
  BUILDING_SPRITES.harbor.draw(ctx as unknown as CanvasRenderingContext2D, building, flip);
  return out;
}

const span = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
// 변이 맞닿고 맞닿은 변을 따라 겹치는 길이가 있다
const touches = (a: Rect, b: Rect) =>
  ((a.x + a.w === b.x || b.x + b.w === a.x) && span(a.y, a.y + a.h, b.y, b.y + b.h) > 0)
  || ((a.y + a.h === b.y || b.y + b.h === a.y) && span(a.x, a.x + a.w, b.x, b.x + b.w) > 0);

describe.each(Object.entries(HARBORS))('항구 %s 그림', (_id, h) => {
  it('그린 픽셀이 부두 사각형과 맞닿는다', () => {
    const pieces = drawnRects(h.building, h.flip);
    expect(pieces.some(p => touches(p, h.dock))).toBe(true);
  });

  it('그림이 건물 사각형 밖으로 나가지 않는다', () => {
    for (const p of drawnRects(h.building, h.flip)) {
      expect(p.x).toBeGreaterThanOrEqual(h.building.x);
      expect(p.y).toBeGreaterThanOrEqual(h.building.y);
      expect(p.x + p.w).toBeLessThanOrEqual(h.building.x + h.building.w);
      expect(p.y + p.h).toBeLessThanOrEqual(h.building.y + h.building.h);
    }
  });
});
