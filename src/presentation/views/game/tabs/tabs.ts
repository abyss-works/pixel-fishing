// 사이드바 탭 타입/상수 — 컴포넌트 파일과 분리해 Fast Refresh 경고 방지.
// 탭은 씬과 무관하게 항상 5개(지역/가방/도감/도움말/설정)로 고정 + 조건부 관리자 탭(별도).
// 관리자 탭은 ?admin 경로이며 로컬 또는 소유자 계정일 때만 노출된다.
// 시설 상호작용 패널은 스테이지 모달 소관 — 화면 컴포넌트의 ActionPanel 참조.
export type TabKey = 'region' | 'bag' | 'dex' | 'help' | 'settings' | 'admin';

export const DEFAULT_TAB: TabKey = 'region';

/** 도감 보기 — 도감 탭 재선택이 이 순서로 순환한다(일반 → 돌연변이 → 네임드) */
export type DexView = 'base' | 'variant' | 'named';
export const DEX_VIEWS: readonly DexView[] = ['base', 'variant', 'named'];

/** 탭바에 놓이는 순서 — **숫자 단축키가 이 순서다**(1=지역 … 5=설정, 관리자 6).
 *  실제 렌더 순서(tabsFor)와 어긋나면 단축키가 엉뚱한 탭을 연다.
 *  계약 테스트가 두 순서의 일치를 검증한다. */
export const TAB_ORDER: readonly TabKey[] = ['region', 'bag', 'dex', 'help', 'settings'];

// 키보드 축은 둘이다:
//   숫자    = 메뉴 탭 **선택**. 메뉴 탭 이동은 숫자키(와 클릭)로만 한다.
//             같은 탭을 한 번 더 고르면 그 탭의 보기가 순환된다
//             (가방: 목록↔카드 · 도감: 일반→돌연변이→네임드).
//   Tab     = 활성 탭의 **서브탭** 순환, Shift+Tab은 역방향 — 메뉴 탭을 넘나들지 않는다
//             (가방: 물고기↔아이템 · 도감: 지역 · 나머지: 없음).
