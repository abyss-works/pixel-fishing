import { describe, it, expect } from 'vitest';
import { orbit, jumpHeight, JUMP_S, JUMP_PX } from './schoolView';

describe('궤도와 점프', () => {
  it('입질이면 궤도 반지름이 줄어 찌 쪽으로 몰린다', () => {
    const far = Math.max(...[0, 0.5, 1, 1.5].map(t => Math.hypot(orbit(0, t, false).dx, orbit(0, t, false).dy)));
    const near = Math.max(...[0, 0.5, 1, 1.5].map(t => Math.hypot(orbit(0, t, true).dx, orbit(0, t, true).dy)));
    expect(near).toBeLessThan(far);
  });

  it('점프는 0에서 시작해 중간에 최고, JUMP_S 뒤에는 0', () => {
    expect(jumpHeight(0)).toBe(0);
    expect(jumpHeight(JUMP_S / 2)).toBe(JUMP_PX);
    expect(jumpHeight(JUMP_S)).toBe(0);
    expect(jumpHeight(-1)).toBe(0);
    expect(jumpHeight(5)).toBe(0);
  });
});
