import { useSyncExternalStore } from 'react';
export type { AcceptConsentResult, ConsentStatus } from '../../../platform/api';

// 이용약관 수락 게이트 상태 — 부트스트랩 중 약관 확인 전('pending')이나 미수락 차단('blocked') 동안
// 실시간 채널과 게임 조회가 먼저 열리지 않게 막는다. 기본값은 'ready'라 단독 훅 테스트는 가로막지 않고,
// 앱 부팅(useGame) 시작 시 holdConsentGate()로 확인을 마칠 때까지 잠근다.
export type ConsentGatePhase = 'ready' | 'pending' | 'blocked';

let phase: ConsentGatePhase = 'ready';
const listeners = new Set<() => void>();

function setPhase(next: ConsentGatePhase): void {
  if (phase === next) return;
  phase = next;
  for (const fn of listeners) fn();
}

export const getConsentGate = (): ConsentGatePhase => phase;
export const holdConsentGate = (): void => setPhase('pending');
export const blockConsentGate = (): void => setPhase('blocked');
export const allowConsentGate = (): void => setPhase('ready');
export const resetConsentGate = (): void => setPhase('ready');

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** 약관 확인을 통과했는가 — 미확인('pending')이나 미수락('blocked')이면 거짓이다 */
export function useConsentReady(): boolean {
  return useSyncExternalStore(subscribe, () => phase === 'ready', () => true);
}
