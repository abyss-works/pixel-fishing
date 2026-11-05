import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import TooltipBubble from './TooltipBubble';
import { anchorOf } from './tooltipPlacement';
import type { Anchor } from './tooltipPlacement';

// 툴팁: 설명이 붙은 요소. 마우스를 올리거나 키보드로 포커스하면 설명 버블이 뜬다.
// 설명이 있다는 표시는 점선 밑줄 하나뿐이고, 따로 물음표 아이콘을 붙이지 않는다.
// 막대처럼 글자가 없는 요소는 plain으로 밑줄을 뺀다. 설명은 문장이나 목록(TipList)이다.
// 버튼처럼 스스로 포커스를 받는 요소를 감쌀 때는 wraps로 감싼 쪽이 포커스를 받게 하고, 툴팁 자리에는 탭 정지를 두지 않는다.
// 버블은 HelpHint와 같은 TooltipBubble이다. 요소의 왼쪽 아래에서 펼치고, 화면 끝에 닿으면 안쪽으로 들어온다.
export default function Tip({ text, plain, wraps, className, children }: {
  text: ReactNode;
  /** 밑줄 없이 감싼다(진행 막대 등) */
  plain?: boolean;
  /** 포커스를 받는 요소(버튼 등)를 감싼다. 감싼 요소의 포커스로 띄우고, 밑줄을 두지 않는다 */
  wraps?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // open이 false면 닫힘, anchor가 null이면 rect를 못 주는 환경이다
  const [open, setOpen] = useState<{ anchor: Anchor | null } | null>(null);

  const show = () => setOpen({ anchor: anchorOf(ref.current) });
  const hide = () => setOpen(null);

  return (
    <>
      <span ref={ref} tabIndex={wraps ? undefined : 0} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
            className={cx(!wraps && 'cursor-help', !plain && !wraps && 'underline decoration-dotted decoration-text-dim underline-offset-[3px]', className)}>
        {children}
      </span>
      {open && <TooltipBubble anchor={open.anchor} className="font-sans font-normal">{text}</TooltipBubble>}
    </>
  );
}

/** 툴팁 안의 목록: 이름은 왼쪽, 값은 오른쪽. 아래에 덧붙일 한 줄(note)을 둘 수 있다 */
export function TipList({ rows, note }: { rows: { label: string; value: string }[]; note?: string }) {
  return (
    <span className="flex flex-col gap-1 min-w-40">
      <span className="flex flex-col">
        {rows.map(r => (
          <span key={r.label} className="flex items-center justify-between gap-4 py-0.5">
            <span>{r.label}</span><span className="pf-accent text-text">{r.value}</span>
          </span>
        ))}
      </span>
      {note && <span className="pt-1 border-t border-line">{note}</span>}
    </span>
  );
}
