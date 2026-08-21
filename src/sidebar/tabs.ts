// 사이드바 탭 타입/상수 — 컴포넌트 파일과 분리해 Fast Refresh 경고 방지.
// 탭은 씬과 무관하게 항상 5개(지역/가방/도감/도움말/설정)로 고정. 시설 상호작용 패널은
// 스테이지 모달 소관 — stage/FacilityModal.ts의 ActionPanel 참조.
export type TabKey = 'region' | 'bag' | 'dex' | 'help' | 'settings';

export const DEFAULT_TAB: TabKey = 'region';
