// 규칙 판정 
// "할 수 있는가? 없으면 왜?"를 값으로 답한다 — 상태 변경(logic.ts)과 분리된 순수 판정.
//
// 이 모듈이 존재하는 이유: 같은 규칙이 세 곳에 필요하기 때문이다.
//   ① 리듀서(applyAction) — 거부하고 사유를 남긴다
//   ② UI 버튼 — 비활성 여부 + 왜 안 되는지 안내
//   ③ 토스트 — 유저 언어 문구
// 예전엔 ①이 null로 사유를 버리고 ②가 규칙을 재구현했다(밸런스 변경 시 드리프트 위험).
// 이제 셋이 같은 함수를 부른다.
//
// 상대경로 .js 확장자 필수 — api/action.ts(Node 순수 ESM)가 이 체인을 직접 import한다.
import { SPOTS } from '../data/spots.js';
import type { SpotId } from '../data/spots.js';
import { BOATS, MAX_BOAT } from '../data/boats.js';
import { upgradeCost } from './logic.js';
import type { GameState } from './logic.js';

/** 규칙이 거부하는 이유 — 인프라 실패(errors.ts의 FailureKind)와 다른 축이다.
    이쪽은 "게임 규칙의 정상적인 답", 저쪽은 "예외적 사고" */
export type RejectReason =
  | 'not-enough-gold'
  | 'not-enough-fame'
  | 'max-boat'
  | 'spot-locked'
  | 'coupon-invalid'
  | 'coupon-used'
  | 'relief-invalid' // 지원 코드 — 없거나 이미 사용됐거나(서버가 구분 없이 한 사유로 답한다)
  | 'bait-not-owned' // 활성화하려는 미끼를 보유하지 않았다 (구매 전 활성 시도)
  | 'bad-request'; // 형식 오류 — 정상 클라이언트에서는 나오지 않는다

export type RuleCheck = { ok: true } | { ok: false; reason: RejectReason };

const OK: RuleCheck = { ok: true };
const no = (reason: RejectReason): RuleCheck => ({ ok: false, reason });

/** 유저에게 보일 문구의 단일 근원 — Record라 새 사유를 추가하면 누락이 컴파일 에러가 된다 */
export const REJECT_TEXT: Record<RejectReason, string> = {
  'not-enough-gold': '골드가 부족하다.',
  'not-enough-fame': '명성이 부족하다 — 물고기를 더 잡아 명성을 쌓자.',
  'max-boat': '이미 최고의 배다.',
  'spot-locked': '이 수역에서 낚시하려면 더 좋은 배가 필요하다.',
  'coupon-invalid': '없는 쿠폰 코드다.',
  'coupon-used': '이미 사용한 쿠폰이다.',
  'relief-invalid': '지원 코드가 맞지 않다 — 이미 사용했거나 없는 코드다.',
  'bait-not-owned': '보유한 미끼가 없다.',
  'bad-request': '처리할 수 없는 요청이다.',
};

/** 낚싯대 강화 — 골드만 본다 (상한 없음, 무한 골드 싱크) */
export function canUpgradeRod(state: GameState): RuleCheck {
  return state.gold >= upgradeCost(state.rod) ? OK : no('not-enough-gold');
}

/** 배 구매 — 사유 3종을 구분한다. 명성은 하한 검증만(소모 없음) */
export function canBuyBoat(state: GameState): RuleCheck {
  if (state.boat >= MAX_BOAT) return no('max-boat');
  const next = BOATS[state.boat]; // tier = boat + 1
  if (state.fame < next.fameReq) return no('not-enough-fame');
  if (state.gold < next.price) return no('not-enough-gold');
  return OK;
}

/** 수역 게이트 — 클라(즉시 안내)와 서버(권위 재검증)가 같은 함수를 부른다 */
export function canFish(state: GameState, spotId: SpotId): RuleCheck {
  const spot = SPOTS.find(s => s.id === spotId);
  if (!spot) return no('bad-request');
  return state.boat >= spot.boatTier ? OK : no('spot-locked');
}
