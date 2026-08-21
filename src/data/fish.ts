// 어종 데이터 (23종) — 어종 추가 = 여기 행 추가 (무결성은 logic.test가 자동 검증)
import type { SpotId } from './spots.js';
import type { RarityId } from './rarity.js';

// 스프라이트 몸 형태 — 실제 그리기는 pixel/sprites.ts(DOM 캔버스 의존)가 맡는다.
// 이 타입은 여기 데이터 레이어에 둔다: fish.ts는 api/save.ts(Node, DOM 없음)가 타는
// import 그래프에 물려 있어서, DOM 타입에 의존하는 파일을 거꾸로 import하면 안 된다.
export type FishShape =
  | 'tiny' | 'round' | 'slim' | 'predator' | 'flowing' | 'eel' | 'ribbon'
  | 'whiskered' | 'shark' | 'anglerfish' | 'cephalopod' | 'ancient' | 'serpent';

// lore/variant는 v0.3.0 초안 — 나중에 다시 다듬어도 됨(직접 작성 확정)
export interface Fish {
  id: string;
  name: string;
  spot: SpotId;
  rarity: RarityId;
  price: number;
  color: string;
  shape: FishShape;                      // 스프라이트 몸 형태 — 어종마다 다르게 (pixel/sprites.ts)
  lore: string;                          // 도감 상세보기용 짧은 로어
  variant: { name: string; color: string }; // 색상 변이 1종 (1/3 확률, balance.MUTATION_RATE)
}

export const FISH: readonly Fish[] = [
  { id: 'crucian',    name: '붕어',       spot: 'pond',  rarity: 'common',    price: 6,    color: '#c8a165',    shape: 'round',
    lore: '어디서나 만날 수 있는 낚시의 기본, 그래도 손맛은 있다.',
    variant: { name: '황금 붕어', color: '#f5c542' } },
  { id: 'minnow',     name: '피라미',     spot: 'pond',  rarity: 'common',    price: 4,    color: '#9fb4c7',    shape: 'tiny',
    lore: '떼로 몰려다니는 작은 물고기, 미끼보다 입질이 빠르다.',
    variant: { name: '백금 피라미', color: '#e8f0f5' } },
  { id: 'loach',      name: '미꾸라지',   spot: 'pond',  rarity: 'common',    price: 5,    color: '#8d6e63',    shape: 'eel',
    lore: '미끌미끌해서 놓치기 쉽지만 추어탕엔 최고다.',
    variant: { name: '알비노 미꾸라지', color: '#f0e4d8' } },
  { id: 'carp',       name: '잉어',       spot: 'pond',  rarity: 'rare',      price: 30,   color: '#e57373',    shape: 'round',
    lore: '연못의 터줏대장, 몸집이 크고 여유롭게 헤엄친다.',
    variant: { name: '금빛 잉어', color: '#ffcc80' } },
  { id: 'goldfish',   name: '금붕어',     spot: 'pond',  rarity: 'epic',      price: 120,  color: '#ffb74d',    shape: 'flowing',
    lore: '누군가 놓아준 걸까, 연못에 어울리지 않게 화려하다.',
    variant: { name: '백은 금붕어', color: '#eceff1' } },
  { id: 'goldcarp',   name: '황금잉어',   spot: 'pond',  rarity: 'legendary', price: 500,  color: '#ffd700',    shape: 'flowing',
    lore: '연못의 전설, 온몸이 금빛으로 빛난다는 소문이 있다.',
    variant: { name: '무지개 잉어', color: '#ff80ab' } },
  { id: 'sweetfish',  name: '은어',       spot: 'river', rarity: 'common',    price: 10,   color: '#cfd8dc',    shape: 'slim',
    lore: '맑은 강에서만 사는 은빛 물고기, 향이 좋다.',
    variant: { name: '흑진주 은어', color: '#37474f' } },
  { id: 'catfish',    name: '메기',       spot: 'river', rarity: 'common',    price: 12,   color: '#546e7a',    shape: 'whiskered',
    lore: '수염으로 진흙 속 먹이를 찾는 밤의 사냥꾼.',
    variant: { name: '백화 메기', color: '#cfd8dc' } },
  { id: 'mandarin',   name: '쏘가리',     spot: 'river', rarity: 'rare',      price: 45,   color: '#a1887f',    shape: 'predator',
    lore: '화려한 무늬의 육식어, 낚시꾼들이 탐낸다.',
    variant: { name: '흑점 쏘가리', color: '#4e342e' } },
  { id: 'salmon',     name: '연어',       spot: 'river', rarity: 'rare',      price: 55,   color: '#ff8a65',    shape: 'slim',
    lore: '강을 거슬러 오르는 근성의 물고기.',
    variant: { name: '은빛 연어', color: '#b0bec5' } },
  { id: 'rainbow',    name: '무지개송어', spot: 'river', rarity: 'epic',      price: 180,  color: '#9575cd',    shape: 'slim',
    lore: '비늘이 무지개처럼 빛나는 청정 계곡의 자랑.',
    variant: { name: '황금 송어', color: '#ffd54f' } },
  { id: 'riverlord',  name: '강의 주인',  spot: 'river', rarity: 'legendary', price: 800,  color: '#4db6ac',    shape: 'serpent',
    lore: '강의 가장 깊은 곳을 다스린다는 전설의 물고기.',
    variant: { name: '태고의 강주인', color: '#00695c' } },
  { id: 'mackerel',   name: '고등어',     spot: 'sea',   rarity: 'common',    price: 15,   color: '#42a5f5',    shape: 'slim',
    lore: '등에 푸른 물결무늬가 있는 흔한 생선.',
    variant: { name: '금등 고등어', color: '#ffca28' } },
  { id: 'hairtail',   name: '갈치',       spot: 'sea',   rarity: 'common',    price: 18,   color: '#e0e0e0',    shape: 'ribbon',
    lore: '칼처럼 길고 은빛으로 빛나는 몸.',
    variant: { name: '황금 갈치', color: '#ffe082' } },
  { id: 'seabream',   name: '참돔',       spot: 'sea',   rarity: 'rare',      price: 70,   color: '#ef5350',    shape: 'round',
    lore: '붉은 몸빛의 잔칫상 생선, 손맛이 짜릿하다.',
    variant: { name: '백조 참돔', color: '#fafafa' } },
  { id: 'yellowtail', name: '방어',       spot: 'sea',   rarity: 'rare',      price: 80,   color: '#78909c',    shape: 'predator',
    lore: '겨울 바다를 지배하는 힘 좋은 방어.',
    variant: { name: '흑방어', color: '#263238' } },
  { id: 'tuna',       name: '참치',       spot: 'sea',   rarity: 'epic',      price: 250,  color: '#37474f',    shape: 'slim',
    lore: '바다를 가로지르는 근육질의 여행자.',
    variant: { name: '백금 참치', color: '#90a4ae' } },
  { id: 'shark',      name: '백상아리',   spot: 'sea',   rarity: 'legendary', price: 1200, color: '#90a4ae',    shape: 'shark',
    lore: '바다의 최상위 포식자, 마주치면 심장이 뛴다.',
    variant: { name: '알비노 상어', color: '#eceff1' } },
  { id: 'anglerfish', name: '아귀',       spot: 'deep',  rarity: 'common',    price: 25,   color: '#5d4037',    shape: 'anglerfish',
    lore: '못생겼지만 맛은 최고, 심해 입구에 산다.',
    variant: { name: '발광 아귀', color: '#00e5ff' } },
  { id: 'squid',      name: '심해오징어', spot: 'deep',  rarity: 'rare',      price: 100,  color: '#7e57c2',    shape: 'cephalopod',
    lore: '빛도 없는 곳에서 촉수를 뻗는 그림자.',
    variant: { name: '자수정 오징어', color: '#b388ff' } },
  { id: 'coelacanth', name: '실러캔스',   spot: 'deep',  rarity: 'epic',      price: 400,  color: '#26a69a',    shape: 'ancient',
    lore: '수억 년을 살아온 살아있는 화석.',
    variant: { name: '황금 실러캔스', color: '#ffd54f' } },
  { id: 'oarfish',    name: '산갈치',     spot: 'deep',  rarity: 'epic',      price: 350,  color: '#b0bec5',    shape: 'ribbon',
    lore: '지진 전에 나타난다는 소문이 있는 긴 물고기.',
    variant: { name: '백은 산갈치', color: '#f5f5f5' } },
  { id: 'kraken',     name: '크라켄',     spot: 'deep',  rarity: 'legendary', price: 2000, color: '#d32f2f',    shape: 'cephalopod',
    lore: '심해 전설의 괴물, 배를 통째로 삼킨다는 이야기가 있다.',
    variant: { name: '심홍 크라켄', color: '#b71c1c' } },
];
