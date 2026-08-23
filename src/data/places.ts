import type { SpotRegionId } from './spots.js';

// 장소 식별자 — **데이터 계층에 둔다.** 세이브(`game/`)와 렌더링(`world/`)이 둘 다 이 타입을
// 알아야 하는데, 의존 방향이 world → game 단방향이라 game이 world를 볼 수 없다.
// 지역 id는 이미 `spots.ts`에서 파생되므로 거점 id도 같은 계층에 둔다.
export type BaseId = 'home' | 'harbor';

/** 플레이어가 있는 곳. 세이브에 저장돼 새로고침 후 그 자리에서 재개한다.
 *  **좌표는 담지 않는다** — 이동은 액션이 아니라 클라 연출이라 매 프레임 저장할 수 없다.
 *  지역만 기억하고 그 지역의 spawn에서 다시 시작한다. */
export type LocationRef =
  | { kind: 'region'; id: SpotRegionId }
  | { kind: 'base'; id: BaseId };
