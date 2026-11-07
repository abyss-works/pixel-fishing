import { useEffect, useState } from 'react';
import { useMobileLayout } from './useMobileLayout';

/** 화면 틀이 차지할 영역 — 레이아웃 뷰포트 안에서 위와 아래에서 비울 길이(px)와 키보드 여부 */
export interface VisibleBox { top: number; bottom: number; keyboard: boolean }

/** 이보다 작은 높이 변화(주소 줄 등)는 키보드로 보지 않는다 */
const KEYBOARD_MIN_PX = 120;

const NONE: VisibleBox = { top: 0, bottom: 0, keyboard: false };

/** 화면 키보드가 올라오면 보이는 영역(visual viewport)만 레이아웃 뷰포트보다 작아진다.
 *  보이는 영역의 높이와 위쪽 오프셋으로, 화면 틀이 비워야 할 위아래 길이를 정한다. */
export function visibleBox(layoutH: number, visibleH: number, visibleTop: number): VisibleBox {
  const bottom = layoutH - visibleH - visibleTop;
  if (bottom < KEYBOARD_MIN_PX) return NONE;
  return { top: Math.max(0, visibleTop), bottom, keyboard: true };
}

/** 모바일 레이아웃에서 화면 키보드를 피한 영역을 따라간다. PC 레이아웃는 늘 여백이 없다 */
export function useVisibleBox(): VisibleBox {
  const mobile = useMobileLayout();
  const [box, setBox] = useState<VisibleBox>(NONE);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!mobile || !vv) return;
    const update = () => {
      const next = visibleBox(window.innerHeight, vv.height, vv.offsetTop);
      setBox(prev => prev.top === next.top && prev.bottom === next.bottom ? prev : next);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [mobile]);
  return mobile ? box : NONE;
}
