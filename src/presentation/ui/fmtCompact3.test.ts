import { describe, expect, it } from 'vitest';
import { fmtCompact, fmtCompact3 } from './format';

describe('fmtCompact3 - 헤더용 유효숫자 3자리 줄임 표기', () => {
  it('999까지는 그대로 보인다', () => {
    expect(fmtCompact3(0)).toBe('0');
    expect(fmtCompact3(60)).toBe('60');
    expect(fmtCompact3(999)).toBe('999');
  });

  it('1000부터 단위(K, M, B, T)로 줄이고 유효숫자 3자리까지 버림으로 보인다', () => {
    expect(fmtCompact3(1_000)).toBe('1K');
    expect(fmtCompact3(1_234)).toBe('1.23K');
    expect(fmtCompact3(9_999)).toBe('9.99K');
    expect(fmtCompact3(10_000)).toBe('10K');
    expect(fmtCompact3(12_400)).toBe('12.4K');
    expect(fmtCompact3(12_999)).toBe('12.9K');
    expect(fmtCompact3(99_999)).toBe('99.9K');
    expect(fmtCompact3(100_000)).toBe('100K');
    expect(fmtCompact3(999_999)).toBe('999K');
  });

  it('단위가 올라가는 경계는 정확히 그 값에서 올라가고, 위 단위도 같은 규칙이다', () => {
    expect(fmtCompact3(1_000_000)).toBe('1M');
    expect(fmtCompact3(1_234_567)).toBe('1.23M');
    expect(fmtCompact3(999_999_999)).toBe('999M');
    expect(fmtCompact3(1_000_000_000)).toBe('1B');
    expect(fmtCompact3(1_000_000_000_000)).toBe('1T');
    expect(fmtCompact3(123_456_789_012_345)).toBe('123T');
  });

  it('끝자리 0은 생략하고, 가진 것보다 많아 보이지 않게 버린다', () => {
    expect(fmtCompact3(1_200)).toBe('1.2K');
    expect(fmtCompact3(1_999)).toBe('1.99K');
    expect(fmtCompact3(1_005)).toBe('1K');
  });

  it('글자 수는 3자리 숫자와 단위 한 글자, 소수점 하나를 넘지 않는다', () => {
    for (const n of [999, 1_000, 99_999, 999_999, 1_999_999, 12_345_678, 999_999_999_999]) {
      expect(fmtCompact3(n).length).toBeLessThanOrEqual(5);
    }
  });

  it('기존 줄임 표기(fmtCompact)의 규칙은 바뀌지 않는다', () => {
    expect(fmtCompact(999_999)).toBe('999.9K');
    expect(fmtCompact(9_999)).toBe('9,999');
  });
});
