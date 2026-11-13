import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { cx } from '../cx';
import { NOTCH_SM } from '../notch';

// HUD 칩 — 캔버스 위에 뜨는 작은 값 표시(접속 수, 슬롯 효과, 시계 등)의 공통 껍데기.
// 바탕은 HUD 반투명 표면(pf-glass)이고, 작은 노치와 베벨을 두른다. size sm은 시계처럼 한 줄 글자만 담는 낮은 칩이다.
// 칩 자신만 포인터 이벤트를 받는다(pointer-events-auto). 칩 줄이 pointer-events-none이라 칩 밖은 아래 화면으로 통과한다.
// onClick을 주면 누를 수 있는 버튼으로 그린다.
export default function HudChip({ size = 'md', className, children, onClick, ...rest }: {
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
} & Omit<HTMLAttributes<HTMLElement>, 'onClick'>) {
  const cls = cx('pf-glass pf-bevel pointer-events-auto inline-flex items-center gap-1.5 border-2 border-line', NOTCH_SM,
                 size === 'sm' ? 'h-6 px-2' : 'h-[26px] px-2 text-xs', className);
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(cls, 'cursor-pointer text-text hover:border-accent')} {...rest}>
        {children}
      </button>
    );
  }
  return <div className={cls} {...rest}>{children}</div>;
}
