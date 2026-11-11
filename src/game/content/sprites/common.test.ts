import { describe, it, expect } from 'vitest';
import { OUTLINE_DARK, SILHOUETTE } from './common';

describe('스프라이트 공통 색', () => {
  it('외곽선과 실루엣 색은 SPRITES.md가 정한 값이다', () => {
    expect(OUTLINE_DARK).toBe('#182540');
    expect(SILHOUETTE).toBe('#22314a');
  });
});
