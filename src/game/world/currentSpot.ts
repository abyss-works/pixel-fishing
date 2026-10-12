import type { SpotId } from '../content/spots.js';
import type { ZoneId } from '../content/zones.js';
import type { Point } from './types.js';

// 현재 어군(spot)·플레이어 좌표·구역의 세션 저장소. React 구독은 features/travel이 맡는다.
// 세이브 대상이 아니므로 새로고침하면 초기화된다.
export interface SpotState {
  spot: SpotId | null;
  zone: ZoneId | null;
  pos: Point | null;
}

let state: SpotState = { spot: null, zone: null, pos: null };
const listeners = new Set<() => void>();

function emit(next: SpotState) {
  state = next;
  for (const fn of listeners) fn();
}

export function subscribeSpotState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getSpotState(): SpotState {
  return state;
}

/** Field 이동 루프가 호출 — 사거리 내 어군 갱신. */
export function setCurrentSpot(spot: SpotId | null): void {
  if (state.spot === spot) return;
  emit({ ...state, spot });
}

/** Field 이동 루프가 호출 — 구역 전이 갱신. */
export function setZone(zone: ZoneId | null): void {
  if (state.zone === zone) return;
  emit({ ...state, zone });
}

/** Field 이동 루프가 호출 — 좌표 갱신. */
export function setPlayerPos(pos: Point | null): void {
  if (state.pos?.x === pos?.x && state.pos?.y === pos?.y) return;
  emit({ ...state, pos });
}

/** 테스트 격리용 — 모듈 전역 상태를 초기화한다. */
export function resetSpotState(): void {
  emit({ spot: null, zone: null, pos: null });
}
