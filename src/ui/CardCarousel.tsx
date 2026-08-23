import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import PixelIcon from './PixelIcon';

// 가로 카드 줄 — 한 화면에 `perView`장이 들어가고, 넘치면 좌우로 밀어 본다.
//
// 넘치는 경우가 예외라서(수역당 어종 5~6종) 항상 화살표를 띄우면 자리만 먹는다.
// **넘칠 때만** 나오게 하려면 실제 크기를 재야 한다 — CSS로는 판정할 수 없다.
// 스크롤 막대는 숨긴다(.pf-scroll): 픽셀 화면 옆에서 OS 막대가 튀고, 있다 없다 하면
// 카드 높이가 흔들린다. 대신 화살표가 "더 있다"를 알린다.
const GAP_REM = 0.25; // gap-1

export default function CardCarousel({ perView, children }: { perView: number; children: ReactNode }) {
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
    // 한 화면에서 한 장 남기고 민다 — 통째로 넘기면 어디까지 봤는지 감각이 끊긴다
    el?.scrollBy?.({ left: dir * el.clientWidth * ((perView - 1) / perView), behavior: 'smooth' });
  };

  const arrow = (dir: 1 | -1, on: boolean) => (
    <button
      className={cx('absolute top-0 bottom-0 z-1 w-4 flex items-center justify-center',
        'bg-[rgba(10,21,38,0.85)] border border-line text-text-dim hover:text-text cursor-pointer',
        dir < 0 ? 'left-0' : 'right-0', !on && 'hidden')}
      aria-label={dir < 0 ? '이전' : '다음'}
      onClick={() => page(dir)}>
      <PixelIcon glyph={dir < 0 ? 'caretRight' : 'caretRight'} size={9}
                 className={dir < 0 ? 'rotate-180' : undefined} />
    </button>
  );

  return (
    <div className="relative">
      {arrow(-1, edge.prev)}
      <div ref={ref} onScroll={measure}
           className="pf-scroll flex gap-1 overflow-x-auto snap-x snap-mandatory
                      [&>*]:shrink-0 [&>*]:snap-start"
           // 카드 폭을 부모에서 파생한다 — 자식은 `basis-(--card-w)`만 쓰면 된다.
           // 사이드바 폭이 바뀌어도 한 화면에 perView장이 유지된다.
           style={{ ['--card-w' as string]:
             `calc((100% - ${(perView - 1) * GAP_REM}rem) / ${perView})` }}>
        {children}
      </div>
      {arrow(1, edge.next)}
    </div>
  );
}
