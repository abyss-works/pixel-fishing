// 네임드 챌린지 순수 규칙 — 시도 상태머신 + 도전권 유효 판정.
import { describe, it, expect } from 'vitest';
import {
  challengeWindowMs, newChallenge, strikeChallenge, ticketRemainingMs,
} from './challenge';
import { CHALLENGE_WINDOW_MS } from './balance';

const run = (marks: boolean[], need = 7) =>
  marks.reduce((s, hit) => strikeChallenge(s, hit, need), newChallenge());

describe('strikeChallenge', () => {
  it('네임드 체력만큼 맞히면 조기 성공한다', () => {
    expect(run([true, true, true, true, true, true], 6)).toEqual({ hits: 6, misses: 0, done: true, success: true });
    expect(run([true, true, true, true, true, true], 9).done).toBe(false);
    expect(run(Array(9).fill(true), 9).success).toBe(true);
  });

  it('체력과 무관하게 3실패까지는 계속, 4번째에 탈락한다', () => {
    for (const need of [6, 9]) {
      expect(run([false, false, false], need).done).toBe(false);
      expect(run([false, false, false, false], need))
        .toEqual({ hits: 0, misses: 4, done: true, success: false });
    }
  });

  it('끝난 뒤의 타격은 무시한다', () => {
    const done = run([true, true, true, true, true, true], 6);
    expect(strikeChallenge(done, false, 6)).toBe(done);
  });
});

describe('도전권 유효', () => {
  it('기본 4시간 — 유물 연장 없이 상수 그대로', () => {
    expect(challengeWindowMs()).toBe(CHALLENGE_WINDOW_MS);
    expect(CHALLENGE_WINDOW_MS).toBe(4 * 3600_000);
  });

  it('잔여 계산 — 만료·깨진 시각이면 0', () => {
    const issued = '2026-10-09T00:00:00.000Z';
    const t0 = Date.parse(issued);
    expect(ticketRemainingMs(issued, t0 + 30 * 60_000, CHALLENGE_WINDOW_MS)).toBe(210 * 60_000);
    expect(ticketRemainingMs(issued, t0 + 14400_000, CHALLENGE_WINDOW_MS)).toBe(0);
    expect(ticketRemainingMs(issued, t0 + 18000_000, CHALLENGE_WINDOW_MS)).toBe(0);
    expect(ticketRemainingMs('깨짐', t0, CHALLENGE_WINDOW_MS)).toBe(0);
  });
});
