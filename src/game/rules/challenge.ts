// 네임드 도전 순수 규칙 — 시도 상태머신 + 도전권 유효 판정.
// 조우 창(UI)과 리듀서(resolveChallenge)가 같은 함수를 쓴다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { CHALLENGE_MISS_LIMIT } from './balance.js';
import { GAME_DAY_RESET_TEXT, gameDayStartISO } from './time.js';
import { bountyById } from '../content/bounties.js';
import { namedById } from '../content/named.js';

/** 의뢰의 결투 체력(성공에 필요한 히트 수) — 네임드 데이터가 정본. 네임드 의뢰가 아니면 null */
export function challengeHpOf(questId: string): number | null {
  const quest = bountyById(questId);
  const named = quest?.targetFish ? namedById(quest.targetFish) : undefined;
  return named ? named.hp : null;
}


export interface ChallengeRun {
  hits: number;
  misses: number;
  done: boolean;
  success: boolean;
}

/** 새 도전 — 네임드 체력만큼 맞히면 성공, 3번째 실패에 탈락 */
export const newChallenge = (): ChallengeRun =>
  ({ hits: 0, misses: 0, done: false, success: false });

/** 1회 타격 반영 — 끝난 뒤의 타격은 무시한다 (이중 제출 방어) */
export function strikeChallenge(s: ChallengeRun, hit: boolean, needHits: number): ChallengeRun {
  if (s.done) return s;
  const hits = s.hits + (hit ? 1 : 0);
  const misses = s.misses + (hit ? 0 : 1);
  if (hits >= needHits) return { hits, misses, done: true, success: true };
  if (misses >= CHALLENGE_MISS_LIMIT) return { hits, misses, done: true, success: false };
  return { hits, misses, done: false, success: false };
}

// 도전권 만료 기준 — 발급한 게임 날짜가 끝나는 KST 04:00. 네임드 의뢰와 같은 경계에서 사라진다.
// 표시·알림 문구·서버 판정은 모두 아래 함수와 문구만 본다(호출부가 기준을 조립하지 않는다).

/** 도전권 만료 시각(ms) — 깨진 발급 시각이면 NaN */
export function ticketExpiresAtMs(issuedAtISO: string): number {
  if (!Number.isFinite(Date.parse(issuedAtISO))) return NaN;
  return Date.parse(gameDayStartISO(issuedAtISO)) + 86_400_000;
}

/** 도전권 잔여 ms — 만료·깨진 시각이면 0 (표시·서버 판정 공용) */
export function ticketRemainingMs(issuedAtISO: string, nowMs: number): number {
  const expires = ticketExpiresAtMs(issuedAtISO);
  return Number.isFinite(expires) ? Math.max(0, expires - nowMs) : 0;
}

/** 지금 시각 기준으로 이미 만료된 도전권의 발급 시각 — 개발 도구가 만료 상태를 만들 때 쓴다 */
export function expiredTicketIssuedAt(nowMs: number): string {
  return new Date(Date.parse(gameDayStartISO(new Date(nowMs).toISOString())) - 60_000).toISOString();
}

/** 도전권이 언제까지 남는지 안내하는 구 */
export const TICKET_EXPIRY_TEXT = `${GAME_DAY_RESET_TEXT}까지`;
