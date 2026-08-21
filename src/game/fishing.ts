// 낚시 상태머신 — 순수 모듈 
// React/타이머 의존 없음: Field.tsx는 여기 함수들을 타이머·입력에 연결하는 어댑터다.
// P2 서버 권위 전환 시 서버가 이 모듈을 그대로 import해 같은 규칙으로 판정한다.
import { rodStats, rodCurveT, judgeTiming, rollFish } from './logic';
import type { Fish, Judgment, RarityId, SpotId } from './logic';
import { AUTO_COMMON_BOOST, CATCH_MS, CATCH_MS_LEGENDARY, JUDGMENT_MULT } from './balance';

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
    case 'catch': return rarity === 'legendary' ? CATCH_MS_LEGENDARY : CATCH_MS;
  }
}

// bite 중 챔질 입력 판정: 경과 시간 → 커서 위치 → PERFECT 존 명중 여부 (R6b)
export function judgePress(elapsedMs: number, rodLevel: number): Judgment {
  const st = rodStats(rodLevel);
  return judgeTiming(elapsedMs / 1000 / st.sweep, st.zone);
}

// 방치 판정의 일반 등급 부스트 — 낚싯대가 좋을수록 완화 (10배 → 4배 수렴)
export function autoCommonBoost(rodLevel: number): number {
  const t = rodCurveT(rodLevel);
  return AUTO_COMMON_BOOST.from + (AUTO_COMMON_BOOST.to - AUTO_COMMON_BOOST.from) * t;
}

// 획득 결정 (R8, R9, R11): 전부 해당 수역 풀에서 추첨.
// perfect/normal = 희귀 가중치 ×배수, auto(방치) = 일반 가중치 부스트(희귀 확률 ≈ 수동의 1/10)
export function resolveCatch(
  spot: SpotId, judgment: Judgment, rodLevel: number, rng: () => number = Math.random,
): Fish {
  return judgment === 'auto'
    ? rollFish(spot, 1, rng, autoCommonBoost(rodLevel))
    : rollFish(spot, JUDGMENT_MULT[judgment], rng);
}
