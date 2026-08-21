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
// 변이는 "종만 같고 다른 개체" (v0.3.3): 이름/색/로어 독립, 등급/수역/형태/크기 분포는 종에 종속.
export interface Fish {
  id: string;
  name: string;
  spot: SpotId;
  rarity: RarityId;
  price: number;                         // 기본가 — 변이 판매가 = ×VARIANT_PRICE_MULT (priceOf)
  color: string;
  shape: FishShape;                      // 스프라이트 몸 형태 — 어종마다 다르게 (pixel/sprites.ts)
  lore: string;                          // 도감 상세보기용 짧은 로어
  variant: { name: string; color: string; lore: string }; // 색상 변이 1종 (balance.MUTATION_RATE)
}

export const FISH: readonly Fish[] = [
  { id: 'crucian',    name: '붕어',       spot: 'pond',  rarity: 'common',    price: 6,    color: '#c8a165',    shape: 'round',
    lore: '어디서나 만날 수 있는 낚시의 기본, 그래도 손맛은 있다.',
    variant: { name: '황금 붕어', color: '#f5c542',
      lore: '평범한 붕어가 아니다. 볕이 좋은 날에만 수면 가까이 올라온다고 한다.' } },
  { id: 'minnow',     name: '피라미',     spot: 'pond',  rarity: 'common',    price: 4,    color: '#9fb4c7',    shape: 'tiny',
    lore: '떼로 몰려다니는 작은 물고기, 미끼보다 입질이 빠르다.',
    variant: { name: '백금 피라미', color: '#e8f0f5',
      lore: '떼 속에서 홀로 은백색으로 빛난다. 무리가 그를 따르는 것처럼 보인다.' } },
  { id: 'loach',      name: '미꾸라지',   spot: 'pond',  rarity: 'common',    price: 5,    color: '#8d6e63',    shape: 'eel',
    lore: '미끌미끌해서 놓치기 쉽지만 추어탕엔 최고다.',
    variant: { name: '알비노 미꾸라지', color: '#f0e4d8',
      lore: '진흙 속에서도 하얗다. 늙은 낚시꾼들은 길조라 부른다.' } },
  { id: 'carp',       name: '잉어',       spot: 'pond',  rarity: 'rare',      price: 30,   color: '#e57373',    shape: 'round',
    lore: '연못의 터줏대장, 몸집이 크고 여유롭게 헤엄친다.',
    variant: { name: '금빛 잉어', color: '#ffcc80',
      lore: '금빛 비늘이 물결에 일렁이면 연못 전체가 반짝이는 듯하다.' } },
  { id: 'goldfish',   name: '금붕어',     spot: 'pond',  rarity: 'epic',      price: 120,  color: '#ffb74d',    shape: 'flowing',
    lore: '누군가 놓아준 걸까, 연못에 어울리지 않게 화려하다.',
    variant: { name: '백은 금붕어', color: '#eceff1',
      lore: '색이 바랜 게 아니라, 달빛을 머금은 것이라는 이야기가 있다.' } },
  { id: 'goldcarp',   name: '황금잉어',   spot: 'pond',  rarity: 'legendary', price: 500,  color: '#ffd700',    shape: 'flowing',
    lore: '연못의 전설, 온몸이 금빛으로 빛난다는 소문이 있다.',
    variant: { name: '무지개 잉어', color: '#ff80ab',
      lore: '황금잉어 중에서도 이것을 본 사람은 손에 꼽는다. 무지개 비늘은 물 밖에서만 보인다.' } },
  { id: 'sweetfish',  name: '은어',       spot: 'river', rarity: 'common',    price: 10,   color: '#cfd8dc',    shape: 'slim',
    lore: '맑은 강에서만 사는 은빛 물고기, 향이 좋다.',
    variant: { name: '흑진주 은어', color: '#37474f',
      lore: '검게 빛나는 은어. 가장 깊고 차가운 여울에서만 자란다고 한다.' } },
  { id: 'catfish',    name: '메기',       spot: 'river', rarity: 'common',    price: 12,   color: '#546e7a',    shape: 'whiskered',
    lore: '수염으로 진흙 속 먹이를 찾는 밤의 사냥꾼.',
    variant: { name: '백화 메기', color: '#cfd8dc',
      lore: '달 없는 밤에만 움직이는 하얀 그림자. 수염이 유난히 길다.' } },
  { id: 'mandarin',   name: '쏘가리',     spot: 'river', rarity: 'rare',      price: 45,   color: '#a1887f',    shape: 'predator',
    lore: '화려한 무늬의 육식어, 낚시꾼들이 탐낸다.',
    variant: { name: '흑점 쏘가리', color: '#4e342e',
      lore: '어둠에 녹아드는 검은 무늬. 바위 그늘과 구분이 되지 않는다.' } },
  { id: 'salmon',     name: '연어',       spot: 'river', rarity: 'rare',      price: 55,   color: '#ff8a65',    shape: 'slim',
    lore: '강을 거슬러 오르는 근성의 물고기.',
    variant: { name: '은빛 연어', color: '#b0bec5',
      lore: '강을 거슬러 오르지 않고 내려간다는 소문의 은빛 연어.' } },
  { id: 'rainbow',    name: '무지개송어', spot: 'river', rarity: 'epic',      price: 180,  color: '#9575cd',    shape: 'slim',
    lore: '비늘이 무지개처럼 빛나는 청정 계곡의 자랑.',
    variant: { name: '황금 송어', color: '#ffd54f',
      lore: '무지개 대신 온몸이 순금빛이다. 계곡의 보물이라 불린다.' } },
  { id: 'riverlord',  name: '강의 주인',  spot: 'river', rarity: 'legendary', price: 800,  color: '#4db6ac',    shape: 'serpent',
    lore: '강의 가장 깊은 곳을 다스린다는 전설의 물고기.',
    variant: { name: '태고의 강주인', color: '#00695c',
      lore: '강의 주인보다 오래 살았다는 개체. 물빛이 그를 따라 짙어진다.' } },
  { id: 'mackerel',   name: '고등어',     spot: 'sea',   rarity: 'common',    price: 15,   color: '#42a5f5',    shape: 'slim',
    lore: '등에 푸른 물결무늬가 있는 흔한 생선.',
    variant: { name: '금등 고등어', color: '#ffca28',
      lore: '등의 물결무늬가 금빛이다. 어부들은 그물에 들면 바다에 돌려보냈다고 한다.' } },
  { id: 'hairtail',   name: '갈치',       spot: 'sea',   rarity: 'common',    price: 18,   color: '#e0e0e0',    shape: 'ribbon',
    lore: '칼처럼 길고 은빛으로 빛나는 몸.',
    variant: { name: '황금 갈치', color: '#ffe082',
      lore: '달빛 아래서 낚아 올리면 칼날이 금으로 벼려진 듯 보인다.' } },
  { id: 'seabream',   name: '참돔',       spot: 'sea',   rarity: 'rare',      price: 70,   color: '#ef5350',    shape: 'round',
    lore: '붉은 몸빛의 잔칫상 생선, 손맛이 짜릿하다.',
    variant: { name: '백조 참돔', color: '#fafafa',
      lore: '축제의 붉은빛이 모두 빠져나간 순백의 참돔. 오히려 더 귀한 대접을 받는다.' } },
  { id: 'yellowtail', name: '방어',       spot: 'sea',   rarity: 'rare',      price: 80,   color: '#78909c',    shape: 'predator',
    lore: '겨울 바다를 지배하는 힘 좋은 방어.',
    variant: { name: '흑방어', color: '#263238',
      lore: '먹물처럼 검은 방어. 폭풍이 오기 전에만 잡힌다는 미신이 있다.' } },
  { id: 'tuna',       name: '참치',       spot: 'sea',   rarity: 'epic',      price: 250,  color: '#37474f',    shape: 'slim',
    lore: '바다를 가로지르는 근육질의 여행자.',
    variant: { name: '백금 참치', color: '#90a4ae',
      lore: '백금빛으로 번쩍이는 거체. 수평선을 가르는 빛줄기로 오해받곤 한다.' } },
  { id: 'shark',      name: '백상아리',   spot: 'sea',   rarity: 'legendary', price: 1200, color: '#90a4ae',    shape: 'shark',
    lore: '바다의 최상위 포식자, 마주치면 심장이 뛴다.',
    variant: { name: '알비노 상어', color: '#eceff1',
      lore: '흰 바다의 유령. 마주친 배들은 하나같이 조용히 뱃머리를 돌렸다.' } },
  { id: 'anglerfish', name: '아귀',       spot: 'deep',  rarity: 'common',    price: 25,   color: '#5d4037',    shape: 'anglerfish',
    lore: '못생겼지만 맛은 최고, 심해 입구에 산다.',
    variant: { name: '발광 아귀', color: '#00e5ff',
      lore: '심해의 어둠 속에서 스스로 푸르게 빛난다. 등불이 필요 없는 아귀.' } },
  { id: 'squid',      name: '심해오징어', spot: 'deep',  rarity: 'rare',      price: 100,  color: '#7e57c2',    shape: 'cephalopod',
    lore: '빛도 없는 곳에서 촉수를 뻗는 그림자.',
    variant: { name: '자수정 오징어', color: '#b388ff',
      lore: '자수정처럼 투명하게 비치는 몸. 먹물 대신 빛을 뿜는다고 한다.' } },
  { id: 'coelacanth', name: '실러캔스',   spot: 'deep',  rarity: 'epic',      price: 400,  color: '#26a69a',    shape: 'ancient',
    lore: '수억 년을 살아온 살아있는 화석.',
    variant: { name: '황금 실러캔스', color: '#ffd54f',
      lore: '수억 년 전에도 이 금빛이었을까. 화석에는 색이 남지 않는다.' } },
  { id: 'oarfish',    name: '산갈치',     spot: 'deep',  rarity: 'epic',      price: 350,  color: '#b0bec5',    shape: 'ribbon',
    lore: '지진 전에 나타난다는 소문이 있는 긴 물고기.',
    variant: { name: '백은 산갈치', color: '#f5f5f5',
      lore: '백은빛 산갈치가 떠오른 해에는 아무 일도 일어나지 않았다고 전해진다.' } },
  { id: 'kraken',     name: '크라켄',     spot: 'deep',  rarity: 'legendary', price: 2000, color: '#d32f2f',    shape: 'cephalopod',
    lore: '심해 전설의 괴물, 배를 통째로 삼킨다는 이야기가 있다.',
    variant: { name: '심홍 크라켄', color: '#b71c1c',
      lore: '심홍빛 크라켄. 심해가 붉게 물드는 날, 어부들은 항구를 떠나지 않는다.' } },
];
