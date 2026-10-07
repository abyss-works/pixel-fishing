// 닉네임 규칙 — 정본은 mgmt/spec/account.md 5절.
// 리듀서(setNickname)·클라 사전 체크·서버가 공유하는 순수 검증이다.
//
// 상대 import는 .js 확장자 필수 — api/action.ts(Node 순수 ESM)가 직접 import한다.
import { NICK_ADJ, NICK_FISH } from '../data/nicknames.js';
import type { RuleCheck } from './rules.js';

/** 가중치 길이 — 한글 2 · 영문/숫자/구분자 1. 허용 범위는 2~16이다. */
export function nicknameWeight(name: string): number {
  let w = 0;
  for (const ch of name) w += /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch) ? 2 : 1;
  return w;
}

const CHARSET = /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9_-]+$/;
const HAS_LETTER = /[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]/;

export function checkNickname(v: unknown): RuleCheck {
  if (typeof v !== 'string') return { ok: false, reason: 'bad-request' };
  if (!CHARSET.test(v)) return { ok: false, reason: 'bad-request' };
  if (!HAS_LETTER.test(v)) return { ok: false, reason: 'bad-request' };
  const w = nicknameWeight(v);
  if (w < 2 || w > 16) return { ok: false, reason: 'bad-request' };
  return { ok: true };
}

/** 게스트 자동명 — 형용사_어종. 중복은 호출자(DB UNIQUE)가 가린다. */
export function pickGuestName(rng: () => number): string {
  const a = NICK_ADJ[Math.floor(rng() * NICK_ADJ.length)];
  const f = NICK_FISH[Math.floor(rng() * NICK_FISH.length)];
  return `${a}_${f}`;
}
