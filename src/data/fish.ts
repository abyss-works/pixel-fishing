// 어종 데이터 (23종) — 어종 추가 = 여기 행 추가 (무결성은 logic.test가 자동 검증)
import type { SpotId } from './spots';
import type { RarityId } from './rarity';

export interface Fish {
  id: string;
  name: string;
  spot: SpotId;
  rarity: RarityId;
  price: number;
  color: string;
}

export const FISH: readonly Fish[] = [
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
