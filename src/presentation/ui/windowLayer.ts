import { createContext, useContext, useSyncExternalStore } from 'react';

// 창이 쌓이는 자리 - 창은 자기를 연 층 바로 위에 쌓인다. 그 자리를 이 모듈이 정하고, 공용 창(Modal)만 읽는다.
// 기본 자리는 게임 화면의 루트(창 층)이고, 창 층 위에 따로 놓인 층(모바일 시트)은 WindowSlot으로 자기 안에 창 자리를 제공한다.
// 층 안에서 연 창과, 그 창에서 연 창은 React 트리를 따라 같은 자리를 이어받는다.
let host: HTMLElement | null = null;
const listeners = new Set<() => void>();

function setHost(el: HTMLElement | null) {
  if (host === el) return;
  host = el;
  listeners.forEach(l => l());
}

/** 게임 화면 루트의 콜백 ref. 마운트 때 창 층 자리를 등록하고, 해제 때는 그 자리가 아직 자기 요소일 때만 비운다.
 *  새 루트가 먼저 등록된 뒤 이전 루트가 해제되어도 새 자리가 지워지지 않는다.
 *  앱 최상위처럼 게임 화면 바깥에서 띄운 창도 이 자리에 그려져야 탭 줄과 같은 쌓임 맥락 안에서 탭 줄 아래에 놓인다. */
export function windowHostRef(el: HTMLElement | null) {
  if (!el) return;
  setHost(el);
  return () => { if (host === el) setHost(null); };
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

// undefined는 층 자리가 없다는 뜻(기본 창 층), null은 자리가 아직 만들어지지 않았다는 뜻이다
export const SlotContext = createContext<HTMLElement | null | undefined>(undefined);

/** 지금 그려지는 층에서 창이 쌓일 자리. WindowSlot 안이면 그 자리(아직 없으면 null), 아니면 창 층 자리. 없으면 null */
export function useWindowHost(): HTMLElement | null {
  const layer = useContext(SlotContext);
  const base = useSyncExternalStore(subscribe, () => host, () => null);
  return layer === undefined ? base : layer;
}

/** 이 층 안에서 연 창이 이 층 바로 위에 쌓이는지(WindowSlot 안인지). 자리가 만들어지기 전에는 창을 그리지 않는 데 쓴다 */
export function useInWindowSlot(): boolean {
  return useContext(SlotContext) !== undefined;
}
