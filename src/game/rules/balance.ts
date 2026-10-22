// 밸런스 상수 — 튜닝 가능한 모든 수치는 이 파일에만 둔다 
// 여기 값을 바꾸는 것만으로 게임 감각이 조정되어야 하고, 로직 파일에 수치를 흘리지 않는다.

import type { BountyKind } from '../content/bounties.js';
import type { RarityId } from '../content/rarity.js';
import type { GameAction } from './actions.js';

// 낚시 상태머신 타이밍 (캐스팅 연출 단계는 없음 — 던지면 바로 대기)
export const CATCH_MS = 2000;            // 획득 카드 표시 후 자동 재캐스트
export const CATCH_MS_LEGENDARY = 2700;  // 전설 등급은 이펙트를 더 보여주려고 아주 약간 더 길게
// 등급별 획득 표시 시간 오버라이드 — 새 등급의 연출을 연장할 때 해당 행을 추가한다.
export const CATCH_MS_BY_RARITY: Partial<Record<RarityId, number>> = {
  legendary: CATCH_MS_LEGENDARY,
};

// 어군 캐스팅 판정 반경(px) — "어군 위/옆"의 정의 (28 → 40 완화: 던지기가 덜 빡빡하게)
export const CAST_RANGE = 40;

// 이동 속도(px/s)
export const WALK_SPEED = 80; // 마을 도보 (배는 data의 배별 speed). 유물 보정은 항해에만 붙는다

// 판정별 배수 — 수동 어드밴티지의 핵심. **일반 가중치를 이 값으로 나눈다**(희귀 데이터 불변,
// 단일 추첨에서 "희귀 ×배수"와 동치 — rollFish 주석). perfect = 빨간 존, good = 노란 존.
export const JUDGMENT_MULT = {
  perfect: 2,
  good: 1.6,
  normal: 1,
} as const;

// 방치(auto) 판정: 일반 등급 가중치를 이만큼 곱해서 추첨 — 희귀 이상이 수동의 1/10 수준
// 낚싯대 곡선(t, ROD.curveK)에 따라 from → to로 완화 (강화할수록 방치 효율도 개선)
export const AUTO_COMMON_BOOST = { from: 10, to: 4 } as const;

// 낚싯대 — 무한 강화.
// 입질 대기: Lv1의 최소·최대 대기에 레벨마다 biteDecay를 곱한다(곱연산 단축, 레벨마다 체감).
// 방치 부스트의 절대치 버전(fishing.autoCommonBoost)만 점근 곡선 t = 1 - 1/(1 + curveK*(lv-1))을 쓴다.
// ⚠️ 구 zone(레벨당 PERFECT 존 확대)은 폐기 — 존은 수역 파워 게이트 초과 보너스로 이관(stats.powerZones)
export const ROD = {
  curveK: 0.15,
  biteMin: 4,                       // Lv1 입질 최소 대기(초)
  biteMax: 8,                       // Lv1 입질 최대 대기(초)
  biteDecay: 0.94,                  // 레벨마다 입질 대기에 곱하는 값(6% 단축)
  sweep: 1.4,                       // 타이밍 바 시간(초) — 레벨 무관 고정
  // 강화 비용: costPowerFrom 레벨까지는 round(costBase × costGrowth^(lv-1)),
  // 그 뒤로는 costPowerFrom 레벨 비용 × (lv / costPowerFrom)^costPowerExp.
  // 경계는 인도양 최소 요구 파워를 채우는 Lv16 직전이다. 동남아까지는 지수로 가파르게 두고,
  // 그 뒤로는 직전 대비 배율이 레벨마다 줄어 강화 간격이 완만하게 늘어난다.
  costBase: 50,
  costGrowth: 1.7,
  costPowerFrom: 15,
  costPowerExp: 8,
} as const;

// 낚싯대 강화 비용 — level에서 level+1로 올리는 비용.
// rules(구매 가능 판정)·logic(강화 실행)이 함께 쓰므로, 둘의 공통 하류인 여기에 둔다.
// logic에 두면 rules → logic → rules 순환이 생긴다 (logic이 rules의 판정을 쓴다).
export function upgradeCost(level: number): number {
  const exp = (lv: number) => ROD.costBase * Math.pow(ROD.costGrowth, lv - 1);
  if (level <= ROD.costPowerFrom) return Math.round(exp(level));
  return Math.round(exp(ROD.costPowerFrom) * Math.pow(level / ROD.costPowerFrom, ROD.costPowerExp));
}

// 서버 스냅샷 주기 — saves_current version이 이 배수일 때 saves(아카이브)에 append (서버 액션 처리기).
// 롤백 시 유실 창이 최대 이 주기 — 초기값, 볼륨 실측 후 조정 (refactor-design 3.3)
export const SNAPSHOT_EVERY = 50;

// 미끼 효과 배수 — 활성 중인 미끼의 targetRarity 어종 가중치에 곱한다(등급 예산 ×2와 동치,
// drawWeights 주석). 전 수역 균일·방치 획득에는 무효.
export const BAIT_WEIGHT_MULT = 2;

// buyBait 액션 1회당 구매 개수 상한 — 소모품 대량 판매의 왕복 폭주 방지용 상한일 뿐, 밸런스가
// 아니다. 스택형 items라 여러 번 사면 충분하다.
export const BAIT_BUY_MAX = 50;

// 전시대 칸 수 — 고정. 확장(골드 구매)은 결정되지 않았다. 칸 번호는 exhibit 배열 인덱스다.
export const EXHIBIT_SLOTS = 3;


// 바운티 헌팅 일일 클리어 상한 — 수주가 아니라 클리어(수배판에서 보상을 받은 납품·토벌)를 센다.
// 일반 의뢰는 전 구역 통합, 네임드 토벌은 전역에서 따로 센다. 항구별 상한은 없다.
// 두 갈래 모두 한 번에 하나만 수주할 수 있다. 하루는 KST 04:00에 바뀐다(게임 날짜) — 서버가 판단한다.
export const BOUNTY_DAILY_CAP = 1; // 일반 의뢰 하루 1회(2026-10-17, 3회 → 1회 · 보상 5배)
export const BOUNTY_NAMED_DAILY_CAP = 1;

/** 갈래의 하루 클리어 상한 */
export const bountyDailyCap = (kind: BountyKind): number =>
  kind === 'named' ? BOUNTY_NAMED_DAILY_CAP : BOUNTY_DAILY_CAP;

// 네임드 조우 가중치(전역 기본) — 수주 중인 네임드 의뢰가 있으면 캐치마다 맨 먼저 뽑는다.
// 확률 = named / (named + none). 해역 데이터(spots.namedWeight)가 있으면 그 해역은 그 값을 쓴다.
// 명중하면 즉시 획득이 아니라 도전권을 발급한다.
// Lv12 방치 약 6.4초/cycle 기준 기댓값 약 1.8시간 — 이게 진짜 게이트다.
export const NAMED_ENCOUNTER_WEIGHTS = { named: 1, none: 999 } as const;

// 네임드 도전 — 네임드 체력(네임드 데이터, 태평양 5~마다가스카르 8)만큼 맞히면 성공, 3번째 실패에 탈락.
// 화면은 결투(왕복 커서·옮겨 가는 존)다.
// 존 폭은 고정 관대값이다(자리만 옮긴다 — 수역 게이트와 무관, 어렵게 하지 않는다).
export const CHALLENGE_MISS_LIMIT = 3; // 이만큼 실패하면 탈락 — 모든 네임드 공통
export const CHALLENGE_YELLOW = 0.3;
export const CHALLENGE_RED = 0.1;

// 매크로 페이싱 게이트(2단계) — 같은 uid의 성공 액션 사이 최소 간격(ms). 서버 액션 처리기가
// saves_current.updated_at(성공 커밋마다 갱신됨)과 서버 시각을 비교해 미달이면 429.
//   느림(기본) = 서버 추첨으로 가치를 '생성'하거나 쓰기 비용이 큰 것(catch·sendLetter).
//     인간 최소 낚시 사이클(입질 1s + 스윕 1.4s + 홀드 2s ≈ 4.4s) 대비 한참 아래라 무감각.
//   빠름      = 상점·정비 등 UI 체인(연속 클릭)이 정상인 계열. 더블클릭(≤300ms)도 통과하고,
//     봇 flood에는 150ms≈최대 ~6.7 rps/uid의 완화 상한으로 남는다.
// 어느 쪽도 밸런스를 깨지 않는다 — 골드 생성점은 catch뿐이라 나머지는
// 완화해도 경제가 흔들리지 않는다. 액션 유형을 바꾸면 GameAction 유니온과 이 목록을 함께 갱신한다.
export const MIN_ACTION_GAP_MS = 1000;
export const MIN_ACTION_GAP_FAST_MS = 150;
// satisfies가 액션 유니온과의 일치를 강제한다 — 'letter'(이벤트 타입) 오기로 sendLetter가
// 빠른 창을 타던 버그의 재발 방지
export const PACING_SLOW_TYPES = ['catch', 'sendLetter'] as const satisfies readonly GameAction['type'][];

// (구 저장 검증 상수 3종은 세이브 v8에서 삭제 — 저장 검증은 v0.3.3, 서버 검증은 v0.5.0에
//  사라졌고, 서버 권위에서 클라 변조 검증은 성립하지 않는다. 상태를 만드는 쪽이 서버다)

// 월척(크기)·변이 — 신규 로직 없이 기존 어종 데이터를 재사용하는 저비용 콘텐츠 
// 크기 분포는 어종마다 수동 지정하지 않고 가격에서 공식으로 유도한다.
export const SIZE_MEAN_BASE = 10;      // cm — 가격 0일 때 평균 크기
export const SIZE_MEAN_PER_PRICE = 0.15; // cm/G — 비쌀수록(대체로 큰 어종일수록) 평균 크기도 커짐
export const SIZE_STD_RATIO = 0.18;    // 표준편차 = 평균 × 이 비율
// 폼 가중치(전역 기본) — 캐치마다 일반·돌연변이를 이 가중치로 뽑는다(확률 = 가중치 / 합).
// 해역 데이터(spots.mutationWeight)가 있으면 그 해역은 그 값을, 유물 효과가 있으면 유물 값을 쓴다. 어종당 변이 1종 고정
export const MUTATION_WEIGHTS = { variant: 1, normal: 3 } as const;
export const VARIANT_PRICE_MULT = 2;   // 변이 개체 판매가 배수
export const BIG_CATCH_PERCENTILE = 20; // 크기가 상위 이 %(이하) 안에 들면 "월척" 표시

