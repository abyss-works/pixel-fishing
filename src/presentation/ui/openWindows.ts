import { useEffect, useSyncExternalStore } from 'react';

// 떠 있는 모달의 등록부 - Modal이 열려 있는 동안 등록하고, 모달이 하나라도 떠 있으면 그 아래 층(스테이지·사이드 메뉴)은
// 입력을 받지 않는다(전역: 모달이 열린 동안 배경은 입력을 받지 않는다). 닫을 수 있는지(closable)와 무관하다.
// 모달을 닫는 출구는 모달 자신(X·Esc·바깥 누름)이 갖는다. 탭 줄은 모달을 닫지 않고 입력도 받지 않는다.
const open = new Set<object>();
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach(l => l()); };

/** 모달이 떠 있는 동안 등록한다 */
export function useOpenWindow() {
  useEffect(() => {
    const token = {};
    open.add(token);
    emit();
    return () => { open.delete(token); emit(); };
  }, []);
}

/** 모달이 하나라도 떠 있는가 */
export const hasOpenWindows = (): boolean => open.size > 0;

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** 모달이 하나라도 떠 있는가 - 등록·해제 때 다시 그린다(사이드 메뉴 불활성) */
export function useAnyOpenWindow(): boolean {
  return useSyncExternalStore(subscribe, hasOpenWindows, () => false);
}

/** 테스트 격리용 */
export function resetOpenWindows() {
  open.clear();
  emit();
}
