import { useSyncExternalStore } from 'react';

// 창 층의 자리 - 게임 화면의 루트(쌓임 맥락)가 등록한다. 앱 최상위처럼 게임 화면 바깥에서 띄운 앱 모달도
// 이 자리에 그려져야 탭 줄과 같은 쌓임 맥락 안에서 탭 줄 아래에 놓인다. 등록된 자리가 없으면(로그인 전 화면 등) 제자리에 그린다.
let host: HTMLElement | null = null;
const listeners = new Set<() => void>();

function setHost(el: HTMLElement | null) {
  if (host === el) return;
  host = el;
  listeners.forEach(l => l());
}

/** 게임 화면 루트의 콜백 ref. 마운트 때 자리를 등록하고, 해제 때는 그 자리가 아직 자기 요소일 때만 비운다.
 *  새 루트가 먼저 등록된 뒤 이전 루트가 해제되어도 새 자리가 지워지지 않는다. */
export function windowHostRef(el: HTMLElement | null) {
  if (!el) return;
  setHost(el);
  return () => { if (host === el) setHost(null); };
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** 앱 모달이 그려질 창 층의 자리. 없으면 null */
export function useWindowHost(): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => host, () => null);
}
