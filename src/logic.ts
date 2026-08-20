// 순수 게임 규칙 — DOM 의존 없음.

export type SpotId = 'pond' | 'river' | 'sea' | 'deep';
export type RarityId = 'common' | 'rare' | 'epic' | 'legendary';
export type Judgment = 'perfect' | 'normal' | 'auto';

export interface Rarity {
  name: string;
  color: string;
  weight: number;
  fame: number; // 어획 시 획득 명성 (무한 누적, 소모 없음)
}

export interface Spot {
  id: SpotId;
  name: string;
  boatTier: number; // 이 해역에서 낚시하려면 필요한 배 단계
}

export interface Fish {
  id: string;
  name: string;
  spot: SpotId;
  rarity: RarityId;
  price: number;
  color: string;
}

export interface Boat {
  tier: number;
  name: string;
  price: number;   // 구매 골드 (차감)
  fameReq: number; // 명성 하한 (검증만, 차감 없음)
  speed: number;   // 항해 속도(px/s)
}

export interface GameState {
  v: 4;
  gold: number;
  fame: number; // 명성 — 무한 누적, 직접 상태 변화 없음, 구매 시 하한 검증용
  boat: number; // 0(없음, 마을 낚시만)~4
  rod: number;  // 1~∞ (무한 강화, 스탯은 점근 수렴)
  bag: string[];                  // 잡은 물고기 id 목록 (미판매)
  caught: Record<string, number>; // 도감: id → 누적 마릿수
  coupons: string[];              // 사용한 쿠폰 코드
}

export const RARITY: Record<RarityId, Rarity> = {
  common:    { name: '일반', color: '#b8c2cc', weight: 74, fame: 5 },
  rare:      { name: '희귀', color: '#4fc3f7', weight: 20, fame: 15 },
  epic:      { name: '영웅', color: '#ba68c8', weight: 5,  fame: 40 },
  legendary: { name: '전설', color: '#ffd54f', weight: 1,  fame: 100 },
};

// boatTier 0 = 배 없이 가능(마을), 1+ = 대양(배 필요)
export const SPOTS: Spot[] = [
  { id: 'pond',  name: '마을 연못',   boatTier: 0 },
  { id: 'river', name: '마을 강',     boatTier: 0 },
  { id: 'sea',   name: '태평양',      boatTier: 1 },
  { id: 'deep',  name: '마리아나 해구', boatTier: 2 },
];

export const BOATS: Boat[] = [
  { tier: 1, name: '조각배',   price: 300,   fameReq: 0,    speed: 85 },  // 대양 진입 + 태평양
  { tier: 2, name: '돛단배',   price: 2000,  fameReq: 500,  speed: 100 }, // 심해 해구
  { tier: 3, name: '통통배',   price: 6000,  fameReq: 2000, speed: 115 }, // 속도 (미래 지역 게이트 예약)
  { tier: 4, name: '원양어선', price: 15000, fameReq: 6000, speed: 130 },
];

export const FISH: Fish[] = [
  { id: 'crucian',    name: '붕어',       spot: 'pond',  rarity: 'common',    price: 6,    color: '#c8a165' },
  { id: 'minnow',     name: '피라미',     spot: 'pond',  rarity: 'common',    price: 4,    color: '#9fb4c7' },
  { id: 'loach',      name: '미꾸라지',   spot: 'pond',  rarity: 'common',    price: 5,    color: '#8d6e63' },
  { id: 'carp',       name: '잉어',       spot: 'pond',  rarity: 'rare',      price: 30,   color: '#e57373' },
  { id: 'goldfish',   name: '금붕어',     spot: 'pond',  rarity: 'epic',      price: 120,  color: '#ffb74d' },
  { id: 'goldcarp',   name: '황금잉어',   spot: 'pond',  rarity: 'legendary', price: 500,  color: '#ffd700' },
  { id: 'sweetfish',  name: '은어',       spot: 'river', rarity: 'common',    price: 10,   color: '#cfd8dc' },
  { id: 'catfish',    name: '메기',       spot: 'river', rarity: 'common',    price: 12,   color: '#546e7a' },
  { id: 'mandarin',   name: '쏘가리',     spot: 'river', rarity: 'rare',      price: 45,   color: '#a1887f' },
  { id: 'salmon',     name: '연어',       spot: 'river', rarity: 'rare',      price: 55,   color: '#ff8a65' },
  { id: 'rainbow',    name: '무지개송어', spot: 'river', rarity: 'epic',      price: 180,  color: '#9575cd' },
  { id: 'riverlord',  name: '강의 주인',  spot: 'river', rarity: 'legendary', price: 800,  color: '#4db6ac' },
  { id: 'mackerel',   name: '고등어',     spot: 'sea',   rarity: 'common',    price: 15,   color: '#42a5f5' },
  { id: 'hairtail',   name: '갈치',       spot: 'sea',   rarity: 'common',    price: 18,   color: '#e0e0e0' },
  { id: 'seabream',   name: '참돔',       spot: 'sea',   rarity: 'rare',      price: 70,   color: '#ef5350' },
  { id: 'yellowtail', name: '방어',       spot: 'sea',   rarity: 'rare',      price: 80,   color: '#78909c' },
  { id: 'tuna',       name: '참치',       spot: 'sea',   rarity: 'epic',      price: 250,  color: '#37474f' },
  { id: 'shark',      name: '백상아리',   spot: 'sea',   rarity: 'legendary', price: 1200, color: '#90a4ae' },
  { id: 'anglerfish', name: '아귀',       spot: 'deep',  rarity: 'common',    price: 25,   color: '#5d4037' },
  { id: 'squid',      name: '심해오징어', spot: 'deep',  rarity: 'rare',      price: 100,  color: '#7e57c2' },
  { id: 'coelacanth', name: '실러캔스',   spot: 'deep',  rarity: 'epic',      price: 400,  color: '#26a69a' },
  { id: 'oarfish',    name: '산갈치',     spot: 'deep',  rarity: 'epic',      price: 350,  color: '#b0bec5' },
  { id: 'kraken',     name: '크라켄',     spot: 'deep',  rarity: 'legendary', price: 2000, color: '#d32f2f' },
];

export const MAX_BOAT = BOATS.length;

export interface RodStats {
  biteMin: number; // 입질 최소 대기(초)
  biteMax: number; // 입질 최대 대기(초)
  sweep: number;   // 타이밍 바 커서가 끝까지 가는 시간(초) = 챔질 가능 시간
  zone: number;    // PERFECT 존 크기 (바 전체 대비 비율, 중앙 배치)
}

// 낚싯대 = 무한 강화. 스탯은 점근 수렴(상한 없음, 효율 체감) — 무한 플레이 원칙.
// t: 레벨 1 → 0, 레벨 ∞ → 1 (레벨 10에서 약 0.57)
export function rodStats(level: number): RodStats {
  const t = 1 - 1 / (1 + 0.15 * (level - 1));
  return {
    biteMin: 4 - 3 * t,        // 4s → 1s에 수렴
    biteMax: 8 - 5.5 * t,      // 8s → 2.5s에 수렴
    sweep: 1.0 + 1.2 * t,      // 1s → 2.2s에 수렴
    zone: 0.24 + 0.36 * t,     // 24% → 60%에 수렴
  };
}

export function upgradeCost(level: number): number {
  return Math.round(50 * Math.pow(1.8, level - 1));
}

// 챔질 판정: 커서 위치(0~1)가 중앙 존 안이면 PERFECT
export function judgeTiming(pos: number, zone: number): Judgment {
  return Math.abs(pos - 0.5) <= zone / 2 ? 'perfect' : 'normal';
}

// 판정별 희귀(일반 외) 가중치 배수 — 수동 어드밴티지의 핵심
// auto(게이지 방치)는 추첨 없이 최하 어종 고정이라 배수가 없다 (worstFish)
export const JUDGMENT_MULT: Record<Exclude<Judgment, 'auto'>, number> = {
  perfect: 1.6,
  normal: 1,
};

// 방치(자동) 낚시 결과: 해당 수역에서 가장 값싼 어종 고정
export function worstFish(spotId: SpotId): Fish {
  const pool = FISH.filter(f => f.spot === spotId);
  return pool.reduce((min, f) => (f.price < min.price ? f : min), pool[0]);
}

// 추첨: 일반 외 등급 가중치를 mult배 (mult = 판정 배수)
export function rollFish(spotId: SpotId, mult = 1, rng: () => number = Math.random): Fish {
  const pool = FISH.filter(f => f.spot === spotId);
  const weights = pool.map(f =>
    RARITY[f.rarity].weight * (f.rarity === 'common' ? 1 : mult));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function newState(): GameState {
  return { v: 4, gold: 0, fame: 0, boat: 0, rod: 1, bag: [], caught: {}, coupons: [] };
}

// 쿠폰 — 친구 규모라 클라이언트 검증으로 충분. P1 서버 도입 시 서버 검증으로 이관 .
// 코드는 관리자 대시보드(?admin)에서 확인해 공유한다.
export const COUPONS: Record<string, { gold: number; desc: string }> = {
  '출항준비': { gold: 300, desc: '레벨디자인 개편 보상 — 조각배 값' },
};

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

// 세이브 로드/마이그레이션 (v1/v2/v3 → v4)
// v1(xp 시절)에는 조각배 증정. 명성이 없는 세이브는 도감에서 소급 계산.
export function migrate(raw: unknown): GameState {
  const base = newState();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const caught = typeof r.caught === 'object' && r.caught !== null
    ? (r.caught as Record<string, number>) : {};
  return {
    ...base,
    gold: typeof r.gold === 'number' ? r.gold : 0,
    fame: typeof r.fame === 'number' ? r.fame : computeFame(caught),
    boat: typeof r.boat === 'number' ? r.boat : (r.v === undefined ? 1 : 0),
    rod: typeof r.rod === 'number' ? r.rod : 1,
    bag: Array.isArray(r.bag) ? r.bag.filter((id): id is string => typeof id === 'string') : [],
    caught,
    coupons: Array.isArray(r.coupons)
      ? r.coupons.filter((c): c is string => typeof c === 'string') : [],
  };
}

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

export function sellAll(state: GameState): GameState {
  return { ...state, gold: state.gold + bagValue(state), bag: [] };
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
