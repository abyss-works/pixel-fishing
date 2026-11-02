import { describe, it, expect } from 'vitest';
import { pendingTutorial } from './tutorial';

describe('pendingTutorial', () => {
  it('지금 켜진 트리거 중 아직 보지 않은 튜토리얼을 고른다', () => {
    expect(pendingTutorial(['village'], [])).toBe('village');
    expect(pendingTutorial(['sea'], ['village'])).toBe('sea');
  });

  it('본 튜토리얼과 켜지지 않은 트리거는 고르지 않는다', () => {
    expect(pendingTutorial(['village'], ['village'])).toBeNull();
    expect(pendingTutorial([], [])).toBeNull();
  });

  it('여러 트리거가 함께 켜지면 정해진 순서대로 하나씩 고른다', () => {
    expect(pendingTutorial(['bounty-named', 'sea'], [])).toBe('sea');
    expect(pendingTutorial(['bounty-named', 'sea'], ['sea'])).toBe('bounty-named');
  });
});
