// 사이드바 탭 타입/상수 — 컴포넌트 파일과 분리해 Fast Refresh 경고 방지.
// 탭은 씬과 무관하게 항상 5개(지역/가방/도감/도움말/설정)로 고정 + 조건부 관리자 탭(별도).
// 관리자 탭은 ?admin 경로 && (로컬 또는 소유자 계정)일 때만 노출된다(shared.ts 게이트).
// 시설 상호작용 패널은 스테이지 모달 소관 — stage/FacilityModal.ts의 ActionPanel 참조.
export type TabKey = 'region' | 'bag' | 'dex' | 'help' | 'settings' | 'admin';

export const DEFAULT_TAB: TabKey = 'region';

/** 탭바에 놓이는 순서 — **숫자 단축키가 이 순서다**(1=지역 … 5=설정).
 *  실제 렌더 순서(sidebar/index.tsx의 tabsFor)와 어긋나면 단축키가 엉뚱한 탭을 연다.
 *  둘의 일치는 sidebar.test가 강제한다. */
export const TAB_ORDER: readonly TabKey[] = ['region', 'bag', 'dex', 'help', 'settings'];

/** 세부 보기까지 펼친 **평면 순서** — Tab 키가 이 순서를 한 칸씩 돈다.
 *  탭은 5개지만 가방·도감이 보기를 둘씩 가져 실제 칸은 7개다.
 *  `bag`/`dex`가 붙은 칸은 그 보기로 맞춘 뒤 이동한다(없는 칸 = 보기 축이 없는 탭).
 *  탭바에 보이는 순서와 같아야 한다 — 어긋나면 Tab이 화면과 다른 순서로 돈다(테스트로 강제). */
export const SUB_TABS: readonly {
  tab: TabKey;
  bag?: 'list' | 'cards';
  dex?: 'base' | 'variant';
}[] = [
  { tab: 'region' },
  { tab: 'bag', bag: 'list' },
  { tab: 'bag', bag: 'cards' },
  { tab: 'dex', dex: 'base' },
  { tab: 'dex', dex: 'variant' },
  { tab: 'help' },
  { tab: 'settings' },
];
