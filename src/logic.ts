// 순수 게임 규칙 — DOM 의존 없음.
// 수치 튜닝은 balance.ts, 콘텐츠는 data/ (이 파일은 기존 import 경로 호환을 위해 re-export).
// 상대경로에 .js 확장자 필수 — 이 파일은 api/save.ts(Vercel Node 함수, 순수 ESM 로더)가
// 그대로 import한다. Vite(브라우저 빌드)는 확장자 없어도 되지만 Node ESM은 필수라
// 둘 다 만족시키려면 .js로 적어야 한다(소스는 .ts, 컴파일 결과가 .js).
import {
  JUDGMENT_MULT, ROD,
  MUTATION_RATE, SIZE_MEAN_BASE, SIZE_MEAN_PER_PRICE, SIZE_STD_RATIO, BIG_CATCH_PERCENTILE,
} from './balance.js';
import { RARITY } from './data/rarity.js';
import { SPOTS } from './data/spots.js';
import type { SpotId } from './data/spots.js';
import { FISH } from './data/fish.js';
import type { Fish } from './data/fish.js';
import { BOATS, MAX_BOAT } from './data/boats.js';

export { JUDGMENT_MULT };
export { RARITY } from './data/rarity.js';
export type { Rarity, RarityId } from './data/rarity.js';
export { SPOTS } from './data/spots.js';
export type { Spot, SpotId } from './data/spots.js';
export { FISH } from './data/fish.js';
export type { Fish } from './data/fish.js';
export { BOATS, MAX_BOAT } from './data/boats.js';
export type { Boat } from './data/boats.js';
export { COUPONS } from './data/coupons.js';

export type Judgment = 'perfect' | 'normal' | 'auto';

export interface GameState {
  v: 6;
  gold: number;
  fame: number; // 명성 — 무한 누적, 직접 상태 변화 없음, 구매 시 하한 검증용
  boat: number; // 0(없음, 마을 낚시만)~4
  rod: number;  // 1~∞ (무한 강화, 스탯은 점근 수렴)
  bag: string[];                  // 잡은 물고기 id 목록 (미판매)
  caught: Record<string, number>; // 도감: id → 누적 마릿수
  maxSize: Record<string, number>;  // 도감: id → 역대 최대 크기(cm). caught와 병렬 필드 (v0.3.0)
  mutated: Record<string, boolean>; // 도감: id → 변이(색상 변이) 발견 여부. fame과 무관 (v0.3.0)
  firstCaught: Record<string, string>; // 도감: id → 처음 잡은 날(YYYY-MM-DD). 업적 밑작업 (v0.3.0)
  // ↑ 세 필드 공통 패턴: caught 병렬 Record, 가산 전용. 구세이브는 빈 객체로 시작하고
  //   값이 없으면 UI가 폴백(크기=분포 평균, 날짜='알 수 없음')을 그린다 — breaking change 아님.
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
  return {
    v: 6, gold: 0, fame: 0, boat: 0, rod: 1, bag: [],
    caught: {}, maxSize: {}, mutated: {}, firstCaught: {}, coupons: [], locked: [],
  };
}

// ---------- 월척(크기)·변이  ----------
// 신규 어종/등급 로직 없이 기존 어종 데이터(price)에서 크기 분포를 유도하는 저비용 콘텐츠.

// 가격이 클수록(대체로 큰 어종일수록) 평균 크기도 커지는 단일 공식 — 어종별 수동 지정 없음
export function sizeParams(fish: Fish): { mean: number; std: number } {
  const mean = SIZE_MEAN_BASE + fish.price * SIZE_MEAN_PER_PRICE;
  return { mean, std: mean * SIZE_STD_RATIO };
}

// Box-Muller 변환으로 정규분포 크기(cm) 롤 — 최소 1cm
export function rollSize(fish: Fish, rng: () => number = Math.random): number {
  const { mean, std } = sizeParams(fish);
  const u1 = Math.max(rng(), Number.EPSILON); // log(0) 방지
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(mean + z * std, 1);
}

// 표준정규 CDF 근사 (Abramowitz-Stegun 7.1.26, 최대오차 1.5e-7) — 의존성 없이 순수 함수로 충분
function stdNormalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741
    + t * (-1.453152027 + t * 1.061405429))));
  const y = 1 - poly * Math.exp(-z * z);
  return 0.5 * (1 + Math.sign(z) * y);
}

// 이 크기가 해당 어종 분포에서 상위 몇 %인지 (도감 상세보기 표시용, 소수 1자리)
export function sizePercentile(fish: Fish, size: number): number {
  const { mean, std } = sizeParams(fish);
  const z = (size - mean) / std;
  return Math.round((1 - stdNormalCdf(z)) * 1000) / 10;
}

export interface CatchExtras {
  size: number;
  mutated: boolean;
}

// 캐치 시점 부가 롤 — 어종 추첨(rollFish)과 독립적으로 어종당 변이 1종, 확률 고정
export function rollCatchExtras(fish: Fish, rng: () => number = Math.random): CatchExtras {
  return { size: rollSize(fish, rng), mutated: rng() < MUTATION_RATE };
}

// 캐치 오버레이(획득 카드)용 종합 정보 — 순수 계산이라 로직에 두고 UI는 이 값만 그린다
export interface CatchInfo extends CatchExtras {
  percentile: number; // 크기가 이 어종 분포에서 상위 몇 %인지
  isBig: boolean;      // 상위 BIG_CATCH_PERCENTILE% 안 — "월척"
  isNew: boolean;      // 이번 캐치 전까지 도감에 없던 어종
}

export function buildCatchInfo(fish: Fish, extras: CatchExtras, isNew: boolean): CatchInfo {
  const percentile = sizePercentile(fish, extras.size);
  return { ...extras, percentile, isBig: percentile <= BIG_CATCH_PERCENTILE, isNew };
}

// 쿠폰 — 데이터는 data/coupons.ts, 검증/지급 규칙은 여기
import { COUPONS } from './data/coupons.js';

export type CouponResult =
  | { ok: true; state: GameState; reward: { gold: number; desc: string } }
  | { ok: false; reason: 'invalid' | 'used' };

// extra — DB(coupons 테이블)에서 조회한 동적 쿠폰. 정적 COUPONS와 병합해 판정한다.
export function redeemCoupon(
  state: GameState, codeRaw: string,
  extra: Record<string, { gold: number; desc: string }> = {},
): CouponResult {
  const code = codeRaw.trim();
  const c = COUPONS[code] ?? extra[code];
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

const safeRecord = <T>(v: unknown): Record<string, T> =>
  typeof v === 'object' && v !== null ? (v as Record<string, T>) : {};

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
  // v5 → v6: 월척(크기)·변이·첫 조우일 도입 — 병렬 신규 필드, caught 무변경 
  5: s => ({ ...s, v: 6, maxSize: {}, mutated: {}, firstCaught: {} }),
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
    maxSize: safeRecord<number>(s.maxSize),
    mutated: safeRecord<boolean>(s.mutated),
    firstCaught: safeRecord<string>(s.firstCaught),
    coupons: Array.isArray(s.coupons)
      ? s.coupons.filter((c): c is string => typeof c === 'string') : [],
    locked: Array.isArray(s.locked)
      ? s.locked.filter((c): c is string => typeof c === 'string') : [],
  };
}

// ---------- 상태 변경 ----------

// 로컬 기준 오늘 날짜 — toISOString은 UTC라 KST 오전 9시 전 캐치가 전날로 찍힌다
function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// extras 생략 시 maxSize/mutated는 그대로 둔다 — 기존 호출부(테스트 등)와 하위호환.
// today 파라미터: 순수성 유지용 주입 지점 (기본값만 시계를 읽는다) — 첫 조우일은 최초 1회만 기록
export function addCatch(
  state: GameState, fish: Fish, extras?: CatchExtras,
  today: string = localDate(),
): GameState {
  return {
    ...state,
    bag: [...state.bag, fish.id],
    caught: { ...state.caught, [fish.id]: (state.caught[fish.id] ?? 0) + 1 },
    maxSize: extras
      ? { ...state.maxSize, [fish.id]: Math.max(state.maxSize[fish.id] ?? 0, extras.size) }
      : state.maxSize,
    mutated: extras?.mutated ? { ...state.mutated, [fish.id]: true } : state.mutated,
    firstCaught: state.firstCaught[fish.id]
      ? state.firstCaught
      : { ...state.firstCaught, [fish.id]: today },
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
