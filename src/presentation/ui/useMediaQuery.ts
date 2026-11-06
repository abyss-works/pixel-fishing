import { useSyncExternalStore } from 'react';

// 화면 조건(CSS 미디어 질의)을 구독한다. matchMedia가 없는 환경(테스트 DOM 등)에서는 항상 false다.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    notify => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** 터치처럼 손가락으로 누르는 기기(거친 포인터) */
export const useCoarsePointer = (): boolean => useMediaQuery('(pointer: coarse)');
