// 낚시 상태머신 — 순수 모듈 
// React/타이머 의존 없음: 게임 필드는 여기 함수들을 타이머·입력에 연결하는 어댑터다.
// P2 서버 권위 전환 시 서버가 이 모듈을 그대로 import해 같은 규칙으로 판정한다.
import { rodStats } from './logic.js';
import type { RarityId } from './logic.js';
import { CATCH_MS, CATCH_MS_BY_RARITY } from './balance.js';

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

/**
 * 이번 던짐의 첫 결과 시각. 줄을 거두면(idle) 지우고, 처음 catch 단계에 든 시각을 첫 결과로 잡아
 * 재캐스트로 wait에 돌아와도 유지한다.
 */
export function resultAtOf(prev: number | null, phase: FishingPhase, now: number): number | null {
  if (phase === 'idle') return null;
  return prev ?? (phase === 'catch' ? now : null);
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
