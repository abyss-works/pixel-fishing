// 네임드 챌린지 순수 규칙 — 시도 상태머신 + 도전권 유효 판정.
import { describe, it, expect } from 'vitest';
import {
  CHALLENGE_NEED_HITS, challengeWindowMs, newChallenge, strikeChallenge, ticketRemainingMs,
} from './challenge';
import { CHALLENGE_WINDOW_MS } from './balance';
import { newState } from './logic';

const run = (marks: boolean[]) => marks.reduce(strikeChallenge, newChallenge());

describe('strikeChallenge', () => {
  it('7히트면 조기 성공한다', () => {
    const s = run([true, true, true, true, true, true, true]);
    expect(s).toEqual({ hits: 7, misses: 0, done: true, success: true });
  });

  it('3실패까지는 계속, 4번째에 탈락한다', () => {
    expect(run([false, false, false]).done).toBe(false);
    expect(run([false, false, false, false]))
      .toEqual({ hits: 0, misses: 4, done: true, success: false });
  });

  it('10회를 채우면 히트로 승패가 갈린다', () => {
    expect(run([true, true, true, true, true, true, false, false, false, true]).success).toBe(true);
    expect(run([true, true, true, true, true, true, false, false, false, false]).success).toBe(false);
  });

  it('끝난 뒤의 타격은 무시한다', () => {
    const done = run([true, true, true, true, true, true, true]);
    expect(strikeChallenge(done, false)).toBe(done);
  });
});

describe('도전권 유효', () => {
  it('기본 1시간 — 아티팩트 없으면 그대로', () => {
    expect(challengeWindowMs(newState())).toBe(CHALLENGE_WINDOW_MS);
  });

  it('잔여 계산 — 만료·깨진 시각이면 0', () => {
    const issued = '2026-10-09T00:00:00.000Z';
    const t0 = Date.parse(issued);
    expect(ticketRemainingMs(issued, t0 + 30 * 60_000, CHALLENGE_WINDOW_MS)).toBe(30 * 60_000);
    expect(ticketRemainingMs(issued, t0 + 3600_000, CHALLENGE_WINDOW_MS)).toBe(0);
    expect(ticketRemainingMs(issued, t0 + 7200_000, CHALLENGE_WINDOW_MS)).toBe(0);
    expect(ticketRemainingMs('깨짐', t0, CHALLENGE_WINDOW_MS)).toBe(0);
  });
});

describe('CHALLENGE_NEED_HITS', () => {
  it('10회 중 3실패 허용 = 7히트', () => {
    expect(CHALLENGE_NEED_HITS).toBe(7);
  });
});
