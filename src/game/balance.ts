// 밸런스 상수 — 튜닝 가능한 모든 수치는 이 파일에만 둔다 
// 여기 값을 바꾸는 것만으로 게임 감각이 조정되어야 하고, 로직 파일에 수치를 흘리지 않는다.

import type { RarityId } from '../data/rarity.js';

// 낚시 상태머신 타이밍 (캐스팅 연출 단계는 없음 — 던지면 바로 대기)
export const CATCH_MS = 2000;            // 획득 카드 표시 후 자동 재캐스트
export const CATCH_MS_LEGENDARY = 2700;  // 전설 등급은 이펙트를 더 보여주려고 아주 약간 더 길게
// 등급별 획득 표시 시간 오버라이드 — 새 등급의 연출 연장 = 여기 행 추가 (fishing.ts가 참조)
export const CATCH_MS_BY_RARITY: Partial<Record<RarityId, number>> = {
  legendary: CATCH_MS_LEGENDARY,
};

// 군집 캐스팅 판정 반경(px) — "군집 위/옆"의 정의 (28 → 40 완화: 던지기가 덜 빡빡하게)
export const CAST_RANGE = 40;

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

// 서버 스냅샷 주기 — saves_current version이 이 배수일 때 saves(아카이브)에 append (api/action.ts).
// 롤백 시 유실 창이 최대 이 주기 — 초기값, 볼륨 실측 후 조정 (refactor-design 3.3)
export const SNAPSHOT_EVERY = 50;

// (구 저장 검증 상수 3종은 세이브 v8에서 삭제 — validate.ts는 v0.3.3, api/save.ts는 v0.5.0에
//  사라졌고, 서버 권위에서 클라 변조 검증은 성립하지 않는다. 상태를 만드는 쪽이 서버다)

// 월척(크기)·변이 — 신규 로직 없이 기존 어종 데이터를 재사용하는 저비용 콘텐츠 
// 크기 분포는 어종마다 수동 지정하지 않고 가격에서 공식으로 유도한다.
export const SIZE_MEAN_BASE = 10;      // cm — 가격 0일 때 평균 크기
export const SIZE_MEAN_PER_PRICE = 0.15; // cm/G — 비쌀수록(대체로 큰 어종일수록) 평균 크기도 커짐
export const SIZE_STD_RATIO = 0.18;    // 표준편차 = 평균 × 이 비율
export const MUTATION_RATE = 1 / 5;    // 캐치마다 변이(색상 변이) 확률 — 어종당 변이 1종 고정 (1/3→1/5, 체감 하향)
export const VARIANT_PRICE_MULT = 2;   // 변이 개체 판매가 배수
export const BIG_CATCH_PERCENTILE = 20; // 크기가 상위 이 %(이하) 안에 들면 "월척" 표시

// 가방 용량 — 정규화(0006) 이후 개체는 DB 행이라 상한 없이 두면 유저당 무한히 는다.
// spec 1절이 위험요소 배제의 **유일한 예외**로 인벤토리 제한을 허용한 근거도 같다:
// "물리적이고 자연스러운 한계"는 도전 요소고, 시간 기반 인위적 상한(쿨다운·오프라인 캡)과
// 다른 범주다. 넘치면 거부하지 않고 **가장 안 특별한 개체를 놓아준다** — 실패를 만들지 않는다.
// ⚠️ 가안 — 방치 낚시 속도를 보고 튜닝한다(변이 확률·크기 상수와 같은 취급).
export const BAG_CAPACITY = 300;
