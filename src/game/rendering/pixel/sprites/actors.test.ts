import { describe, it, expect } from 'vitest';
import { drawHead, drawOtherPerson, drawPerson } from './actors';
import { HATS } from '../../../content/wardrobe';
import type { Ctx } from '../common';

interface RectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

function makeFakeCtx(): { ctx: Ctx; rects: RectCall[]; texts: { text: string; x: number; y: number }[]; alphas: number[] } {
  const rects: RectCall[] = [];
  const texts: { text: string; x: number; y: number }[] = [];
  const alphas: number[] = [];
  let fillStyle = '';
  let globalAlpha = 1;
  const ctx = {
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    get globalAlpha() { return globalAlpha; },
    set globalAlpha(v: number) { globalAlpha = v; alphas.push(v); },
    font: '',
    textAlign: 'left',
    strokeStyle: '',
    lineWidth: 1,
    save() {},
    restore() { globalAlpha = 1; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    measureText(str: string) { return { width: str.length * 6 }; },
    fillText(text: string, x: number, y: number) { texts.push({ text, x, y }); },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, color: fillStyle });
    },
  } as unknown as Ctx;
  return { ctx, rects, texts, alphas };
}

describe('drawPerson 모자 픽셀 경계', () => {
  it('57종 모든 모자의 fillRect 좌표가 person(16x22, 원점 7,21) 경계 안에 들어간다', () => {
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

    expect(achSignatures.size).toBe(52);
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

describe('drawOtherPerson 도보 타 플레이어 렌더링', () => {
  it('발 아래 그림자, 사람, 어두운 이름표 알약 배경, 낚싯줄·찌, 방치 표시를 그린다', () => {
    const active = makeFakeCtx();
    drawOtherPerson(active.ctx, {
      x: 100, y: 120, nick: '강태공', line: true, stale: false,
      bob: { x: 124, y: 132 }, idle: '5분',
    }, 1.0);
    expect(active.rects.length).toBeGreaterThan(5);
    expect(active.texts.some(t => t.text === '강태공')).toBe(true);
    expect(active.texts.some(t => t.text === '5분')).toBe(true);
    expect(active.rects.some(r => r.color === '#e53935')).toBe(true);

    const stale = makeFakeCtx();
    drawOtherPerson(stale.ctx, {
      x: 100, y: 120, nick: '자리비움', line: false, stale: true,
    }, 1.0);
    expect(stale.alphas[0]).toBeLessThan(0.5);
    expect(stale.rects.some(r => r.color === '#e53935')).toBe(false);
  });
});
