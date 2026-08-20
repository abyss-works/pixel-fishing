// 사이드바 탭 타입/상수 — 컴포넌트 파일(Sidebar.tsx)과 분리해 Fast Refresh 경고 방지
// 탭은 씬과 무관하게 항상 5개(지역/가방/도감/도움말/설정)로 고정. 시설 상호작용은
// 캔버스 클릭/필드 충돌 트리거로만 하고, 그 패널(판매/강화/배)은 탭 콘텐츠 위에 뜬다.
export type TabKey = 'region' | 'bag' | 'dex' | 'help' | 'settings';
export type ActionPanel = 'sell' | 'rod' | 'boat' | null;

export const DEFAULT_TAB: TabKey = 'region';
