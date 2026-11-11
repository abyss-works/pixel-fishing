import { describe, expect, it } from 'vitest';
import { gradeName } from './gradeName';

describe('등급 괄호 표기', () => {
  it('이름 뒤에 등급 이름을 괄호로 붙인다', () => {
    expect(gradeName('생명의 기운', '일반')).toBe('생명의 기운(일반)');
    expect(gradeName('미끼', '전설')).toBe('미끼(전설)');
  });

  it('등급을 이름 앞에 붙이거나 대괄호로 감싸지 않는다', () => {
    const text = gradeName('생명의 기운', '영웅');
    expect(text.startsWith('영웅')).toBe(false);
    expect(text).not.toContain('[');
  });
});
