import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { placeBubble } from './tooltipPlacement';
import type { Anchor } from './tooltipPlacement';

// 툴팁 버블 — Tip과 HelpHint가 함께 쓰는 설명 상자. document.body에 portal로 띄워 노치(clip-path)나
// 스크롤 상자에 잘리지 않고 창 위로 올라온다. 띄운 뒤 제 크기를 재서 화면 안쪽으로 자리를 잡는다(placeBubble).
// anchor가 null이면(rect를 못 주는 테스트 환경) 원점에 띄워 본문을 확인할 수 있게 한다.
export default function TooltipBubble({ anchor, className, children }: {
  anchor: Anchor | null;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) { setPos({ x: 0, y: 0 }); return; }
    const r = el.getBoundingClientRect();
    setPos(placeBubble(anchor, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }));
  }, [anchor]);

  return createPortal(
    <div ref={ref} role="tooltip"
         className={cx('fixed z-20 w-max max-w-[280px] px-2 py-1.5 rounded-sm border border-line bg-bg shadow-panel',
           'text-xs leading-[1.6] text-text-dim pointer-events-none animate-fade-in', className)}
         // 크기를 재기 전 한 번은 보이지 않게 요소 자리에 둔다
         style={pos ? { left: pos.x, top: pos.y } : { left: anchor?.left ?? 0, top: anchor?.bottom ?? 0, visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}
