// 배 데이터 — 대양 진입·해역 게이트·항해 속도·가방 용량
export interface Boat {
  tier: number;
  name: string;
  price: number;   // 구매 골드 (차감)
  fameReq: number; // 명성 하한 (검증만, 차감 없음)
  speed: number;   // 항해 속도(px/s)
  bagCap: number;  // 이 배를 가졌을 때 가방 용량(마리) — "더 먼 바다 + 더 큰 화물"
}

export const BOATS: readonly Boat[] = [
  { tier: 1, name: '조각배',   price: 300,   fameReq: 0,    speed: 85,  bagCap: 140 },  // 대양 진입 + 태평양
  { tier: 2, name: '돛단배',   price: 2000,  fameReq: 500,  speed: 100, bagCap: 300 }, // 심해 해구
  { tier: 3, name: '통통배',   price: 6000,  fameReq: 2000, speed: 115, bagCap: 600 }, // 속도 (미래 지역 게이트 예약)
  { tier: 4, name: '원양어선', price: 15000, fameReq: 6000, speed: 130, bagCap: 1000 },
];

// 맨발(boat 0)은 BOATS 행이 없다 — 도보 상태의 가방 한계만 별도 상수로.
// 개체는 DB 행이라 상한이 없으면 유저당 무한히 늘고(spec 1절의 유일한 인벤토리 제한 근거),
// 넘치면 거부하지 않고 가장 안 특별한 개체를 놓아준다(logic.bagCapacity·overflowUids 주석).
// ⚠️ 가안 — 방치 낚시 속도를 보고 튜닝한다(변이 확률·크기 상수와 같은 취급).
export const WALK_BAG_CAP = 60;

export const MAX_BOAT = BOATS.length;
