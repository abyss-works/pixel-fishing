import { useSyncExternalStore } from 'react';

// 창 층의 자리 - 게임 화면의 루트(쌓임 맥락)가 등록한다. 앱 최상위처럼 게임 화면 바깥에서 띄운 앱 모달도
// 이 자리에 그려져야 탭 줄과 같은 쌓임 맥락 안에서 탭 줄 아래에 놓인다. 등록된 자리가 없으면(로그인 전 화면 등) 제자리에 그린다.
let host: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** 게임 화면 루트가 마운트와 언마운트 때 부른다 */
export function setWindowHost(el: HTMLElement | null) {
  if (host === el) return;
  host = el;
  listeners.forEach(l => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** 앱 모달이 그려질 창 층의 자리. 없으면 null */
export function useWindowHost(): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => host, () => null);
}
