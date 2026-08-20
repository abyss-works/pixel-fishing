// 순수 게임 규칙 — DOM 의존 없음.

export type SpotId = 'pond' | 'river' | 'sea' | 'deep';
export type RarityId = 'common' | 'rare' | 'epic' | 'legendary';

export interface Rarity {
  name: string;
  color: string;
  weight: number;
  xp: number;
}

export interface Spot {
  id: SpotId;
  name: string;
  unlockLevel: number;
}

export interface Fish {
  id: string;
  name: string;
  spot: SpotId;
  rarity: RarityId;
  price: number;
  color: string;
}

export interface GameState {
  gold: number;
  xp: number;
  rod: number;
  bag: string[];                  // 잡은 물고기 id 목록 (미판매)
  caught: Record<string, number>; // 도감: id → 누적 마릿수
  spot: SpotId;
}

export const RARITY: Record<RarityId, Rarity> = {
  common:    { name: '일반', color: '#b8c2cc', weight: 74, xp: 5 },
  rare:      { name: '희귀', color: '#4fc3f7', weight: 20, xp: 15 },
  epic:      { name: '영웅', color: '#ba68c8', weight: 5,  xp: 40 },
  legendary: { name: '전설', color: '#ffd54f', weight: 1,  xp: 100 },
};

export const SPOTS: Spot[] = [
  { id: 'pond',  name: '포근한 만', unlockLevel: 1 },
  { id: 'river', name: '강 하구',   unlockLevel: 3 },
  { id: 'sea',   name: '먼바다',    unlockLevel: 6 },
  { id: 'deep',  name: '심해 해구', unlockLevel: 10 },
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

export const MAX_ROD = 10;

export interface RodStats {
  biteMin: number; // 입질 최소 대기(초)
  biteMax: number; // 입질 최대 대기(초)
  window: number;  // 챔질 타이밍 창(초)
  luck: number;    // 행운
}

// R13: 레벨 1→10 선형 보간
export function rodStats(level: number): RodStats {
  const t = (level - 1) / (MAX_ROD - 1);
  return {
    biteMin: 4 - 3 * t,     // 4s → 1s
    biteMax: 8 - 5.5 * t,   // 8s → 2.5s
    window: 1.0 + 1.0 * t,  // 1s → 2s
    luck: level - 1,        // 0 → 9
  };
}

// R15
export function upgradeCost(level: number): number {
  return Math.round(50 * Math.pow(1.8, level - 1));
}

// R11 + R14: 일반 외 등급 가중치를 (1 + luck*0.15)배
export function rollFish(spotId: SpotId, luck: number, rng: () => number = Math.random): Fish {
  const pool = FISH.filter(f => f.spot === spotId);
  const boost = 1 + luck * 0.15;
  const weights = pool.map(f =>
    RARITY[f.rarity].weight * (f.rarity === 'common' ? 1 : boost));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// R16: 레벨 n→n+1 필요 xp = n*50 (누적)
export function levelForXp(xp: number): { level: number; cur: number; next: number } {
  let level = 1, need = 50;
  while (xp >= need) { xp -= need; level++; need = level * 50; }
  return { level, cur: xp, next: need };
}

export function newState(): GameState {
  return { gold: 0, xp: 0, rod: 1, bag: [], caught: {}, spot: 'pond' };
}

// R8 (불변 업데이트 — React state용)
export function addCatch(state: GameState, fish: Fish): GameState {
  return {
    ...state,
    bag: [...state.bag, fish.id],
    caught: { ...state.caught, [fish.id]: (state.caught[fish.id] ?? 0) + 1 },
    xp: state.xp + RARITY[fish.rarity].xp,
  };
}

export function bagValue(state: GameState): number {
  return state.bag.reduce((s, id) => s + (FISH.find(f => f.id === id)?.price ?? 0), 0);
}

// R1
export function sellAll(state: GameState): GameState {
  return { ...state, gold: state.gold + bagValue(state), bag: [] };
}

// R2: 불가하면 null
export function tryUpgrade(state: GameState): GameState | null {
  if (state.rod >= MAX_ROD) return null;
  const cost = upgradeCost(state.rod);
  if (state.gold < cost) return null;
  return { ...state, gold: state.gold - cost, rod: state.rod + 1 };
}
