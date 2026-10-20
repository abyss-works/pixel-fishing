// 규칙 판정 
// "할 수 있는가? 없으면 왜?"를 값으로 답한다 — 상태 변경(게임 로직)과 분리된 순수 판정.
//
// 이 모듈이 존재하는 이유: 같은 규칙이 세 곳에 필요하기 때문이다.
//   ① 리듀서(applyAction) — 거부하고 사유를 남긴다
//   ② UI 버튼 — 비활성 여부 + 왜 안 되는지 안내
//   ③ 토스트 — 유저 언어 문구
// 예전엔 ①이 null로 사유를 버리고 ②가 규칙을 재구현했다(밸런스 변경 시 드리프트 위험).
// 이제 셋이 같은 함수를 부른다.
//
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { SPOTS } from '../content/spots.js';
import type { SpotId } from '../content/spots.js';
import { BOATS, MAX_BOAT } from '../content/boats.js';
import { bountyById, bountyKindOf, isBountyPort, LICENSE_TIER_OF } from '../content/bounties.js';
import type { BountyKind } from '../content/bounties.js';
import { artifactById } from '../content/artifacts.js';
import {
  upgradeCost, bountyDailyCap, CHALLENGE_MISS_LIMIT,
  EXHIBIT_SLOTS,
} from './balance.js';
import {
  challengeHpOf, challengeWindowMs, ticketRemainingMs,
} from './challenge.js';
import { bagCapacity, licenseConditions } from './logic.js';
import { GAME_DAY_RESET_TEXT } from './time.js';
import type { GameState } from './logic.js';

/** 규칙이 거부하는 이유 — 인프라 실패(에러 처리의 FailureKind)와 다른 축이다.
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
  | 'shop-closed' // 미끼 상점은 콜롬보항에서만 이용 가능
  | 'nickname-taken' // 이미 다른 유저가 쓰는 닉네임
  | 'no-license' // 바운티 헌팅 라이선스 미보유 — 구역 라이선스 없이 수주 불가
  | 'daily-cleared' // 그 갈래의 하루 클리어 한도 소진 — 클리어(보상 수령)를 센다
  | 'quest-incomplete' // 납품 조건 미달성
  | 'quest-active' // 같은 갈래의 의뢰가 이미 수주 중 — 갈래마다 한 번에 하나만 수주한다
  | 'dex-incomplete' // 라이선스 도감 조건 미달성
  | 'material-missing' // 유물 교환 재료 미보유 — 네임드 토벌로 1개씩 모은다
  | 'ticket-missing' // 도전권 없음 — 수주 중인 해역에서 낚으면 조우로 받는다
  | 'ticket-expired' // 도전권 기간 만료 — 다시 조우하면 받을 수 있다
  | 'slot-taken' // 전시 칸이 이미 차 있다 — 회수 후 진열한다
  | 'bag-full' // 가방이 상한이라 전시 개체를 회수할 수 없다
  | 'debug-forbidden' // 개발 도구 명령 — 운영 서버이거나 소유자·로컬이 아니다
  | 'bad-request'; // 형식 오류 — 정상 클라이언트에서는 나오지 않는다

export type RuleCheck = { ok: true } | { ok: false; reason: RejectReason };

const OK: RuleCheck = { ok: true };
const no = (reason: RejectReason): RuleCheck => ({ ok: false, reason });

/** 유저에게 보일 문구의 단일 근원 — Record라 새 사유를 추가하면 누락이 컴파일 에러가 된다 */
export const REJECT_TEXT: Record<RejectReason, string> = {
  'not-enough-gold': '골드가 부족해요.',
  'not-enough-fame': '명성이 부족해요. 물고기를 더 잡아 명성을 쌓아 보세요.',
  'max-boat': '이미 가장 좋은 배를 가지고 있어요.',
  'spot-locked': '이 해역에서 낚시하려면 더 좋은 배가 필요해요.',
  'coupon-invalid': '없는 쿠폰 코드예요.',
  'coupon-used': '이미 사용한 쿠폰이에요.',
  'relief-invalid': '지원 코드가 맞지 않아요. 이미 사용했거나 없는 코드예요.',
  'bait-not-owned': '가지고 있는 미끼가 없어요.',
  'shop-closed': '미끼는 콜롬보항의 향료전에서만 살 수 있어요.',
  'nickname-taken': '이미 쓰이는 닉네임이에요.',
  'no-license': '서버에 연결되지 않아 의뢰를 처리할 수 없어요. 연결된 뒤 다시 해 주세요.',
  'daily-cleared': `오늘 이 종류의 의뢰는 이미 마쳤어요. ${GAME_DAY_RESET_TEXT}가 지나면 다시 수주할 수 있어요.`,
  'quest-incomplete': '아직 마칠 조건을 채우지 못했어요.',
  'quest-active': '이미 수주 중인 의뢰가 있어요. 먼저 마쳐 주세요.',
  'dex-incomplete': '그 구역 도감을 아직 다 채우지 못했어요. 수배판에서 남은 조건을 확인해 보세요.',
  'material-missing': '교환 재료가 없어요. 네임드를 토벌해 보세요.',
  'ticket-missing': '흔적이 없어요. 수주 중인 구역에서 낚시하다 조우하면 흔적이 남아요.',
  'ticket-expired': '흔적이 식었어요. 다시 조우하면 새로 남아요.',
  'slot-taken': '그 전시 칸은 이미 차 있어요. 먼저 회수해 주세요.',
  'bag-full': '가방이 가득 차서 회수할 수 없어요. 물고기를 팔거나 놓아준 뒤 다시 해 보세요.',
  'debug-forbidden': '이 서버에서는 개발 도구 명령을 쓸 수 없어요. 운영 서버이거나 권한이 없는 계정이에요.',
  'bad-request': '처리할 수 없는 요청이에요.',
};

/** 전시대 이동 — slot 번호면 가방 → 그 칸(비어 있어야 한다), null이면 전시대 → 가방(상한 검사).
 *  전시 중인 개체를 다른 칸으로 바로 옮기는 것은 지원하지 않는다 — 회수 후 다시 진열한다. */
export function canExhibit(state: GameState, uid: string, slot: number | null): RuleCheck {
  if (slot === null) {
    if (!state.exhibit.some(i => i?.uid === uid)) return no('bad-request');
    return state.bag.length < bagCapacity(state.boat, state.bag) ? OK : no('bag-full');
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= EXHIBIT_SLOTS) return no('bad-request');
  if (!state.bag.some(i => i.uid === uid)) return no('bad-request');
  return state.exhibit[slot] ? no('slot-taken') : OK;
}

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

/** 서버 주입 수배 진실 — 오늘 클리어 횟수·완료·진행 목록은 DB가 들고 있다.
 *  라이선스 조건(명성·도감)은 상태에서 직접 본다 — 취득 절차가 없어 행이 없다.
 *  하루 경계(KST 04:00) 집계와 의뢰 만료를 서버가 끝낸 값만 들어온다. */
export interface BountyCtx {
  clearsToday: Record<BountyKind, number>; // 오늘 클리어(보상 수령)한 횟수 — 갈래별
  tickets: { questId: string; issuedAt: string }[]; // 유효·만료 가리지 않은 도전권 목록 (수주 중인 의뢰의 것만)
  complete: string[];          // 보상을 받을 수 있는 의뢰 id
  active: string[];            // 수주 중 의뢰 id — 만료되지 않은 것만. 마쳤지만 보상을 받지 않은 의뢰도 포함
}


/** 의뢰 수주 — 라이선스 조건은 상태로, 하루 한도와 수주 중 여부는 서버 주입 DB 진실로 본다.
 *  갈래(일반 의뢰·네임드 토벌)마다 하루 클리어 한도가 있고 한 번에 하나만 수주한다. */
export function canAcceptQuest(
  state: GameState, questId: string, port: string, ctx: BountyCtx | undefined,
): RuleCheck {
  const q = bountyById(questId);
  if (!q) return no('bad-request');
  if (!isBountyPort(port)) return no('bad-request'); // 고향(home)에는 수배 창구가 없다
  // 주장 항구와 실제 위치가 다르면 변조다 — buyBait의 상점 위치 검증과 같은 판단
  if (state.location.kind !== 'base' || state.location.id !== port) return no('bad-request');
  // 라이선스 조건 직검 — 취득 절차 없이 조건 충족이면 열린다
  for (const c of licenseConditions(state, q.zone, LICENSE_TIER_OF[q.difficulty])) {
    if (!c.ok) return no(c.key === 'fame' ? 'not-enough-fame' : 'dex-incomplete');
  }
  if (!ctx) return no('no-license');
  const kind = bountyKindOf(q);
  // 한도가 먼저다 — 진행 중인 의뢰를 마쳐도 오늘 몫이 없으면 수주할 수 없다
  if (ctx.clearsToday[kind] >= bountyDailyCap(kind)) return no('daily-cleared');
  const holding = ctx.active.some(id => {
    const held = bountyById(id);
    return held !== undefined && bountyKindOf(held) === kind;
  });
  if (holding) return no('quest-active');
  return OK;
}

/** 의뢰 납품 — 완료 여부는 서버가 DB 진행도로 판단해 주입한다 */
export function canDeliverBounty(questId: string, ctx: BountyCtx | undefined): RuleCheck {
  const q = bountyById(questId);
  if (!q) return no('bad-request');
  return ctx && ctx.complete.includes(questId) ? OK : no('quest-incomplete');
}

/** 도전 결과 확정 — 시도 자체는 클라 주장(PERFECT 선례)이라 서버는
 *  티켓 유효 + 수주 활성 + 주장 정합성만 본다. 티켓은 성공·실패 모두 소모한다.
 *  오프라인 dev는 주입이 없어 닫힌다. */
export function canResolveChallenge(
  questId: string,
  claimed: { success: boolean; hits: number; misses: number },
  nowISO: string, ctx: BountyCtx | undefined,
): RuleCheck {
  const q = bountyById(questId);
  if (!q || q.difficulty !== 'named') return no('bad-request');
  if (!ctx) return no('no-license');
  if (!ctx.active.includes(questId)) return no('bad-request');
  const { success, hits, misses } = claimed;
  const need = challengeHpOf(questId);
  if (need === null) return no('bad-request');
  // 성공 = 네임드 체력만큼 히트·실패 한도 미만, 실패 = 실패 한도 도달 (체력은 네임드마다, 실패 한도는 공통)
  const coherent = success
    ? hits >= need && misses < CHALLENGE_MISS_LIMIT
    : misses >= CHALLENGE_MISS_LIMIT;
  if (!coherent) return no('bad-request');
  const ticket = ctx.tickets.find(t => t.questId === questId);
  if (!ticket) return no('ticket-missing');
  const left = ticketRemainingMs(ticket.issuedAt, Date.parse(nowISO), challengeWindowMs());
  if (!(left > 0)) return no('ticket-expired');
  return OK;
}

/** 유물 교환 — 재료 보유만 본다. 이미 가진 유물은 거부가 아니라 멱등 수용으로,
 *  리듀서가 상태 그대로·이벤트 없이 돌려준다 (setActiveBait null 선례). */
export function canExchangeArtifact(
  state: GameState, artifactId: string,
): RuleCheck {
  const art = artifactById(artifactId);
  if (!art) return no('bad-request');
  if ((state.items[art.materialId] ?? 0) < 1) return no('material-missing');
  return OK;
}
