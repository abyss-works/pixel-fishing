// 배 데이터 — 대양 진입·해역 게이트·항해 속도·가방 용량
//
// **작명: "정크선 → 범선 → 증기선 → 대양선 → 원양어선" 사다리**.
//   기술 발전 순서이자 각 지역의 정체성이다(정크선=남중국해 계절풍 무역로, 범선=대양 항해,
//   증기선=산업 시대의 인도양, 대양선=현대 원양 여객). 뒷노선 예약: 1-4 아프리카(마다가스카르)
//   또는 미국부터 **원양어선**, 이후 쇄빙선(북극)·과학탐사선(남극) — 대서양 단독 지역이
//   없어지면서 7단계 표가 이 순서로 정해졌다.
//   ⚠️ 소급 개명 — 구 tier4 '원양어선' 보유 유저는 '범선'으로 표시된다. 릴리즈 패치노트에
//   지역명을 바꾸면 기존 이용자가 알아볼 수 있도록 개명 안내를 함께 제공한다.
//
// **스케일링 규칙**:
//   가격과 명성 하한 = 해역 사다리에 맞춰 확정한 표 값이다. 지역을 여는 배(조각배·정크선·증기선·원양어선·
//     대양 트롤선)는 지역마다 10배씩 오르고, 지역 안 배(돛단배·대양선)와 범선은 같은 지역 진입 배 가격의
//     1.1제곱을 유효숫자 두 자리로 반올림한 값이다. 가공 플랜트선은 여는 해역이 없다.
//   가방 용량 = tier5·6은 1500/2000, 정크선은 500 —
//     해역을 열지 않는 범선의 장점을 가방 확장으로 둔다. 줄여도 bagCapacity 래칫이 든 개체를 지킨다.
//   가공 플랜트선은 속도와 가방이 대양 트롤선과 같다. 가방이 넘칠 때 기운 대상 어종을 기운으로 바꾼다.
export interface Boat {
  tier: number;
  name: string;
  price: number;   // 구매 골드 (차감)
  fameReq: number; // 명성 하한 (검증만, 차감 없음)
  speed: number;   // 항해 속도(px/s)
  bagCap: number;  // 이 배를 가졌을 때 가방 용량(마리) — "더 먼 바다 + 더 큰 화물"
}

export const BOATS: readonly Boat[] = [
  { tier: 1, name: '조각배',   price: 125,      fameReq: 0,      speed: 110, bagCap: 140 },  // 1-1 태평양
  { tier: 2, name: '돛단배',   price: 200,      fameReq: 250,    speed: 120, bagCap: 300 },  // 1-1 마리아나 해구
  { tier: 3, name: '정크선',   price: 1250,     fameReq: 1500,   speed: 130, bagCap: 500 },  // 1-2 동남아 진입
  { tier: 4, name: '범선',     price: 2600,     fameReq: 1800,   speed: 140, bagCap: 1000 }, // 1-2 새 해역 없음 — 가방 확장(정크선의 두 배)
  { tier: 5, name: '증기선',   price: 12500,    fameReq: 7500,   speed: 150, bagCap: 1500 }, // 1-3 인도양 — 동남아 건너뛰기
  { tier: 6, name: '대양선',   price: 32000,    fameReq: 9000,   speed: 165, bagCap: 2000 }, // 1-3 남인도양
  { tier: 7, name: '원양어선', price: 125000,   fameReq: 25000,  speed: 180, bagCap: 3000 }, // 1-4 마다가스카르(두 수역 공통)
  { tier: 8, name: '대양 트롤선', price: 1250000, fameReq: 80000, speed: 200, bagCap: 4000 }, // 1-5 남대서양(두 해역 공통)
  { tier: 9, name: '가공 플랜트선', price: 12500000, fameReq: 230000, speed: 200, bagCap: 4000 }, // 여는 해역 없음 — 가방 초과 때 자동 기운 얻기
];
// 배 ↔ 지역 매핑("몇 번째 지역의 몇 번째 배") — 지역당 2개 규칙 유지:
//   1-1 = t1/t2 · 1-2 = t3/t4 · 1-3 = t5/t6(tier4 흡수로 한 칸 당김) ·
//   1-4 마다가스카르 = t7 원양어선 한 척(두 수역 EV 격차가 작아 한 척으로 연다) ·
//   1-5 남대서양 = t8 대양 트롤선 한 척(두 해역 공통) ·
//   북극 = 쇄빙선 · 남극 = 과학탐사선(예약).
//   말라카 해협 게이트는 requiredBoat 5로 설정한다.

// 맨발(boat 0)은 BOATS 행이 없다 — 도보 상태의 가방 한계만 별도 상수로.
// 개체는 DB 행이라 상한이 없으면 유저당 무한히 늘고(spec 1절의 유일한 인벤토리 제한 근거),
// 넘치면 거부하지 않고 가장 안 특별한 개체를 놓아준다(logic.bagCapacity·overflowUids 주석).
// ⚠️ 가안 — 방치 낚시 속도를 보고 튜닝한다(변이 확률·크기 상수와 같은 취급).
export const WALK_BAG_CAP = 60;

export const MAX_BOAT = BOATS.length;

/** boat 인덱스의 행 — 방어적 클램프. 맨발(0)은 행이 없어 undefined */
export const boatAt = (boat: number): Boat | undefined =>
  BOATS[Math.min(Math.max(boat, 1), MAX_BOAT) - 1];

/** 배 표시명 단일 출처 — '없음' 계열 라벨이 화면마다 달라서('배 없음' 등) 인자로 받는다 */
export const boatNameOf = (boat: number, none = '없음'): string =>
  boat < 1 ? none : boatAt(boat)?.name ?? none;

/** 게이트 요구 문구 단일 출처 — tier 숫자를 배 이름으로 풀어준다.
 *  zones.gateMsg·world 경계 라벨·engine 폴백이 손으로 적던 자리에 이 함수를 쓴다.
 *  ("정크선(3단계)" 같은 문자열을 손으로 적으면 배 개명·tier 재배치 때 따로 썩는다) */
export const boatGateText = (tier: number): string =>
  `${boatNameOf(tier)}(${tier}단계)`;

/** 배 게이트에 막혔을 때 덧붙이는 다음 배 안내 — 배는 한 단계씩 사므로 지금 배의 바로 다음 단계를 보인다.
 *  조건 수치는 BOATS에서 읽는다. 마지막 배를 가졌으면 빈 문자열 */
export function nextBoatText(boat: number): string {
  const next = BOATS[boat];
  if (!next) return '';
  const fmt = (n: number) => n.toLocaleString('ko-KR');
  const fame = next.fameReq > 0 ? `명성 ${fmt(next.fameReq)} · ` : '';
  return `다음 배 ${next.name}: ${fame}골드 ${fmt(next.price)}. 집 목공소나 항구 조선소에서 살 수 있어요.`;
}
