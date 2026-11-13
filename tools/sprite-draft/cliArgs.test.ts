import { describe, expect, it } from 'vitest';
import { flagValue, idList, targetOf } from './cliArgs';

describe('cliArgs', () => {
  it('대상 종류 인자를 정의로 풀고 모르는 종류는 거부한다', () => {
    expect(targetOf('fish').kind).toBe('fish');
    expect(() => targetOf('whale')).toThrow(/fish\|boat\|gear\|dish\|bait\|artifact/);
    expect(() => targetOf(undefined)).toThrow(/대상 종류/);
  });

  it('--이름 값 인자를 읽고, 없으면 undefined다', () => {
    const args = ['fish', '--ids', 'a,b', '--dir', 'x'];
    expect(flagValue(args, '--ids')).toBe('a,b');
    expect(flagValue(args, '--ref')).toBeUndefined();
  });

  it('값이 빠진 플래그는 거부한다', () => {
    expect(() => flagValue(['--ids'], '--ids')).toThrow(/--ids/);
  });

  it('쉼표 목록은 공백과 빈 항목을 버린다', () => {
    expect(idList('a, b,,c ')).toEqual(['a', 'b', 'c']);
  });

  it('필수 목록이 비면 거부한다', () => {
    expect(() => idList(undefined, '--ids')).toThrow(/--ids/);
    expect(() => idList(' , ', '--ids')).toThrow(/--ids/);
  });
});
