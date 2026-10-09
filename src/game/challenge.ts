// 네임드 챌린지 순수 규칙 — 시도 상태머신 + 도전권 유효 판정.
// UI(ChallengeModal)와 리듀서(resolveChallenge)가 같은 함수를 쓴다.
// 상대경로 .js 확장자 필수 — api/action.ts(Node 순수 ESM)가 이 체인을 직접 import한다.
import {
  CHALLENGE_MAX_MISS, CHALLENGE_ROUNDS, CHALLENGE_WINDOW_MS,
} from './balance.js';
import { ARTIFACTS } from '../data/artifacts.js';
import type { GameState } from './logic.js';

/** 조기 성공에 필요한 히트 수 — 10회 중 3실패까지 허용이라 7히트면 끝난다 */
export const CHALLENGE_NEED_HITS = CHALLENGE_ROUNDS - CHALLENGE_MAX_MISS;

/** 도전권 유효 기간 — 아티팩트 연장 훅 포함 (현재 연장은 없음, 곱 1) */
export function challengeWindowMs(state: Pick<GameState, 'artifacts'>): number {
  const owned = new Set(state.artifacts);
  const mult = ARTIFACTS.reduce((m, a) =>
    owned.has(a.id) ? Math.max(m, a.effects.challengeWindowMult ?? 1) : m, 1);
  return CHALLENGE_WINDOW_MS * mult;
}

export interface ChallengeRun {
  hits: number;
  misses: number;
  done: boolean;
  success: boolean;
}

/** 새 챌린지 — 10회 시도, 7히트 조기 성공, 4번째 실패에 탈락 */
export const newChallenge = (): ChallengeRun =>
  ({ hits: 0, misses: 0, done: false, success: false });

/** 1회 타격 반영 — 끝난 뒤의 타격은 무시한다 (이중 제출 방어) */
export function strikeChallenge(s: ChallengeRun, hit: boolean): ChallengeRun {
  if (s.done) return s;
  const hits = s.hits + (hit ? 1 : 0);
  const misses = s.misses + (hit ? 0 : 1);
  if (hits >= CHALLENGE_NEED_HITS) return { hits, misses, done: true, success: true };
  if (misses > CHALLENGE_MAX_MISS) return { hits, misses, done: true, success: false };
  if (hits + misses >= CHALLENGE_ROUNDS) {
    return { hits, misses, done: true, success: hits >= CHALLENGE_NEED_HITS };
  }
  return { hits, misses, done: false, success: false };
}

/** 도전권 잔여 ms — 만료·깨진 시각이면 0 (표시·서버 판정 공용) */
export function ticketRemainingMs(issuedAtISO: string, nowMs: number, windowMs: number): number {
  const issued = Date.parse(issuedAtISO);
  if (!Number.isFinite(issued)) return 0;
  return Math.max(0, issued + windowMs - nowMs);
}
