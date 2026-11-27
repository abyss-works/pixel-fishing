import { useLayoutEffect, useRef, useState } from 'react';
import { PIP_BASE_HEIGHT, PIP_BASE_WIDTH } from '../../../features/pip/model/pipMonitor';

export interface PipTipState {
  text: string;
  anchorRect: DOMRect;
}

/** PiP 창 뷰포트 안쪽 여백 안에서 잘리지 않는 공용 떠 있는 툴팁 */
export default function PipFloatingTip({ tip }: { tip: PipTipState | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 8, top: 8 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!tip || !el) return;
    const pipWin = el.ownerDocument.defaultView;
    const viewW = pipWin?.innerWidth ?? PIP_BASE_WIDTH;
    const viewH = pipWin?.innerHeight ?? PIP_BASE_HEIGHT;
    const tipWidth = el.offsetWidth || 160;
    const tipHeight = el.offsetHeight || 26;
    const maxLeft = Math.max(8, viewW - tipWidth - 8);
    const left = Math.max(
      8,
      Math.min(maxLeft, tip.anchorRect.left + tip.anchorRect.width / 2 - tipWidth / 2),
    );
    const preferTop = tip.anchorRect.top - tipHeight - 6;
    const maxTop = Math.max(8, viewH - tipHeight - 8);
    const top = Math.min(maxTop, preferTop >= 8 ? preferTop : tip.anchorRect.bottom + 6);
    setCoords({ left, top });
  }, [tip]);

  if (!tip) {
    return <div className="pf-pip-floating-tip" hidden role="tooltip" />;
  }

  return (
    <div
      ref={ref}
      className="pf-pip-floating-tip"
      role="tooltip"
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
    >
      {tip.text}
    </div>
  );
}
