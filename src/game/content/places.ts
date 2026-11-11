// 장소 식별자 — **데이터 계층에 둔다.** 저장 모델과 월드 렌더링이 둘 다 이 타입을
// 알아야 하지만 의존 방향은 월드에서 데이터로만 향한다.
// 거점 id도 같은 계층에 둔다.
export type BaseId = 'home' | 'harbor' | 'manila' | 'colombo' | 'toamasina' | 'walvisbay';

/** 거점이 속한 지역 — 거점의 지역은 여기가 정본이다. 서버의 게스트 판정(마을 안인가)도 이 표를 읽는다 */
export const BASE_REGION: Record<BaseId, RegionId> = {
  home: 'village', harbor: 'world', manila: 'world', colombo: 'world', toamasina: 'world', walvisbay: 'world',
};

/** 씬 지역 id — 오픈월드에서 도달 가능한 지역은 마을과 병합 바다뿐이다.
 *  구세이브 location에 남은 구 지역 id(ocean/seasia/indian 등)는 **런타임 문자열**로만
 *  존재한다 — safeLocation이 무검증 통과시키고 App.sceneOf가 고향 항구로 접는다.
 *  구 지역 이름은 관리자 화면에서 리터럴 미러로 표시한다. */
export type RegionId = 'village' | 'world';

/** 플레이어가 있는 곳. 세이브에 저장돼 새로고침 후 그 자리에서 재개한다.
 *  **좌표는 담지 않는다** — 이동은 액션이 아니라 클라 연출이라 매 프레임 저장할 수 없다.
 *  지역만 기억하고 그 지역의 spawn에서 다시 시작한다. */
export type LocationRef =
  | { kind: 'region'; id: RegionId }
  | { kind: 'base'; id: BaseId };

