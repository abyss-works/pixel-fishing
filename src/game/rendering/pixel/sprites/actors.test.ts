import { describe, it, expect } from 'vitest';
import { drawHead, drawPerson } from './actors';
import { HATS } from '../../../content/wardrobe';
import type { Ctx } from '../common';

interface RectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

function makeFakeCtx(): { ctx: Ctx; rects: RectCall[] } {
  const rects: RectCall[] = [];
  let fillStyle = '';
  const ctx = {
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, color: fillStyle });
    },
  } as unknown as Ctx;
  return { ctx, rects };
}

describe('drawPerson 모자 픽셀 경계', () => {
  it('55종 모든 모자의 fillRect 좌표가 person(16x22, 원점 7,21) 경계 안에 들어간다', () => {
    const px = 7;
    const py = 21;
    // drawPerson 호출 시 머리, 몸통, 바지 외에 모자가 그리는 rect만 추출
    const base = makeFakeCtx();
    drawPerson(base.ctx, px, py, { shirt: 0, pants: 0, hat: null });
    // 모자 없을 때는 머리(1), 머리카락(2), 셔츠(1), 바지(1) = 5개
    expect(base.rects.length).toBe(5);

    const achSignatures = new Set<string>();

    for (const hat of HATS) {
      const { ctx, rects } = makeFakeCtx();
      drawPerson(ctx, px, py, { shirt: 0, pants: 0, hat: hat.id });
      // 머리(index 0), 모자(index 1 .. length-3), 셔츠(length-2), 바지(length-1)
      const hatRects = rects.slice(1, -2);
      expect(hatRects.length, `${hat.id} hatRects`).toBeGreaterThan(0);

      for (const r of hatRects) {
        expect(r.x, `${hat.id} x`).toBeGreaterThanOrEqual(px - 6);
        expect(r.x + r.w, `${hat.id} x+w`).toBeLessThanOrEqual(px + 8);
        expect(r.y, `${hat.id} y`).toBeGreaterThanOrEqual(py - 20);
        expect(r.y + r.h, `${hat.id} y+h`).toBeLessThanOrEqual(py - 13);
      }

      if (hat.source === 'achievement') {
        const sig = hatRects.map(r => `${r.x - px},${r.y - py},${r.w},${r.h},${r.color}`).join('|');
        achSignatures.add(sig);
      }
    }

    expect(achSignatures.size).toBe(50);
  });
});

describe('drawHead 모자 픽셀 경계 (headOnly 12x10)', () => {
  it('기본·업적 모자 전 종과 모자 없음 상태가 headOnly 12x10 캔버스 경계 [0..12, 0..10] 안에 들어간다', () => {
    const hx = 6;
    const hy = 10;
    const w = 12;
    const h = 10;

    for (const hatId of [null, ...HATS.map(hat => hat.id)]) {
      const { ctx, rects } = makeFakeCtx();
      drawHead(ctx, hx, hy, { shirt: 0, pants: 0, hat: hatId });
      expect(rects.length, `${hatId ?? 'none'} rects`).toBeGreaterThan(0);
      for (const r of rects) {
        expect(r.x, `${hatId ?? 'none'} x`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, `${hatId ?? 'none'} x+w`).toBeLessThanOrEqual(w);
        expect(r.y, `${hatId ?? 'none'} y`).toBeGreaterThanOrEqual(0);
        expect(r.y + r.h, `${hatId ?? 'none'} y+h`).toBeLessThanOrEqual(h);
      }
    }
  });
});
