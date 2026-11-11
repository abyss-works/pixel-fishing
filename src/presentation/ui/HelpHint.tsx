import { useRef, useState } from 'react';
import TooltipBubble from './TooltipBubble';
import { anchorOf } from './tooltipPlacement';
import type { Anchor } from './tooltipPlacement';

// 호버 도움말 — 요소 옆에 붙는 작은 물음표.
// 네이티브 title 툴팁이 아니라 **게임 스타일 버블**을 띄운다(브라우저 기본 툴팁은
// 게임 톤과 어긋난다는 피드백). 문장은 호출자가 아니라 서비스/데이터가 갖는다
// (stats.powerHelpText처럼) — UI에서 규칙 서술을 재작성하지 않는다.
//
// 구현: mouseenter/focus 시 rect를 재고 TooltipBubble(portal)을 띄운다. 모달 안에서도 안 잘리고,
// 화면 끝에 닿으면 안쪽으로 들어온다.
// 터치(호버 없음) 대비 onClick 토글도 받는다.

interface Props {
  text: string;
}

export default function HelpHint({ text }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState<{ anchor: Anchor | null } | null>(null);

  // 배치는 표준형: 앵커의 왼쪽 아래에서 오른쪽 아래로(중앙 정렬로 끌어오지 않는다)
  const show = () => setOpen({ anchor: anchorOf(ref.current) });
  const hide = () => setOpen(null);

  return (
    <>
      <span ref={ref} role="button" aria-label="도움말"
            onMouseEnter={show} onMouseLeave={hide}
            onFocus={show} onBlur={hide}
            onClick={() => (open ? hide() : show())}
            className="inline-flex items-center justify-center w-[15px] h-[15px] ml-1 align-middle
                       rounded-full border border-line bg-surface-2
                       text-text-dim text-2xs leading-none cursor-help select-none">
        ?
      </span>
      {open && <TooltipBubble anchor={open.anchor}>{text}</TooltipBubble>}
    </>
  );
}
