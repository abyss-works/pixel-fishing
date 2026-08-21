// 세이브 불변식 검증 — 순수 모듈, 클라이언트/서버(api/save.ts) 공유
// 클라이언트는 신뢰하지 않는다: 요청 변조로 어떤 GameState든 올 수 있다는 전제로,
// "게임 규칙상 도달 가능한 상태인가"를 검사한다. (추첨 자체의 정당성은 P2 서버 권위에서)
// .js 확장자 필수 — api/save.ts(Vercel Node 함수)가 이 파일을 그대로 import한다 (logic.ts 상단 설명 참조)
import { BOATS, COUPONS, FISH, MAX_BOAT, computeFame, upgradeCost } from './logic.js';
import type { GameState } from './logic.js';
import { CATCH_RATE_SLACK, ECONOMY_GIFT_SLACK, MIN_CATCH_INTERVAL_MS } from './balance.js';

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const bad = (reason: string): ValidationResult => ({ ok: false, reason });

const isCount = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0;

const isPositiveNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

// 누적 지출: 낚싯대 1→rod 강화 비용 합 + 배 1→boat 구매 비용 합
export function totalSpent(state: GameState): number {
  let spent = 0;
  for (let lv = 1; lv < state.rod; lv++) spent += upgradeCost(lv);
  for (let t = 0; t < state.boat; t++) spent += BOATS[t].price;
  return spent;
}

// 판매로 벌 수 있었던 최대 골드: (도감 − 현재 가방) 전량 판매 가정
export function maxSellable(state: GameState): number {
  const bagCount = new Map<string, number>();
  for (const id of state.bag) bagCount.set(id, (bagCount.get(id) ?? 0) + 1);
  let total = 0;
  for (const [id, n] of Object.entries(state.caught)) {
    const fish = FISH.find(f => f.id === id);
    if (!fish) continue;
    total += Math.max(n - (bagCount.get(id) ?? 0), 0) * fish.price;
  }
  return total;
}

// dynamic — DB(coupons 테이블)에서 조회한 동적 쿠폰. active 여부는 여기서 안 본다:
// 이미 세이브에 기록된 코드는 나중에 비활성화돼도 계속 유효해야 한다(가산 원칙).
export function couponGold(
  state: GameState, dynamic: Record<string, { gold: number }> = {},
): number {
  return state.coupons.reduce((s, code) => s + (COUPONS[code]?.gold ?? dynamic[code]?.gold ?? 0), 0);
}

const totalCaught = (s: GameState) => Object.values(s.caught).reduce((a, b) => a + b, 0);

/**
 * next: 저장하려는 상태 (migrate로 형태 정규화된 것)
 * prev: 서버에 있던 직전 상태 (없으면 null = 첫 저장)
 * elapsedMs: 직전 저장 이후 경과 시간 (prev 없으면 null)
 */
export function validateSave(
  next: GameState,
  prev: GameState | null,
  elapsedMs: number | null,
  dynamicCoupons: Record<string, { gold: number }> = {},
): ValidationResult {
  // ---- 단독 불변식 ----
  if (!isCount(next.gold)) return bad('gold');
  if (!isCount(next.fame)) return bad('fame');
  if (!Number.isInteger(next.rod) || next.rod < 1) return bad('rod');
  if (!Number.isInteger(next.boat) || next.boat < 0 || next.boat > MAX_BOAT) return bad('boat');

  const bagCount = new Map<string, number>();
  for (const id of next.bag) {
    if (!FISH.some(f => f.id === id)) return bad('bag:unknown-fish');
    bagCount.set(id, (bagCount.get(id) ?? 0) + 1);
  }
  for (const [id, n] of Object.entries(next.caught)) {
    if (!FISH.some(f => f.id === id)) return bad('caught:unknown-fish');
    if (!isCount(n)) return bad('caught:count');
  }
  // 월척(크기)·변이 (v0.3.0) — fame과 무관한 병렬 필드, computeFame 불변식은 안 건드림
  for (const [id, size] of Object.entries(next.maxSize)) {
    if (!FISH.some(f => f.id === id)) return bad('maxSize:unknown-fish');
    if (!isPositiveNumber(size)) return bad('maxSize:value');
  }
  for (const [id, v] of Object.entries(next.mutated)) {
    if (!FISH.some(f => f.id === id)) return bad('mutated:unknown-fish');
    if (typeof v !== 'boolean') return bad('mutated:value');
  }
  for (const [id, d] of Object.entries(next.firstCaught)) {
    if (!FISH.some(f => f.id === id)) return bad('firstCaught:unknown-fish');
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return bad('firstCaught:value');
  }
  for (const [id, n] of bagCount) {
    if (n > (next.caught[id] ?? 0)) return bad('bag>caught'); // 가방 ⊆ 도감
  }
  for (const code of next.coupons) {
    if (!(code in COUPONS) && !(code in dynamicCoupons)) return bad('coupon:unknown');
  }
  for (const id of next.locked) {
    if (!FISH.some(f => f.id === id)) return bad('locked:unknown-fish');
  }

  // 명성은 어획에서만 나온다 → 도감과 정확히 일치해야 함
  if (next.fame !== computeFame(next.caught)) return bad('fame!=caught');

  // 배는 명성 하한을 만족해야 구매 가능했던 것 (명성은 감소하지 않으므로 상태 불변식)
  if (next.boat > 0 && next.fame < BOATS[next.boat - 1].fameReq) return bad('boat:fame');

  // 경제 보존: 보유 골드 + 누적 지출 ≤ 판매 가능했던 총액 + 쿠폰 (+v1 증정 오차)
  if (next.gold + totalSpent(next) > maxSellable(next) + couponGold(next, dynamicCoupons) + ECONOMY_GIFT_SLACK) {
    return bad('economy');
  }

  // ---- 직전 상태 대비 (단조성 + 속도 상한) ----
  if (prev) {
    if (next.rod < prev.rod) return bad('rod:decrease');
    if (next.boat < prev.boat) return bad('boat:decrease');
    for (const [id, n] of Object.entries(prev.caught)) {
      if ((next.caught[id] ?? 0) < n) return bad('caught:decrease'); // 도감은 줄지 않는다
    }
    for (const [id, size] of Object.entries(prev.maxSize)) {
      if ((next.maxSize[id] ?? 0) < size) return bad('maxSize:decrease');
    }
    for (const [id, v] of Object.entries(prev.mutated)) {
      if (v && !next.mutated[id]) return bad('mutated:decrease');
    }
    for (const [id, d] of Object.entries(prev.firstCaught)) {
      if (next.firstCaught[id] !== d) return bad('firstCaught:changed'); // 최초 기록은 불변
    }
    for (const code of prev.coupons) {
      if (!next.coupons.includes(code)) return bad('coupon:removed');
    }
    if (elapsedMs !== null) {
      const delta = totalCaught(next) - totalCaught(prev);
      const maxDelta = CATCH_RATE_SLACK + Math.ceil(Math.max(elapsedMs, 0) / MIN_CATCH_INTERVAL_MS);
      if (delta > maxDelta) return bad('catch-rate'); // 인간 불가능한 어획 속도
    }
  }

  return { ok: true };
}
