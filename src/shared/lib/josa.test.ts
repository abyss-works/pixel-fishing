import { describe, expect, it } from 'vitest';
import { josa } from './josa';

describe('josa', () => {
  it('마지막 글자에 받침이 있으면 앞 조사, 없으면 뒤 조사를 고른다', () => {
    expect(josa('판매가', '이/가')).toBe('가');
    expect(josa('희귀 어종', '이/가')).toBe('이');
    expect(josa('청새치', '을/를')).toBe('를');
    expect(josa('메갈로돈', '을/를')).toBe('을');
  });

  it("'으로/로'는 받침 ㄹ도 받침이 없는 쪽으로 고른다", () => {
    expect(josa('먼바다', '으로/로')).toBe('로');
    expect(josa('심해', '으로/로')).toBe('로');
    expect(josa('불꽃', '으로/로')).toBe('으로');
    expect(josa('아침별', '으로/로')).toBe('로');
  });

  it('한글이 아닌 글자로 끝나면 받침이 없는 쪽을 고른다', () => {
    expect(josa('gksruf', '이/가')).toBe('가');
    expect(josa('A1', '을/를')).toBe('를');
  });
});
