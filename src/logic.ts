// 순수 게임 규칙 — DOM 의존 없음.
// 수치 튜닝은 balance.ts, 콘텐츠는 data/ (이 파일은 기존 import 경로 호환을 위해 re-export).
import { JUDGMENT_MULT, ROD } from './balance';
import { RARITY } from './data/rarity';
import { SPOTS } from './data/spots';
import type { SpotId } from './data/spots';
import { FISH } from './data/fish';
import type { Fish } from './data/fish';
import { BOATS, MAX_BOAT } from './data/boats';

export { JUDGMENT_MULT };
export { RARITY } from './data/rarity';
export type { Rarity, RarityId } from './data/rarity';
export { SPOTS } from './data/spots';
export type { Spot, SpotId } from './data/spots';
export { FISH } from './data/fish';
export type { Fish } from './data/fish';
export { BOATS, MAX_BOAT } from './data/boats';
export type { Boat } from './data/boats';
export { COUPONS } from './data/coupons';

export type Judgment = 'perfect' | 'normal' | 'auto';

export interface GameState {
  v: 5;
  gold: number;
  fame: number; // 명성 — 무한 누적, 직접 상태 변화 없음, 구매 시 하한 검증용
  boat: number; // 0(없음, 마을 낚시만)~4
  rod: number;  // 1~∞ (무한 강화, 스탯은 점근 수렴)
  bag: string[];                  // 잡은 물고기 id 목록 (미판매)
  caught: Record<string, number>; // 도감: id → 누적 마릿수
  coupons: string[];              // 사용한 쿠폰 코드
  locked: string[];               // 잠근 어종 id — 전부 판매에서 제외 (실수 방지)
}

export interface RodStats {
  biteMin: number; // 입질 최소 대기(초)
  biteMax: number; // 입질 최대 대기(초)
  sweep: number;   // 타이밍 바 커서가 끝까지 가는 시간(초) = 챔질 가능 시간
  zone: number;    // PERFECT 존 크기 (바 전체 대비 비율, 중앙 배치)
}

// 낚싯대 성장 곡선 t: 레벨 1 → 0, 레벨 ∞ → 1 (계수는 balance.ROD)
export function rodCurveT(level: number): number {
  return 1 - 1 / (1 + ROD.curveK * (level - 1));
}

// 낚싯대 = 무한 강화. 스탯은 점근 수렴(상한 없음, 효율 체감) — 무한 플레이 원칙.
export function rodStats(level: number): RodStats {
  const t = rodCurveT(level);
  const lerp = (r: { from: number; to: number }) => r.from + (r.to - r.from) * t;
  return {
    biteMin: lerp(ROD.biteMin),
    biteMax: lerp(ROD.biteMax),
    sweep: lerp(ROD.sweep),
    zone: lerp(ROD.zone),
  };
}

export function upgradeCost(level: number): number {
  return Math.round(ROD.costBase * Math.pow(ROD.costGrowth, level - 1));
}

// 챔질 판정: 커서 위치(0~1)가 중앙 존 안이면 PERFECT
export function judgeTiming(pos: number, zone: number): Judgment {
  return Math.abs(pos - 0.5) <= zone / 2 ? 'perfect' : 'normal';
}

// 추첨: 일반 외 등급 가중치 ×rareMult (판정 배수), 일반 가중치 ×commonMult (방치 페널티)
export function rollFish(
  spotId: SpotId, rareMult = 1, rng: () => number = Math.random, commonMult = 1,
): Fish {
  const pool = FISH.filter(f => f.spot === spotId);
  const weights = pool.map(f =>
    RARITY[f.rarity].weight * (f.rarity === 'common' ? commonMult : rareMult));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function newState(): GameState {
  return { v: 5, gold: 0, fame: 0, boat: 0, rod: 1, bag: [], caught: {}, coupons: [], locked: [] };
}

// 쿠폰 — 데이터는 data/coupons.ts, 검증/지급 규칙은 여기
import { COUPONS } from './data/coupons';

export type CouponResult =
  | { ok: true; state: GameState; reward: { gold: number; desc: string } }
  | { ok: false; reason: 'invalid' | 'used' };

export function redeemCoupon(state: GameState, codeRaw: string): CouponResult {
  const code = codeRaw.trim();
  const c = COUPONS[code];
  if (!c) return { ok: false, reason: 'invalid' };
  if (state.coupons.includes(code)) return { ok: false, reason: 'used' };
  return {
    ok: true,
    reward: c,
    state: { ...state, gold: state.gold + c.gold, coupons: [...state.coupons, code] },
  };
}

// 도감 기록에서 명성 소급 계산 — 마이그레이션 보상: 잡은 만큼 전부 인정, 데이터 손실 없음
export function computeFame(caught: Record<string, number>): number {
  let fame = 0;
  for (const [id, n] of Object.entries(caught)) {
    const f = FISH.find(x => x.id === id);
    if (f && typeof n === 'number') fame += RARITY[f.rarity].fame * n;
  }
  return fame;
}

// ---------- 세이브 마이그레이션 체인  ----------
// 스키마가 바뀔 때마다 "vN → vN+1" 함수 하나를 추가한다. 옛 세이브는 순차 적용으로
// 항상 최신 스키마에 도달 — 하위호환 절대 규칙의 구현.

type AnySave = Record<string, unknown>;

const safeCaught = (s: AnySave): Record<string, number> =>
  typeof s.caught === 'object' && s.caught !== null ? (s.caught as Record<string, number>) : {};

const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  // v1(xp 시절, v 필드 없음) → v2: 배 시스템 도입 — 기존 유저에게 조각배 증정
  1: s => ({ ...s, v: 2, boat: typeof s.boat === 'number' ? s.boat : 1 }),
  // v2 → v3: 배 0단계(없음) 허용 — 필드 변화 없음
  2: s => ({ ...s, v: 3 }),
  // v3 → v4: 명성 도입(도감에서 소급 계산) + 쿠폰 기록
  3: s => ({
    ...s,
    v: 4,
    fame: typeof s.fame === 'number' ? s.fame : computeFame(safeCaught(s)),
    coupons: [],
  }),
  // v4 → v5: 어종 잠금 도입 (전부 판매 제외 목록)
  4: s => ({ ...s, v: 5, locked: [] }),
};

export function migrate(raw: unknown): GameState {
  const base = newState();
  if (typeof raw !== 'object' || raw === null) return base;
  let s: AnySave = { ...(raw as AnySave) };
  let v = typeof s.v === 'number' ? s.v : 1;
  while (v < base.v) {
    const step = MIGRATIONS[v];
    if (!step) break;
    s = step(s);
    v++;
  }
  // 최종 위생 처리 — 손상된 필드는 기본값으로
  return {
    ...base,
    gold: typeof s.gold === 'number' ? s.gold : 0,
    fame: typeof s.fame === 'number' ? s.fame : 0,
    boat: typeof s.boat === 'number' ? s.boat : 0,
    rod: typeof s.rod === 'number' ? s.rod : 1,
    bag: Array.isArray(s.bag) ? s.bag.filter((id): id is string => typeof id === 'string') : [],
    caught: safeCaught(s),
    coupons: Array.isArray(s.coupons)
      ? s.coupons.filter((c): c is string => typeof c === 'string') : [],
    locked: Array.isArray(s.locked)
      ? s.locked.filter((c): c is string => typeof c === 'string') : [],
  };
}

// ---------- 상태 변경 ----------

export function addCatch(state: GameState, fish: Fish): GameState {
  return {
    ...state,
    bag: [...state.bag, fish.id],
    caught: { ...state.caught, [fish.id]: (state.caught[fish.id] ?? 0) + 1 },
    fame: state.fame + RARITY[fish.rarity].fame,
  };
}

export function bagValue(state: GameState): number {
  return state.bag.reduce((s, id) => s + (FISH.find(f => f.id === id)?.price ?? 0), 0);
}

// 판매 가능액 = 가방 중 잠기지 않은 어종만 (잠금 = 실수 판매 방지, R1b)
export function sellableValue(state: GameState): number {
  return state.bag
    .filter(id => !state.locked.includes(id))
    .reduce((s, id) => s + (FISH.find(f => f.id === id)?.price ?? 0), 0);
}

// 선택 판매 — ids에 포함된 어종만 판매. 잠근 어종은 ids에 있어도 팔리지 않는다(이중 방어)
export function sellSelected(state: GameState, ids: readonly string[]): GameState {
  const sell = new Set(ids.filter(id => !state.locked.includes(id)));
  const gold = state.bag
    .filter(id => sell.has(id))
    .reduce((s, id) => s + (FISH.find(f => f.id === id)?.price ?? 0), 0);
  return {
    ...state,
    gold: state.gold + gold,
    bag: state.bag.filter(id => !sell.has(id)),
  };
}

// 전부 판매 — 잠근 어종은 가방에 남는다
export function sellAll(state: GameState): GameState {
  return sellSelected(state, state.bag);
}

// 어종 잠금 토글 (가방 탭) — 잠긴 어종은 전부 판매에서 제외
export function toggleLock(state: GameState, fishId: string): GameState {
  return {
    ...state,
    locked: state.locked.includes(fishId)
      ? state.locked.filter(id => id !== fishId)
      : [...state.locked, fishId],
  };
}

// 낚싯대 강화: 골드 박치기, 상한 없음 (무한 골드 싱크)
export function tryUpgrade(state: GameState): GameState | null {
  const cost = upgradeCost(state.rod);
  if (state.gold < cost) return null;
  return { ...state, gold: state.gold - cost, rod: state.rod + 1 };
}

// 배 구매: 골드 차감 + 명성 하한 검증(명성은 소모하지 않음). boat 0 → 조각배부터.
export function tryBuyBoat(state: GameState): GameState | null {
  if (state.boat >= MAX_BOAT) return null;
  const next = BOATS[state.boat]; // tier = boat+1
  if (state.fame < next.fameReq) return null;
  if (state.gold < next.price) return null;
  return { ...state, gold: state.gold - next.price, boat: next.tier };
}

// 해역 낚시 자격: 배 단계 (마을 연못/강은 0 = 항상 가능)
export function canFishSpot(state: GameState, spotId: SpotId): boolean {
  return state.boat >= SPOTS.find(s => s.id === spotId)!.boatTier;
}

// 항해 속도 — 배가 있어야 대양에 나갈 수 있으므로 boat>=1 전제
export function boatSpeed(state: GameState): number {
  return BOATS[Math.max(state.boat, 1) - 1].speed;
}
