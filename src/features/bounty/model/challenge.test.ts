import { describe, expect, it } from 'vitest';
import { CHALLENGE_ROUNDS } from '../../../game/rules/balance';
import { selectChallengeAttempt } from './challenge';

describe('도전 화면 데이터', () => {
  it('히트와 실패 수를 다음 시도 번호로 바꾸고 마지막 시도에서 고정한다', () => {
    expect(selectChallengeAttempt({ hits: 2, misses: 1 })).toBe(4);
    expect(selectChallengeAttempt({ hits: CHALLENGE_ROUNDS - 1, misses: 2 }))
      .toBe(CHALLENGE_ROUNDS);
  });
});
