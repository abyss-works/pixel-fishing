// 밸런스 상수 — 튜닝 가능한 모든 수치는 이 파일에만 둔다 
// 여기 값을 바꾸는 것만으로 게임 감각이 조정되어야 하고, 로직 파일에 수치를 흘리지 않는다.

// 낚시 상태머신 타이밍 (캐스팅 연출 단계는 없음 — 던지면 바로 대기)
export const CATCH_MS = 2000;            // 획득 카드 표시 후 자동 재캐스트
export const CATCH_MS_LEGENDARY = 2700;  // 전설 등급은 이펙트를 더 보여주려고 아주 약간 더 길게

// 군집 캐스팅 판정 반경(px) — "군집 위/옆"의 정의
export const CAST_RANGE = 28;

// 이동 속도(px/s)
export const WALK_SPEED = 75; // 마을 도보 (배는 data의 배별 speed)

// 판정별 희귀(일반 외 등급) 가중치 배수 — 수동 어드밴티지의 핵심
export const JUDGMENT_MULT = {
  perfect: 1.6,
  normal: 1,
} as const;

// 방치(auto) 판정: 일반 등급 가중치를 이만큼 곱해서 추첨 — 희귀 이상이 수동의 1/10 수준
// 낚싯대 곡선(t)에 따라 from → to로 완화 (강화할수록 방치 효율도 개선)
export const AUTO_COMMON_BOOST = { from: 10, to: 4 } as const;

// 낚싯대 곡선 — 무한 강화, 점근 수렴 
// t = 1 - 1/(1 + curveK*(lv-1)): 레벨 1 → 0, ∞ → 1
export const ROD = {
  curveK: 0.15,
  biteMin: { from: 4, to: 1 },     // 입질 최소 대기(초)
  biteMax: { from: 8, to: 2.5 },   // 입질 최대 대기(초)
  sweep: { from: 1.0, to: 2.2 },   // 타이밍 바 시간(초)
  zone: { from: 0.24, to: 0.6 },   // PERFECT 존 비율
  costBase: 50,                     // 강화 비용 = round(costBase × costGrowth^(lv-1))
  costGrowth: 1.8,
} as const;

// 클라우드 동기화 주기(ms)
export const SYNC_INTERVAL_MS = 20_000;

// 서버 저장 검증 (validate.ts / api/save.ts)
// 이론상 최소 어획 사이클(만렙 기준 wait ≥1 + catch 2 ≈ 3s) 기준, slack으로 여유 흡수
export const MIN_CATCH_INTERVAL_MS = 3_000; // 어획 속도 상한 판정용
export const CATCH_RATE_SLACK = 10;         // 동기화 지연·flush 몰림 허용 마릿수
export const ECONOMY_GIFT_SLACK = 300;      // v1 이관 조각배 증정분 — 경제 보존식 허용 오차

// 월척(크기)·변이 — 신규 로직 없이 기존 어종 데이터를 재사용하는 저비용 콘텐츠 
// 크기 분포는 어종마다 수동 지정하지 않고 가격에서 공식으로 유도한다.
export const SIZE_MEAN_BASE = 10;      // cm — 가격 0일 때 평균 크기
export const SIZE_MEAN_PER_PRICE = 0.15; // cm/G — 비쌀수록(대체로 큰 어종일수록) 평균 크기도 커짐
export const SIZE_STD_RATIO = 0.18;    // 표준편차 = 평균 × 이 비율
export const MUTATION_RATE = 1 / 5;    // 캐치마다 변이(색상 변이) 확률 — 어종당 변이 1종 고정 (1/3→1/5, 체감 하향)
export const VARIANT_PRICE_MULT = 2;   // 변이 개체 판매가 배수
export const BIG_CATCH_PERCENTILE = 20; // 크기가 상위 이 %(이하) 안에 들면 "월척" 표시
