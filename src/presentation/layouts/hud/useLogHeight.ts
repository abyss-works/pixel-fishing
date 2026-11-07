import { useLayoutEffect, useRef } from 'react';
import { useMobileLayout } from '../useMobileLayout';

// PC 레이아웃에서 메시지 창은 스테이지 위에 떠 있다. 창 높이를 가장 가까운 스테이지(data-game-stage)의 --log-h로 알려, 프레임 안에 놓이는 화면이
// 창이 들어오는 아래 영역을 비우게 한다. 모바일 레이아웃는 창이 격자의 자기 행에 놓여 알릴 필요가 없다.
// jsdom에는 ResizeObserver가 없다 — 없으면 알리지 않는다.
export function useLogHeight() {
  const mobile = useMobileLayout();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.closest<HTMLElement>('[data-game-stage]');
    if (mobile || !el || !stage || typeof ResizeObserver === 'undefined') return;
    const publish = () => stage.style.setProperty('--log-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => { ro.disconnect(); stage.style.removeProperty('--log-h'); };
  }, [mobile]);
  return ref;
}
