// 배 데이터 — 대양 진입·해역 게이트·항해 속도·가방 용량
//
// **작명(사용자 확정 2026-08-27): "정크선 → 범선 → 증기선 → 대양선 → 원양어선" 사다리**.
//   기술 발전 순서이자 각 지역의 정체성이다(정크선=남중국해 계절풍 무역로, 범선=대양 항해,
//   증기선=산업 시대의 인도양, 대양선=현대 원양 여객). 뒷노선 예약: 1-4 아프리카(마다가스카르)
//   또는 미국부터 **원양어선**, 이후 쇄빙선(북극)·과학탐사선(남극) — 사용자 노선 수정으로
//   대서양 단독 지역이 폐지되면서 병합안(region-boat-merge)의 7단계 표가 이 순서로 확정됐다.
//   ⚠️ 소급 개명 — 구 tier4 '원양어선' 보유 유저는 '범선'으로 표시된다. 릴리즈 패치노트에
//   개명 안내 동봉 필수(decisions/region-1-2-cut.md 경고의 실행).
//
// **스케일링 규칙(사용자 지시 반영)**:
//   명성 하한 = 기하 스케일링. 직전 배 가방 용량 × 일반 어종 ⭐5 × 가속 계수 k(0.7→1.3→2→3→6)
//     — 초반은 기존 값과 동일(500/2000/6000), 후반은 벽을 세워 방치 누적 명성(운영 관찰
//     8~12만)을 고려했다. 선형이면 벽이 사라져버린다.
//   가방 용량 = 사용자 지정: tier5·6 신설분 1500/2000 (기존 불변 — 래칫 보호).
//   가격 = "새로 열리는 최고 수역 무판정 EV 약 28~35배" 암묵 규칙 + 상승 비율 완만 감소.
export interface Boat {
  tier: number;
  name: string;
  price: number;   // 구매 골드 (차감)
  fameReq: number; // 명성 하한 (검증만, 차감 없음)
  speed: number;   // 항해 속도(px/s)
  bagCap: number;  // 이 배를 가졌을 때 가방 용량(마리) — "더 먼 바다 + 더 큰 화물"
}

export const BOATS: readonly Boat[] = [
  { tier: 1, name: '조각배',   price: 300,    fameReq: 0,     speed: 85,  bagCap: 140 },  // 1-1 태평양
  { tier: 2, name: '돛단배',   price: 2000,   fameReq: 1000,  speed: 100, bagCap: 300 }, // 1-1 마리아나 해구
  { tier: 3, name: '정크선',   price: 6000,   fameReq: 3500,  speed: 115, bagCap: 600 },  // 1-2 동남아 진입
  { tier: 4, name: '범선',     price: 15000,  fameReq: 11000, speed: 130, bagCap: 1000 }, // 1-2 특화수역(코론/리프)
  { tier: 5, name: '증기선',   price: 32000,  fameReq: 24000, speed: 145, bagCap: 1500 }, // 1-3 인도양 — 동남아 건너뛰기
  { tier: 6, name: '대양선',   price: 70000,  fameReq: 50000, speed: 160, bagCap: 2000 }, // 1-3 남인도양
];
// 배 ↔ 지역 매핑("몇 번째 지역의 몇 번째 배") — 지역당 2개 규칙 유지:
//   1-1 = t1/t2 · 1-2 = t3/t4 · 1-3 = t5/t6(tier4 흡수로 한 칸 당김) ·
//   1-4 아프리카 = t7 원양어선(예약) 이후 t8 · 북극 = 쇄빙선 · 남극 = 과학탐사선.
//   말라카 해협 게이트 = requiredBoat 5(seasia.ts 참조).

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
