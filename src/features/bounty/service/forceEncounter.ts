import { useSyncExternalStore } from 'react';
import type { GameAction } from '../../../game/rules/actions';

// 테스트용 강제 조우 — 개발 도구 패널이 켜 두면 다음 캐치 요청부터 표시를 싣는다.
// 네임드를 수주한 구역에서 낚아 도전권이 발급되면 저절로 꺼진다. 저장하지 않는다(새로고침하면 꺼짐).
// 허용 여부는 서버가 판정한다 — 운영 서버는 표시를 떼어 내고 통상 캐치로 처리한다.
let armed = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (armed === next) return;
  armed = next;
  for (const listener of listeners) listener();
}

export const armForceEncounter = (): void => set(true);
export const disarmForceEncounter = (): void => set(false);
export const isForceEncounterArmed = (): boolean => armed;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useForceEncounterArmed(): boolean {
  return useSyncExternalStore(subscribe, isForceEncounterArmed, isForceEncounterArmed);
}

/** 디스패치 직전에 부른다 — 켜져 있으면 캐치에 강제 조우 표시를 싣는다 */
export function withForcedEncounter(action: GameAction): GameAction {
  if (!armed || action.type !== 'catch') return action;
  return { ...action, forceEncounter: true };
}

/** 성공 결과마다 부른다 — 도전권이 발급됐으면 끈다 */
export function settleForcedEncounter(result: { type: string; ticket?: string }): void {
  if (result.type === 'catch' && result.ticket) set(false);
}
