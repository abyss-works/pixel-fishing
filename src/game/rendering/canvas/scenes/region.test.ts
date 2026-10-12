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
