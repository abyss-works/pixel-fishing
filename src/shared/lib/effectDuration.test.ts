import { describe, expect, it } from 'vitest';
import { fmtEffectDuration } from './effectDuration';

describe('fmtEffectDuration — 슬롯 지속·남은 시간', () => {
  it('1분 이상은 분까지만 표시하고 초는 버린다', () => {
    expect(fmtEffectDuration(9 * 60 + 59)).toBe('9시간 59분');
    expect(fmtEffectDuration(8 * 60 + 12 + 59 / 60)).toBe('8시간 12분');
    expect(fmtEffectDuration(2.5)).toBe('2분');
    expect(fmtEffectDuration(1)).toBe('1분');
  });

  it('1분 미만은 초만 표시하고 0 이하는 0초다', () => {
    expect(fmtEffectDuration(54 / 60)).toBe('54초');
    expect(fmtEffectDuration(0.5)).toBe('30초');
    expect(fmtEffectDuration(0)).toBe('0초');
    expect(fmtEffectDuration(-1)).toBe('0초');
  });
});
