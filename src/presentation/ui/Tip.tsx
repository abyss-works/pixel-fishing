import type { ReactNode } from 'react';
import { cx } from './cx';

// 툴팁: 설명이 붙은 요소. 마우스를 올리거나 키보드로 포커스하면 아래에 설명이 뜬다.
// 설명이 있다는 표시는 점선 밑줄 하나뿐이고, 따로 물음표 아이콘을 붙이지 않는다.
// 막대처럼 글자가 없는 요소는 plain으로 밑줄을 뺀다.
export default function Tip({ text, plain, className, children }: {
  text: string;
  /** 밑줄 없이 감싼다(진행 막대 등) */
  plain?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span tabIndex={0} className={cx('group/tip relative cursor-help',
      !plain && 'underline decoration-dotted decoration-text-dim underline-offset-[3px]', className)}>
      {children}
      <span role="tooltip"
            className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-10 hidden w-max max-w-64 px-2.5 py-2
                       bg-surface-2 border border-line shadow-panel font-sans text-xs leading-normal text-text font-normal
                       whitespace-normal no-underline group-hover/tip:block group-focus-visible/tip:block">
        {text}
      </span>
    </span>
  );
}
