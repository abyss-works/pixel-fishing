import { useSyncExternalStore } from 'react';

// 가방 표시 설정 — 탭을 옮겨도(=컴포넌트가 언마운트돼도) 유지돼야 한다.
// 세이브에 넣지 않는 이유: 진행이 아니라 "이 화면을 어떻게 보고 있나"라서 서버 권위 대상이 아니고,
// 액션 왕복 비용을 낼 값도 아니다. 새로고침하면 초기값으로 돌아간다 — 의도한 수명이다.
// 가방 탭과 판매 패널이 같은 저장소를 본다: 한쪽에서 접은 종이 다른 쪽에서 펼쳐져 있으면
// 같은 목록을 두 번 훑게 된다.
export type BagLayout = 'list' | 'cards';

interface BagViewState {
  layout: BagLayout;
  collapsed: ReadonlySet<string>; // 접은 행 키만 기록 — 기본은 펼침
}

let state: BagViewState = { layout: 'list', collapsed: new Set() };
const listeners = new Set<() => void>();

function set(next: BagViewState) {
  state = next;
  for (const fn of listeners) fn();
}

export function useBagView(): BagViewState {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

export function setBagLayout(layout: BagLayout) {
  if (state.layout !== layout) set({ ...state, layout });
}

export function toggleBagRow(key: string) {
  const collapsed = new Set(state.collapsed);
  if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
  set({ ...state, collapsed });
}

/** 테스트 격리용 — 모듈 전역이라 케이스 사이에 초기화가 필요하다 */
export function resetBagView() {
  set({ layout: 'list', collapsed: new Set() });
}
