import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import ArrowButton from './ArrowButton';

// 가로 스크롤 줄 — 내용이 넘치면 좌우 화살표로 밀어 본다. 카드 캐러셀과 서브탭이 공유한다.
//
// 넘치는 경우가 예외라서 화살표는 **넘칠 때만** 띄운다. 넘침은 실제 크기를 재야
// 판정된다 — CSS로는 판정할 수 없다. 스크롤 막대는 숨긴다(.pf-scroll):
// 픽셀 화면 옆에서 OS 막대가 튀고, 있다 없다 하면 높이가 흔들린다. 대신 화살표가 "더 있다"를 알린다.
export default function ScrollRow({ step = 0.8, className, innerClassName, style, children }: {
  /** 화살표 한 번에 미는 양 — 보이는 폭의 비율. 한 화면을 통째로 넘기면 어디까지 봤는지 감각이 끊긴다 */
  step?: number;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ prev: false, next: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({
      prev: el.scrollLeft > 1,
      next: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    // jsdom에는 ResizeObserver가 없다 — 없으면 최초 측정만 하고 넘어간다(테스트는 화살표를 안 본다)
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    el?.scrollBy?.({ left: dir * el.clientWidth * step, behavior: 'smooth' });
  };

  const arrow = (dir: 1 | -1, on: boolean) => (
    <ArrowButton dir={dir} tone="edge"
      className={cx('absolute top-0 bottom-0 z-1 w-4', dir < 0 ? 'left-0' : 'right-0', !on && 'hidden')}
      onClick={() => page(dir)} />
  );

  return (
    // 좌우에 화살표 폭(w-4)만큼 늘 비워 둔다 — 화살표가 내용을 덮지 않고, 화살표가
    // 생기고 사라질 때 내용 폭이 흔들리지 않는다.
    <div className={cx('relative px-4', className)}>
      {arrow(-1, edge.prev)}
      <div ref={ref} onScroll={measure}
           className={cx('pf-scroll flex gap-1 overflow-x-auto [&>*]:shrink-0', innerClassName)}
           style={style}>
        {children}
      </div>
      {arrow(1, edge.next)}
    </div>
  );
}
