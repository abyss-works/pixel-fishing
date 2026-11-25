import { describe, it, expect } from 'vitest';
import { pendingTutorial, TUTORIAL_BOAT_LABELS, TUTORIAL_PLAYER_LOOK, TUTORIAL_ZONE_NAMES } from './tutorial';

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

describe('튜토리얼 표시 모델', () => {
  it('도해에 쓰는 기본 외형·배 단계 이름·대표 해역 이름을 제공한다', () => {
    expect(TUTORIAL_PLAYER_LOOK).toEqual({ shirt: 0, pants: 0, hat: null });
    expect(TUTORIAL_BOAT_LABELS.tier1).toContain('(1단계)');
    expect(TUTORIAL_BOAT_LABELS.tier2).toContain('(2단계)');
    expect(TUTORIAL_ZONE_NAMES).toHaveLength(3);
  });
});
