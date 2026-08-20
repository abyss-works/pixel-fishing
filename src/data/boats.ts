// 배 데이터 — 대양 진입·해역 게이트·항해 속도 
export interface Boat {
  tier: number;
  name: string;
  price: number;   // 구매 골드 (차감)
  fameReq: number; // 명성 하한 (검증만, 차감 없음)
  speed: number;   // 항해 속도(px/s)
}

export const BOATS: readonly Boat[] = [
  { tier: 1, name: '조각배',   price: 300,   fameReq: 0,    speed: 85 },  // 대양 진입 + 태평양
  { tier: 2, name: '돛단배',   price: 2000,  fameReq: 500,  speed: 100 }, // 심해 해구
  { tier: 3, name: '통통배',   price: 6000,  fameReq: 2000, speed: 115 }, // 속도 (미래 지역 게이트 예약)
  { tier: 4, name: '원양어선', price: 15000, fameReq: 6000, speed: 130 },
];

export const MAX_BOAT = BOATS.length;
