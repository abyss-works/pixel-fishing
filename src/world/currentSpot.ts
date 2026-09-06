// 현재 어군(spot) + 플레이어 좌표 + 구역 — 전역 스토어 (spec/zone-tree.md)
// spot = **캐스팅 사거리 내 어군**(null = 사거리 밖) — spot은 이제 조업 어군 오브젝트라
// "어디에 서 있는가"가 아니라 "어느 어군에 던질 수 있는가"로 판정한다(캐스팅 판정과 같은
// 학교 근접 규칙). zone = 셀 구역(zoneOf) — 지역 탭 로어의 단일 근원("가장 구체적인 존 우선").
// 세이브에 넣지 않는다: 진행이 아니라 클라 표시 상태라 서버 권위 대상이 아니고, 좌표도
// 저장하지 않는다. 새로고침하면 null로 초기화된다 — 의도한 수명.
import { useSyncExternalStore } from 'react';
import type { SpotId } from '../data/spots';
import type { ZoneId } from '../data/zones';
import type { Point } from './types';

interface SpotState {
  /** 캐스팅 사거리 내 어군 — null이면 사거리 밖(낚시 불가 상태) */
  spot: SpotId | null;
  /** 현재 구역(zoneOf 판정) — 지역 탭 로어의 단일 근원. 통행 전용 물(최상위 존)에서도 유지 */
  zone: ZoneId | null;
  /** 플레이어 픽셀 좌표(현재 지역 기준) — "가까운 어군" 거리순 정렬용. 저장 안 함(세션 전용) */
  pos: Point | null;
}

let state: SpotState = { spot: null, zone: null, pos: null };
const listeners = new Set<() => void>();

function emit(next: SpotState) {
  state = next;
  for (const fn of listeners) fn();
}

/** Field 이동 루프가 호출 — 사거리 내 어군 갱신(학교 근접 판정). 지역 탭 상세 슬롯이 소비한다 */
export function setCurrentSpot(spot: SpotId | null): void {
  if (state.spot === spot) return; // 같은 값이면 무시 — 왕복 렌더 방지
  emit({ ...state, spot });
}

/** Field 이동 루프가 호출 — 구역 전이(zoneOf) 갱신. 경계에서 왕복할 때만 렌더가 일어난다 */
export function setZone(zone: ZoneId | null): void {
  if (state.zone === zone) return;
  emit({ ...state, zone });
}

/** Field 이동 루프가 호출 — 좌표만 갱신(spot 변동 없을 때도 거리 표시를 위해) */
export function setPlayerPos(pos: Point | null): void {
  if (state.pos?.x === pos?.x && state.pos?.y === pos?.y) return;
  emit({ ...state, pos });
}

export function useSpotState(): SpotState {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

/** 테스트 격리용 — 모듈 전역이라 케이스 사이 초기화가 필요하다 */
export function resetSpotState(): void {
  emit({ spot: null, zone: null, pos: null });
}
