import { describe, expect, it } from 'vitest';
import { ticketRemainingMs } from '../../../game/rules/challenge';
import { ticketMinsLeft, ticketMinsOf } from './ticket';
import type { BountySnapshot } from './types';

const NOW = Date.parse('2026-10-13T00:01:00.000Z');
const ISSUED = '2026-10-13T00:00:00.000Z';
const snap = (tickets: BountySnapshot['tickets']): BountySnapshot =>
  ({ clearsToday: { general: 0, named: 0 }, progress: [], tickets });

describe('흔적(도전권) 남은 분', () => {
  it('유효하면 규칙 함수가 정한 남은 시간을 분으로 올림해 준다', () => {
    expect(ticketMinsLeft(ISSUED, NOW)).toBe(Math.ceil(ticketRemainingMs(ISSUED, NOW) / 60_000));
    expect(ticketMinsLeft(ISSUED, NOW)).toBeGreaterThan(0);
  });

  it('만료됐거나 깨진 시각이면 null이다 - 0분으로 보이지 않는다', () => {
    expect(ticketMinsLeft('2026-10-01T00:00:00.000Z', NOW)).toBeNull();
    expect(ticketMinsLeft('not-a-date', NOW)).toBeNull();
  });

  it('시계를 아직 안 찍었으면(nowMs 0) null이다', () => {
    expect(ticketMinsLeft(ISSUED, 0)).toBeNull();
  });

  it('의뢰의 흔적은 스냅샷에서 그 의뢰의 도전권으로 찾고, 없으면 null이다', () => {
    const s = snap([{ questId: 'a', issuedAt: ISSUED }]);
    expect(ticketMinsOf(s, 'a', NOW)).toBe(ticketMinsLeft(ISSUED, NOW));
    expect(ticketMinsOf(s, 'b', NOW)).toBeNull();
    expect(ticketMinsOf(null, 'a', NOW)).toBeNull();
  });
});
