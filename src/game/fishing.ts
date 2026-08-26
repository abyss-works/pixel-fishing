// 낚시 상태머신 — 순수 모듈 
// React/타이머 의존 없음: Field.tsx는 여기 함수들을 타이머·입력에 연결하는 어댑터다.
// P2 서버 권위 전환 시 서버가 이 모듈을 그대로 import해 같은 규칙으로 판정한다.
import { rodStats, rodCurveT, rollFish } from './logic.js';
import type { Fish, Judgment, RarityId, SpotId } from './logic.js';
import { AUTO_COMMON_BOOST, CATCH_MS, CATCH_MS_BY_RARITY, JUDGMENT_MULT } from './balance.js';

// 캐스팅 연출 단계는 없다 — 던지면 바로 대기(wait). 순식간에 지나가는 상태 표시가
// 소음이라 v0.2.0에서 제거했다.
export type FishingPhase = 'idle' | 'wait' | 'bite' | 'catch';
export type ActivePhase = Exclude<FishingPhase, 'idle'>;

// 시간 초과 시 자동 전이: wait → bite → catch(방치 획득) → wait(재캐스트) …
export function nextPhase(p: ActivePhase): ActivePhase {
  switch (p) {
    case 'wait': return 'bite';
    case 'bite': return 'catch';
    case 'catch': return 'wait';
  }
}

// 각 단계의 지속 시간(ms). wait만 낚싯대 스탯 범위 내 랜덤.
// catch는 등급으로 분기 — 전설은 이펙트(회전+버스트)를 다 보여주려고 조금 더 길다.
export function phaseDurationMs(
  p: ActivePhase, rodLevel: number, rng: () => number = Math.random, rarity?: RarityId,
): number {
  const st = rodStats(rodLevel);
  switch (p) {
    case 'wait': return (st.biteMin + rng() * (st.biteMax - st.biteMin)) * 1000;
    case 'bite': return st.sweep * 1000;
    case 'catch': return (rarity && CATCH_MS_BY_RARITY[rarity]) ?? CATCH_MS; // 등급 리터럴 비의존
  }
}

// 방치 판정의 일반 등급 부스트 — 낚싯대가 좋을수록 완화 (10배 → 4배 수렴) — 절대치 버전
export function autoCommonBoost(rodLevel: number): number {
  const t = rodCurveT(rodLevel);
  return AUTO_COMMON_BOOST.from + (AUTO_COMMON_BOOST.to - AUTO_COMMON_BOOST.from) * t;
}

// 파워 기준 **상대** 방치 페널티(relativeIdleBoost)와 수동 보정(manualPowerBonus)은
// power.ts 단일 출처 — 초과 파워 계단 스케일링이 여기서 중복되지 않게 한다.

// 획득 결정 (R8, R9, R11): 전부 해당 수역 풀에서 추첨.
// 판정 배수(perfect/good)와 페널티(gateMult — stats.powerZones, 미달 수역)는 둘 다
// 일반 가중치 축을 건드린다(rollFish 주석). 요구 이상 수역은 gateMult=1이라 무영향.
export function resolveCatch(
  spot: SpotId, judgment: Judgment, rodLevel: number,
  rng: () => number = Math.random, gateMult = 1,
): Fish {
  return judgment === 'auto'
    ? rollFish(spot, 1, rng, autoCommonBoost(rodLevel) * gateMult)
    : rollFish(spot, JUDGMENT_MULT[judgment], rng, gateMult);
}
