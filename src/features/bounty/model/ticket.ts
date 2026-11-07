import { ticketRemainingMs } from '../../../game/rules/challenge';
import type { BountySnapshot } from './types';

// 흔적(도전권)의 남은 분 - 수배판, 의뢰 창, 바다 위 흔적 카드가 함께 쓰는 단일 판정.
// 남은 시간은 규칙 함수(ticketRemainingMs)가 정하고, 여기서는 분(올림)으로 바꾸며 유효 여부를 함께 낸다.

/** 남은 분(올림). 만료됐거나 시각이 깨졌거나 시계를 아직 안 찍었으면(nowMs 0) null - 0분으로 보이지 않게 한다 */
export function ticketMinsLeft(issuedAtISO: string, nowMs: number): number | null {
  if (nowMs === 0) return null;
  const leftMs = ticketRemainingMs(issuedAtISO, nowMs);
  return leftMs > 0 ? Math.ceil(leftMs / 60_000) : null;
}

/** 그 의뢰의 도전권을 스냅샷에서 찾아 남은 분을 준다. 도전권이 없거나 유효하지 않으면 null */
export function ticketMinsOf(snapshot: BountySnapshot | null, questId: string, nowMs: number): number | null {
  const ticket = snapshot?.tickets.find(row => row.questId === questId);
  return ticket ? ticketMinsLeft(ticket.issuedAt, nowMs) : null;
}
