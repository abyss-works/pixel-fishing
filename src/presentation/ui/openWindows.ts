import { useEffect, useSyncExternalStore } from 'react';

// 떠 있는 모달의 등록부 - Modal이 열려 있는 동안 레이어('stage' | 'app')와 함께 등록한다.
// 스테이지 모달은 스테이지 영역 안에 머무르며 사이드바 탭 전환·스크롤과 상호 간섭하지 않는다.
// 앱 모달(app)이 떠 있는 동안만 사이드바 배경이 불활성(inert)이 된다.
// 토스트 정책과 게스트 차단 가드는 전체 모달 열림 여부(hasOpenWindows)를 참조한다.
const open = new Map<object, 'stage' | 'app'>();
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach(l => l()); };

/** 모달이 떠 있는 동안 레이어와 함께 등록한다 */
export function useOpenWindow(layer: 'stage' | 'app' = 'app') {
  useEffect(() => {
    const token = {};
    open.set(token, layer);
    emit();
    return () => { open.delete(token); emit(); };
  }, [layer]);
}

/** 모달이 하나라도 떠 있는가 */
export const hasOpenWindows = (): boolean => open.size > 0;

/** 앱 전역 모달(layer="app")이 하나라도 떠 있는가 */
export const hasAppWindows = (): boolean => {
  for (const layer of open.values()) {
    if (layer === 'app') return true;
  }
  return false;
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** 앱 전역 모달이 하나라도 떠 있는가 - 등록·해제 때 다시 그린다(사이드 메뉴 불활성) */
export function useAnyAppWindow(): boolean {
  return useSyncExternalStore(subscribe, hasAppWindows, () => false);
}

/** 테스트 격리용 */
export function resetOpenWindows() {
  open.clear();
  emit();
}
