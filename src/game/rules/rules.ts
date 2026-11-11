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
import { BOATS, MAX_BOAT, boatGateText } from '../content/boats.js';
import { BOUNTY_PORT_ZONE, bountyById, bountyKindOf, isBountyPort, LICENSE_TIER_OF, zoneOfPort } from '../content/bounties.js';
import type { BountyKind, BountyPort, BountyZone } from '../content/bounties.js';
import { zoneById } from '../content/zones.js';
import type { BaseId } from '../content/places.js';
import { ARTIFACT_MAX_LEVEL, artifactById, artifactHasLevel, artifactLevelCost } from '../content/artifacts.js';
import { artifactLevelOf, dailyClearCap } from './artifactLevel.js';
import { PANTS_COLORS, SHIRT_COLORS, hatById } from '../content/wardrobe.js';
import {
  upgradeCost, CHALLENGE_MISS_LIMIT,
  EXHIBIT_SLOTS,
} from './balance.js';
import {
  duelHpOf, ticketRemainingMs,
} from './challenge.js';
import { bagCapacity, licenseConditions } from './logic.js';
import { GAME_DAY_RESET_TEXT } from './time.js';
import type { GameState } from './logic.js';
import type { NamedPity } from './pity.js';

/** 규칙이 거부하는 이유 — 인프라 실패(에러 처리의 FailureKind)와 다른 축이다.
    이쪽은 "게임 규칙의 정상적인 답", 저쪽은 "예외적 사고" */
export type RejectReason =
  | 'not-enough-gold'
  | 'not-enough-fame'
  | 'max-boat'
  | 'spot-locked'
  | 'zone-locked' // 항구가 있는 바다의 진입 배 단계 미달 — 빠른 이동 목적지 재검증
  | 'coupon-invalid'
  | 'coupon-used'
  | 'relief-invalid' // 지원 코드 — 없거나 이미 사용됐거나(서버가 구분 없이 한 사유로 답한다)
  | 'mail-unavailable' // 받을 수 없는 우편 — 없거나 남의 것이거나 이미 받았다(서버가 구분 없이 답한다)
  | 'nickname-taken' // 이미 다른 유저가 쓰는 닉네임
  | 'no-license' // 바운티 헌팅 라이선스 미보유 — 구역 라이선스 없이 수주 불가
  | 'daily-cleared' // 그 갈래의 하루 클리어 한도 소진 — 클리어(보상 수령)를 센다
  | 'quest-incomplete' // 납품 조건 미달성
  | 'quest-active' // 같은 갈래의 의뢰가 이미 수주 중 — 갈래마다 한 번에 하나만 수주한다
  | 'dex-incomplete' // 라이선스 도감 조건 미달성
  | 'material-missing' // 유물 교환 재료 미보유 — 네임드 토벌로 1개씩 모은다
  | 'ticket-missing' // 도전권 없음 — 수주 중인 해역에서 낚으면 조우로 받는다
  | 'ticket-expired' // 도전권 기간 만료 — 다시 조우하면 받을 수 있다
  | 'hat-owned' // 이미 가진 모자를 다시 사려 했다
  | 'hat-not-owned' // 갖지 않은 모자를 쓰려 했다
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
  'zone-locked': '그 항구가 있는 바다에 들어서려면 더 좋은 배가 필요해요.',
  'coupon-invalid': '없는 쿠폰 코드예요.',
  'coupon-used': '이미 사용한 쿠폰이에요.',
  'relief-invalid': '지원 코드가 맞지 않아요. 이미 사용했거나 없는 코드예요.',
  'mail-unavailable': '이미 받았거나 받을 수 없는 우편이에요.',
  'nickname-taken': '이미 쓰이는 닉네임이에요.',
  'no-license': '오프라인에서는 의뢰를 수주하거나 마칠 수 없어요. 서버에 연결된 뒤 다시 해 주세요.',
  'daily-cleared': `오늘 이 종류의 의뢰는 이미 마쳤어요. ${GAME_DAY_RESET_TEXT}가 지나면 다시 수주할 수 있어요.`,
  'quest-incomplete': '아직 마칠 조건을 채우지 못했어요.',
  'quest-active': '이미 수주 중인 의뢰가 있어요. 먼저 마쳐 주세요.',
  'dex-incomplete': '그 구역 도감을 아직 다 채우지 못했어요. 수배판에서 남은 조건을 확인해 보세요.',
  'material-missing': '교환 재료가 없어요. 네임드를 토벌해 보세요.',
  'ticket-missing': '흔적이 없어요. 수주 중인 구역에서 낚시하다 조우하면 흔적이 남아요.',
  'ticket-expired': '흔적이 사라졌어요. 다시 조우하면 새로 남아요.',
  'hat-owned': '이미 가진 모자예요.',
  'hat-not-owned': '아직 가지지 않은 모자예요.',
  'slot-taken': '그 전시 칸은 이미 차 있어요. 먼저 회수해 주세요.',
  'bag-full': '가방이 가득 차서 회수할 수 없어요. 물고기를 팔거나 놓아준 뒤 다시 해 보세요.',
  'debug-forbidden': '이 서버에서는 개발 도구 명령을 쓸 수 없어요. 운영 서버이거나 권한이 없는 계정이에요.',
  'bad-request': '처리할 수 없는 요청이에요.',
};

/** 전시대 이동 — slot 번호면 가방 → 그 칸(비어 있어야 한다), null이면 전시대 → 가방(상한 검사).
 *  전시 중인 개체를 다른 칸으로 바로 옮기는 것은 지원하지 않는다 — 회수 후 다시 진열한다.
 *  @param bagBonus 가방 칸에 더하는 비율(길드 가방 용량 보너스) */
export function canExhibit(state: GameState, uid: string, slot: number | null, bagBonus = 0): RuleCheck {
  if (slot === null) {
    if (!state.exhibit.some(i => i?.uid === uid)) return no('bad-request');
    return state.bag.length < bagCapacity(state.boat, state.bag, bagBonus) ? OK : no('bag-full');
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= EXHIBIT_SLOTS) return no('bad-request');
  if (!state.bag.some(i => i.uid === uid)) return no('bad-request');
  return state.exhibit[slot] ? no('slot-taken') : OK;
}

/** 옷 바꾸기 — 웃옷·바지 번호가 각 팔레트 안의 정수여야 한다 */
export function canChangeClothes(shirt: unknown, pants: unknown): RuleCheck {
  const inRange = (n: unknown, len: number) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < len;
  return inRange(shirt, SHIRT_COLORS.length) && inRange(pants, PANTS_COLORS.length) ? OK : no('bad-request');
}

/** 모자 사기 — 있는 모자, 아직 없는 모자, 골드가 가격 이상 */
export function canBuyHat(state: GameState, hat: unknown): RuleCheck {
  const h = hatById(hat);
  if (!h) return no('bad-request');
  if (state.hats.includes(h.id)) return no('hat-owned');
  return state.gold >= h.price ? OK : no('not-enough-gold');
}

/** 모자 쓰기 — null은 벗기이며 언제나 된다. 아니면 가진 모자여야 한다 */
export function canWearHat(state: GameState, hat: unknown): RuleCheck {
  if (hat === null) return OK;
  const h = hatById(hat);
  if (!h) return no('bad-request');
  return state.hats.includes(h.id) ? OK : no('hat-not-owned');
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

/** 항구의 진입 배 단계 — 항구가 있는 최상위 존의 entryBoat. 게이트가 없는 바다와 항구가 아닌 거점(집)은 0 */
function portGate(base: string): number {
  const zone = zoneOfPort(base);
  return zone ? zoneById(zone)?.entryBoat ?? 0 : 0;
}

/** 거점 이동 — 항구로 옮기려면 배가 그 바다의 진입 단계 이상이어야 한다.
 *  바다에서 접안할 때는 이미 경계 게이트를 지났으므로 항상 통과하고, 빠른 이동만 실제로 걸린다 */
export function canEnterBase(state: GameState, base: string): RuleCheck {
  return state.boat >= portGate(base) ? OK : no('zone-locked');
}

/** 빠른 이동 목적지 — 지금 있는 항구를 뺀 항구 목록. locked는 갈 수 없을 때 보일 사유(갈 수 있으면 null) */
export interface FastTravelTarget { port: BountyPort; zone: BountyZone; locked: string | null }

export function fastTravelTargets(state: GameState, from: BaseId): FastTravelTarget[] {
  return (Object.keys(BOUNTY_PORT_ZONE) as BountyPort[]).filter(port => port !== from).map(port => ({
    port,
    zone: BOUNTY_PORT_ZONE[port],
    locked: canEnterBase(state, port).ok ? null : `${boatGateText(portGate(port))} 필요`,
  }));
}

/** 서버 주입 수배 진실 — 오늘 클리어 횟수·완료·진행 목록은 DB가 들고 있다.
 *  라이선스 조건(도감)은 상태에서 직접 본다 — 취득 절차가 없어 행이 없다.
 *  하루 경계(KST 04:00) 집계와 의뢰 만료를 서버가 끝낸 값만 들어온다. */
export interface BountyCtx {
  clearsToday: Record<BountyKind, number>; // 오늘 클리어(보상 수령)한 횟수 — 갈래별
  tickets: { questId: string; issuedAt: string }[]; // 유효·만료 가리지 않은 도전권 목록 (만료된 의뢰의 것도 포함 — 결투 확정이 만료로 거부한다)
  complete: string[];          // 보상을 받을 수 있는 의뢰 id
  active: string[];            // 수주 중 의뢰 id — 만료되지 않은 것만. 마쳤지만 보상을 받지 않은 의뢰도 포함
}

/** 캐치의 네임드 조우 대상 — 수주 중이고 아직 마치지 않은 의뢰만. 마친 토벌은 보상 수령만 남았다 */
export function encounterQuests(ctx: BountyCtx | null | undefined): string[] {
  return ctx ? ctx.active.filter(id => !ctx.complete.includes(id)) : [];
}


/** 의뢰 수주 — 라이선스 조건은 상태로, 하루 한도와 수주 중 여부는 서버 주입 DB 진실로 본다.
 *  갈래(일반 의뢰·네임드 토벌)마다 하루 클리어 한도가 있고 한 번에 하나만 수주한다. */
export function canAcceptQuest(
  state: GameState, questId: string, port: string, ctx: BountyCtx | undefined,
): RuleCheck {
  const q = bountyById(questId);
  if (!q) return no('bad-request');
  if (!isBountyPort(port)) return no('bad-request'); // 고향(home)에는 수배 창구가 없다
  // 의뢰는 그 구역 항구의 수배판에서만 수주한다
  if (zoneOfPort(port) !== q.zone) return no('bad-request');
  // 주장 항구와 실제 위치가 다르면 변조다
  if (state.location.kind !== 'base' || state.location.id !== port) return no('bad-request');
  // 라이선스 조건 직검 — 취득 절차 없이 조건 충족이면 열린다
  for (const c of licenseConditions(state, q.zone, LICENSE_TIER_OF[q.difficulty])) {
    if (!c.ok) return no('dex-incomplete');
  }
  if (!ctx) return no('no-license');
  const kind = bountyKindOf(q);
  // 한도가 먼저다 — 진행 중인 의뢰를 마쳐도 오늘 몫이 없으면 수주할 수 없다
  if (ctx.clearsToday[kind] >= dailyClearCap(state, kind)) return no('daily-cleared');
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
 *  티켓 유효 + 수주 활성 + 주장 정합성만 본다. 성공에 필요한 히트는 그날의 상처를 뺀 결투 체력이다.
 *  티켓은 성공·실패 모두 소모한다. 오프라인 dev는 주입이 없어 닫힌다. */
export function canResolveChallenge(
  questId: string,
  claimed: { success: boolean; hits: number; misses: number },
  nowISO: string, ctx: BountyCtx | undefined, pity: NamedPity,
): RuleCheck {
  const q = bountyById(questId);
  if (!q || q.difficulty !== 'named') return no('bad-request');
  if (!ctx) return no('no-license');
  // 만료 판정을 먼저 한다 — 결투 중 KST 04:00을 넘기면 의뢰도 수주 목록에서 빠지므로, 그 경우도 만료로 알린다
  const ticket = ctx.tickets.find(t => t.questId === questId);
  if (ticket && !(ticketRemainingMs(ticket.issuedAt, Date.parse(nowISO)) > 0)) return no('ticket-expired');
  // 이미 마친 토벌은 보상 수령만 남았다 — 결투를 다시 확정하지 않는다
  if (!ctx.active.includes(questId) || ctx.complete.includes(questId)) return no('bad-request');
  const { success, hits, misses } = claimed;
  const need = duelHpOf(questId, pity, nowISO);
  if (need === null) return no('bad-request');
  // 성공 = 네임드 체력만큼 히트·실패 한도 미만, 실패 = 실패 한도 도달 (체력은 네임드마다, 실패 한도는 공통)
  const coherent = success
    ? hits >= need && misses < CHALLENGE_MISS_LIMIT
    : misses >= CHALLENGE_MISS_LIMIT;
  if (!coherent) return no('bad-request');
  if (!ticket) return no('ticket-missing');
  return OK;
}

/** 유물 교환 — 재료 보유만 본다. 이미 가진 유물은 거부가 아니라 멱등 수용으로,
 *  리듀서가 상태 그대로·이벤트 없이 돌려준다. */
export function canExchangeArtifact(
  state: GameState, artifactId: string,
): RuleCheck {
  const art = artifactById(artifactId);
  if (!art) return no('bad-request');
  if ((state.items[art.materialId] ?? 0) < 1) return no('material-missing');
  return OK;
}

/** 유물 레벨업 — 보유한 레벨 유물만, 최고 레벨 아래에서, 다음 레벨 비용만큼 그 교환 재료가 있어야 한다.
 *  갖지 않은 유물, 전설 유물, 최고 레벨 유물은 화면이 보내지 않는 요청이라 bad-request다 */
export function canLevelUpArtifact(
  state: GameState, artifactId: string,
): RuleCheck {
  const art = artifactById(artifactId);
  if (!art || !artifactHasLevel(art)) return no('bad-request');
  const level = artifactLevelOf(state, art.id);
  if (level === 0 || level >= ARTIFACT_MAX_LEVEL) return no('bad-request');
  if ((state.items[art.materialId] ?? 0) < artifactLevelCost(level + 1)) return no('material-missing');
  return OK;
}
