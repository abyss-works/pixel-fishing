import type { ReactNode } from 'react';
import { cx } from './cx';
import Inset from './Inset';

// 표를 담는 오목한 칸. 표가 칸보다 넓거나 길면 칸이 가로와 세로로 스크롤한다(페이지와 창은 스크롤하지 않는다).
// 가로와 세로를 한 칸이 맡으므로 표 머리의 sticky는 이 칸 안에서 그대로 동작한다. 막대 자리는 늘 확보하고, 칸의 크기와 안쪽 여백(오른쪽은 막대와 내용 사이 8px 이상)은 호출부가 정한다.
// 바깥 탭 본문이 이미 세로 스크롤을 맡는 경우 scroll="x"로 가로 스크롤만 둔다.
export default function TableBox({ scroll = 'both', className, children }: {
  scroll?: 'both' | 'x';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Inset className={cx(
      'pf-scroll-panel overscroll-x-contain',
      scroll === 'x' ? 'overflow-x-auto overflow-y-visible' : 'overflow-auto [scrollbar-gutter:stable]',
      className,
    )}>
      {children}
    </Inset>
  );
}
