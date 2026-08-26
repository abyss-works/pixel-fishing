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

// 판정별 배수 — 수동 어드밴티지의 핵심. **일반 가중치를 이 값으로 나눈다**(희귀 데이터 불변,
// 단일 추첨에서 "희귀 ×배수"와 동치 — rollFish 주석). perfect = 빨간 존, good = 노란 존.
export const JUDGMENT_MULT = {
  perfect: 2,
  good: 1.6,
  normal: 1,
} as const;

// 방치(auto) 판정: 일반 등급 가중치를 이만큼 곱해서 추첨 — 희귀 이상이 수동의 1/10 수준
// 낚싯대 곡선(t)에 따라 from → to로 완화 (강화할수록 방치 효율도 개선)
export const AUTO_COMMON_BOOST = { from: 10, to: 4 } as const;

// 낚싯대 곡선 — 무한 강화, 점근 수렴
// t = 1 - 1/(1 + curveK*(lv-1)): 레벨 1 → 0, ∞ → 1
// ⚠️ 구 zone(레벨당 PERFECT 존 확대)은 폐기 — 존은 수역 파워 게이트 초과 보너스로 이관(stats.powerZones)
export const ROD = {
  curveK: 0.15,
  biteMin: { from: 4, to: 1 },     // 입질 최소 대기(초)
  biteMax: { from: 8, to: 2.5 },   // 입질 최대 대기(초)
  sweep: { from: 1.4, to: 1.4 },     // 타이밍 바 시간(초) — 레벨 무관 1.4초 고정
  costBase: 50,                     // 강화 비용 = round(costBase × costGrowth^(lv-1))
  // costGrowth 1.7 (v0.6.4 조정, 구 1.8) — **소프트캡 = 최종 수역 빨간 존 10%**.
  // 파워는 레벨당 +5라 빨간 존 폭도 5%p 계단: L19=5% · L20=10% · L22=20%(캡).
  // 1.7에서 L20 도달 누적 ≈171만 G(최고 어종 2,000G 기준 ~855마리)로 "겨우 걸치는" 규모가
  // 되고, 그 다음 단계부터 단독 백만 단위의 벽 — 콘텐츠 진입(L12에 요구 65 충족)과
  // 엔드게임 최적화(빨간 존)의 가격이 분리된다. 지수 자체는 유지(사용자 확정).
  costGrowth: 1.7,
} as const;

// 서버 스냅샷 주기 — saves_current version이 이 배수일 때 saves(아카이브)에 append (api/action.ts).
// 롤백 시 유실 창이 최대 이 주기 — 초기값, 볼륨 실측 후 조정 (refactor-design 3.3)
export const SNAPSHOT_EVERY = 50;

// 매크로 페이싱 게이트 — 같은 uid의 성공 액션 사이 최소 간격(ms). api/action.ts가
// saves_current.updated_at(성공 커밋마다 갱신됨)과 서버 시각을 비교하는 데만 쓴다.
// 인간 최소 낚시 사이클(입질 1s + 스윕 1.4s + 홀드 2s ≈ 4.4s)보다 한참 아래라 정상
// 플레이는 무감각하고, RTT만 반복하는 봇은 이 값이 곧 초당 상한이 된다. 가안 — 관측 후 조정.
export const MIN_ACTION_GAP_MS = 1000;

// (구 저장 검증 상수 3종은 세이브 v8에서 삭제 — validate.ts는 v0.3.3, api/save.ts는 v0.5.0에
//  사라졌고, 서버 권위에서 클라 변조 검증은 성립하지 않는다. 상태를 만드는 쪽이 서버다)

// 월척(크기)·변이 — 신규 로직 없이 기존 어종 데이터를 재사용하는 저비용 콘텐츠 
// 크기 분포는 어종마다 수동 지정하지 않고 가격에서 공식으로 유도한다.
export const SIZE_MEAN_BASE = 10;      // cm — 가격 0일 때 평균 크기
export const SIZE_MEAN_PER_PRICE = 0.15; // cm/G — 비쌀수록(대체로 큰 어종일수록) 평균 크기도 커짐
export const SIZE_STD_RATIO = 0.18;    // 표준편차 = 평균 × 이 비율
export const MUTATION_RATE = 1 / 3;    // 캐치마다 변이(색상 변이) 확률 — 어종당 변이 1종 고정 (1/5 → 1/3 복원, 사용자 지정)
export const VARIANT_PRICE_MULT = 2;   // 변이 개체 판매가 배수
export const BIG_CATCH_PERCENTILE = 20; // 크기가 상위 이 %(이하) 안에 들면 "월척" 표시

