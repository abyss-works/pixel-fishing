// 네임드 챌린지 순수 규칙 — 시도 상태머신 + 도전권 유효 판정.
import { describe, it, expect } from 'vitest';
import {
  newChallenge, strikeChallenge, TICKET_EXPIRY_TEXT, ticketExpiresAtMs, ticketRemainingMs,
} from './challenge';

const run = (marks: boolean[], need = 7) =>
  marks.reduce((s, hit) => strikeChallenge(s, hit, need), newChallenge());

describe('strikeChallenge', () => {
  it('네임드 체력만큼 맞히면 조기 성공한다', () => {
    expect(run([true, true, true, true, true, true], 6)).toEqual({ hits: 6, misses: 0, done: true, success: true });
    expect(run([true, true, true, true, true, true], 9).done).toBe(false);
    expect(run(Array(9).fill(true), 9).success).toBe(true);
  });

  it('체력과 무관하게 2실패까지는 계속, 3번째 실패에 탈락한다', () => {
    for (const need of [6, 9]) {
      expect(run([false, false], need).done).toBe(false);
      expect(run([false, false, false], need))
        .toEqual({ hits: 0, misses: 3, done: true, success: false });
    }
  });

  it('끝난 뒤의 타격은 무시한다', () => {
    const done = run([true, true, true, true, true, true], 6);
    expect(strikeChallenge(done, false, 6)).toBe(done);
  });
});

describe('도전권 유효 — 발급한 게임 날짜가 끝나는 KST 04:00까지', () => {
  it('오전에 발급하면 4시간이 지나도 다음 날 04:00까지 유효하다', () => {
    const issued = '2026-10-20T00:30:00.000Z'; // KST 09:30
    const expires = Date.parse('2026-10-20T19:00:00.000Z'); // 다음 날 KST 04:00
    expect(ticketExpiresAtMs(issued)).toBe(expires);
    expect(ticketRemainingMs(issued, Date.parse(issued) + 5 * 3600_000)).toBe(expires - Date.parse(issued) - 5 * 3600_000);
    expect(ticketRemainingMs(issued, expires - 60_000)).toBe(60_000);
    expect(ticketRemainingMs(issued, expires)).toBe(0);
  });

  it('KST 04:00 직전에 발급하면 경계에서 바로 만료된다', () => {
    const issued = '2026-10-20T18:50:00.000Z'; // KST 03:50 — 전날 게임 날짜
    expect(ticketExpiresAtMs(issued)).toBe(Date.parse('2026-10-20T19:00:00.000Z'));
  });

  it('깨진 시각이면 만료로 본다', () => {
    expect(ticketRemainingMs('깨짐', Date.parse('2026-10-20T00:00:00.000Z'))).toBe(0);
  });

  it('안내 문구는 경계 시각을 쓴다', () => {
    expect(TICKET_EXPIRY_TEXT).toBe('한국 시간 새벽 4시까지');
  });
});
