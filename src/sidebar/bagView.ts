import { useSyncExternalStore } from 'react';

// 가방 표시 설정 — 탭을 옮겨도(=컴포넌트가 언마운트돼도) 유지돼야 한다.
// 세이브에 넣지 않는 이유: 진행이 아니라 "이 화면을 어떻게 보고 있나"라서 서버 권위 대상이 아니고,
// 액션 왕복 비용을 낼 값도 아니다. 새로고침하면 초기값으로 돌아간다 — 의도한 수명이다.
//
// **가방 탭과 판매 패널은 접힘 상태를 따로 갖는다.** 요구가 정반대라서다:
//   가방  = 열람 화면, 수백~수천 마리가 기본이라 **전부 닫힘이 기본**(사용자 지시 2026-08-27).
//   판매  = 선택 화면, 개체를 바로 골라야 하므로 **전부 펼침이 기본**(R1b — 판매 패널 개체 즉시 노출).
// 각 화면에서 건드린 종만 set에 기록된다 — set에 없는 종은 화면별 기본값을 따른다.
export type BagLayout = 'list' | 'cards';
export type BagSection = 'fish' | 'items';

interface BagViewState {
  layout: BagLayout;
  section: BagSection;            // 가방 탭 내부 서브탭(사용자 지시: 물고기/아이템 분리)
  opened: ReadonlySet<string>;    // 가방: **펼친** 행 키만 기록 — 기본은 전부 닫힘
  collapsed: ReadonlySet<string>; // 판매 패널: **접은** 행 키만 기록 — 기본은 전부 펼침
}

let state: BagViewState = {
  layout: 'list', section: 'fish', opened: new Set(), collapsed: new Set(),
};
const listeners = new Set<() => void>();

function set(next: BagViewState) {
  state = next;
  for (const fn of listeners) fn();
}

function useStore(): BagViewState {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

// ── 가방 탭 ──
export function useBagView(): { layout: BagLayout; section: BagSection; opened: ReadonlySet<string> } {
  const { layout, section, opened } = useStore();
  return { layout, section, opened };
}

export function setBagLayout(layout: BagLayout) {
  if (state.layout !== layout) set({ ...state, layout });
}

export function setBagSection(section: BagSection) {
  if (state.section !== section) set({ ...state, section });
}

export function toggleBagRow(key: string) {
  const opened = new Set(state.opened);
  if (opened.has(key)) opened.delete(key); else opened.add(key);
  set({ ...state, opened });
}

// ── 판매 패널 ──
export function useSellView(): { collapsed: ReadonlySet<string> } {
  const { collapsed } = useStore();
  return { collapsed };
}

export function toggleSellRow(key: string) {
  const collapsed = new Set(state.collapsed);
  if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
  set({ ...state, collapsed });
}

/** 테스트 격리용 — 모듈 전역이라 케이스 사이에 초기화가 필요하다 */
export function resetBagView() {
  set({ layout: 'list', section: 'fish', opened: new Set(), collapsed: new Set() });
}
