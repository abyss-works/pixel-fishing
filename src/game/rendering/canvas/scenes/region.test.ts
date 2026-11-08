import { describe, it, expect, vi } from 'vitest';
import { vignette } from './region';

const stubCtx = () => ({
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
}) as unknown as CanvasRenderingContext2D;

describe('vignette', () => {
  it('같은 ctx에는 1회만 생성한다', () => {
    const ctx = stubCtx();
    vignette(ctx);
    vignette(ctx);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
  });

  it('다른 ctx에는 각각 생성한다', () => {
    const a = stubCtx();
    const b = stubCtx();
    vignette(a);
    vignette(b);
    expect(a.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(b.createRadialGradient).toHaveBeenCalledTimes(1);
  });
});

describe('vignette 크기', () => {
  it('캔버스 크기가 바뀌면 다시 생성한다', () => {
    const ctx = stubCtx();
    vignette(ctx, 504, 904);
    vignette(ctx, 504, 904);
    vignette(ctx, 504, 800);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(2);
  });
});

describe('vignette 반지름', () => {
  const radii = (w: number, h: number) => {
    const ctx = stubCtx();
    vignette(ctx, w, h);
    const [, , r0, , , r1] = (ctx.createRadialGradient as unknown as { mock: { calls: number[][] } }).mock.calls[0];
    return { r0, r1 };
  };

  it('PC 시야는 안쪽 0.38h, 바깥쪽 0.62w를 유지한다', () => {
    const { r0, r1 } = radii(896, 504);
    expect(r0).toBeCloseTo(504 * 0.38);
    expect(r1).toBeCloseTo(896 * 0.62);
  });

  it('세로로 긴 모바일 시야에서도 바깥 반지름이 안쪽보다 크다', () => {
    for (const [w, h] of [[504, 904], [504, 1100], [504, 416]]) {
      const { r0, r1 } = radii(w, h);
      expect(r1).toBeGreaterThan(r0);
    }
  });
});
