// 네임드 도전 순수 규칙 — 시도 상태머신 + 도전권 유효 판정.
// 조우 창(UI)과 리듀서(resolveChallenge)가 같은 함수를 쓴다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { CHALLENGE_MISS_LIMIT, CHALLENGE_WINDOW_MS } from './balance.js';
import { bountyById } from '../content/bounties.js';
import { namedById } from '../content/named.js';

/** 의뢰의 결투 체력(성공에 필요한 히트 수) — 네임드 데이터가 정본. 네임드 의뢰가 아니면 null */
export function challengeHpOf(questId: string): number | null {
  const quest = bountyById(questId);
  const named = quest?.targetFish ? namedById(quest.targetFish) : undefined;
  return named ? named.hp : null;
}

/** 도전권 유효 기간 — 상수 그대로. UI와 서버 만료 판정이 같은 함수를 본다 */
export const challengeWindowMs = (): number => CHALLENGE_WINDOW_MS;

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

/** 도전권 잔여 ms — 만료·깨진 시각이면 0 (표시·서버 판정 공용) */
export function ticketRemainingMs(issuedAtISO: string, nowMs: number, windowMs: number): number {
  const issued = Date.parse(issuedAtISO);
  if (!Number.isFinite(issued)) return 0;
  return Math.max(0, issued + windowMs - nowMs);
}
