import { describe, expect, it } from 'vitest';
import { tableMinWidth } from './tableLayout';

describe('tableMinWidth', () => {
  it('고정 열의 폭과 이름 열 최소 폭을 더한다', () => {
    expect(tableMinWidth(['3.5rem', null, '110px'], '8rem')).toBe('calc(3.5rem + 8rem + 110px)');
  });

  it('고정 열이 없으면 이름 열 최소 폭만 남는다', () => {
    expect(tableMinWidth([null], '8rem')).toBe('8rem');
  });

  it('이름 열이 없는 표는 고정 열의 합이다', () => {
    expect(tableMinWidth(['4rem', '5rem'], '8rem')).toBe('calc(4rem + 5rem)');
  });
});
