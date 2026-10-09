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
import { bountyById, LICENSE_TIER_OF } from '../data/bounties.js';
import { upgradeCost, BOUNTY_DAILY_CAP, BOUNTY_PORT_DAILY_CAP } from './balance.js';
import { licenseConditions } from './logic.js';
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
  | 'shop-closed' // 미끼 상점은 콜롬보 항구에서만 이용 가능
  | 'nickname-taken' // 이미 다른 유저가 쓰는 닉네임
  | 'no-license' // 수배 라이선스 미보유 — 해역 라이선스 없이 수주 불가
  | 'no-tickets' // 일일 통합 수주 상한 소진
  | 'port-limit' // 수주 항구의 일일 상한 소진
  | 'quest-incomplete' // 납품 조건 미달성
  | 'quest-active' // 이미 수주 중인 의뢰 — 중복 수주는 진행도를 리셋하므로 거부
  | 'dex-incomplete' // 라이선스 도감 조건 미달성
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
  'shop-closed': '미끼 상점은 콜롬보 항구에서만 이용할 수 있다.',
  'nickname-taken': '이미 쓰이는 닉네임이다.',
  'no-license': '수배 라이선스가 없다 — 명성을 쌓아 해역 라이선스를 받자.',
  'no-tickets': '오늘의 수주권을 다 썼다 — 내일 다시 오자.',
  'port-limit': '이 항구에서는 오늘 이미 수주했다 — 다른 항구로 가보자.',
  'quest-incomplete': '아직 납품 조건을 채우지 못했다.',
  'quest-active': '이미 수주 중인 의뢰다.',
  'dex-incomplete': '도감이 아직 비었다 — 해당 해역 도감을 채우자.',
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

/** 서버 주입 수배 진실 — 일일 카운트·완료·진행 목록은 DB가 들고 있다.
 *  라이선스 조건(명성·도감)은 상태에서 직접 본다 — 취득 절차가 없어 행이 없다.
 *  KST 날짜 경계 집계를 서버가 끝낸 값만 들어온다. */
export interface BountyCtx {
  acceptsToday: number;        // 통합 수주 횟수
  acceptsAtPortToday: number;  // 수주 항구의 오늘 횟수
  complete: string[];          // 납품 가능 의뢰 id
  active: string[];            // 진행 중 의뢰 id (중복 수주 거부용)
}

/** 수배 창구 항구 — 고향(home)에 수배 창구가 없다 (spec 4절) */
const BOUNTY_PORTS = ['harbor', 'manila', 'colombo'];

/** 의뢰 수주 — 라이선스 조건은 상태로, 상한은 서버 주입 DB 진실로 본다 */
export function canAcceptQuest(
  state: GameState, questId: string, port: string, ctx: BountyCtx | undefined,
): RuleCheck {
  const q = bountyById(questId);
  if (!q) return no('bad-request');
  if (!BOUNTY_PORTS.includes(port)) return no('bad-request');
  // 주장 항구와 실제 위치가 다르면 변조다 — buyBait의 상점 위치 검증과 같은 판단
  if (state.location.kind !== 'base' || state.location.id !== port) return no('bad-request');
  // 라이선스 조건 직검 — 취득 절차 없이 조건 충족이면 열린다
  for (const c of licenseConditions(state, q.zone, LICENSE_TIER_OF[q.difficulty])) {
    if (!c.ok) return no(c.key === 'fame' ? 'not-enough-fame' : 'dex-incomplete');
  }
  if (!ctx) return no('no-license');
  if (ctx.active.includes(questId)) return no('quest-active');
  if (ctx.acceptsToday >= BOUNTY_DAILY_CAP) return no('no-tickets');
  if (ctx.acceptsAtPortToday >= BOUNTY_PORT_DAILY_CAP) return no('port-limit');
  return OK;
}

/** 의뢰 납품 — 완료 여부는 서버가 DB 진행도로 판단해 주입한다 */
export function canDeliverBounty(questId: string, ctx: BountyCtx | undefined): RuleCheck {
  const q = bountyById(questId);
  if (!q) return no('bad-request');
  return ctx && ctx.complete.includes(questId) ? OK : no('quest-incomplete');
}
