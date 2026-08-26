// 사이드바 탭 타입/상수 — 컴포넌트 파일과 분리해 Fast Refresh 경고 방지.
// 탭은 씬과 무관하게 항상 5개(지역/가방/도감/도움말/설정)로 고정 + 조건부 관리자 탭(별도).
// 관리자 탭은 ?admin 경로 && (로컬 또는 소유자 계정)일 때만 노출된다(shared.ts 게이트).
// 시설 상호작용 패널은 스테이지 모달 소관 — stage/FacilityModal.ts의 ActionPanel 참조.
export type TabKey = 'region' | 'bag' | 'dex' | 'help' | 'settings' | 'admin';

export const DEFAULT_TAB: TabKey = 'region';

/** 탭바에 놓이는 순서 — **숫자 단축키가 이 순서다**(1=지역 … 5=설정).
 *  실제 렌더 순서(sidebar/index.tsx의 tabsFor)와 어긋나면 단축키가 엉뚱한 탭을 연다.
 *  둘의 일치는 app.test가 강제한다. */
export const TAB_ORDER: readonly TabKey[] = ['region', 'bag', 'dex', 'help', 'settings'];

// 키보드 축은 둘이다(sidebar/index.tsx 참조):
//   숫자    = 탭 **선택**. 같은 탭을 한 번 더 누르면 그 탭의 보기가 순환된다
//             (가방: 목록↔카드 · 도감: 일반↔돌연변이).
//   Tab     = **탭 내부** 페이지 순환 — 메뉴 탭을 넘나들지 않는다
//             (가방: 목록↔카드 · 도감: 지역 순환 · 나머지: 없음).
// 구 SUB_TABS 평면 테이블(7칸 순환)은 이 재편에서 폐기됐다.
