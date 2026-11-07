import { describe, expect, it } from 'vitest';
import { fmtClearsLeft, fmtRatio } from './format';

describe('fmtRatio - "수량 / 상한" 표기', () => {
  it('자릿수 구분 쉼표를 쓰고 슬래시 앞뒤에 공백을 둔다', () => {
    expect(fmtRatio(2990, 2990)).toBe('2,990 / 2,990');
    expect(fmtRatio(0, 500)).toBe('0 / 500');
    expect(fmtRatio(84, 500)).toBe('84 / 500');
  });
});

describe('fmtClearsLeft - 오늘 남은 클리어 "남은 수/한도" 표기', () => {
  it('값이 있으면 슬래시로 붙여 쓰고, 아직 모르면 -를 쓴다', () => {
    expect(fmtClearsLeft(1, 1)).toBe('1/1');
    expect(fmtClearsLeft(0, 1)).toBe('0/1');
    expect(fmtClearsLeft(null, 1)).toBe('-');
  });
});
