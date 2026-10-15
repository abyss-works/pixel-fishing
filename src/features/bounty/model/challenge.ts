import { CHALLENGE_ROUNDS } from '../../../game/rules/balance';

/** 현재 도전에서 화면에 표시할 시도 번호를 계산한다. */
export function selectChallengeAttempt(run: { hits: number; misses: number }): number {
  return Math.min(run.hits + run.misses + 1, CHALLENGE_ROUNDS);
}
