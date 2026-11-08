import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import HudPanel from './HudPanel';

// 헤더 틀 - 모바일 레이아웃의 자원 바와 메뉴 버튼이 함께 쓰는 반투명 틀(HudPanel).
// square면 40px 정사각형(메뉴 버튼)이다. 아니면 높이는 내용이 정한다(자원 바는 두 행이라 메뉴 버튼보다 높다).
// 메뉴 버튼은 자원 바 높이의 세로 가운데에 맞춘다(자리는 헤더가 정한다). PC 레이아웃의 자원 바와 메뉴 버튼은 이 틀을 쓰지 않는다(HeaderFrame 60px).
//
// 40px: 누르는 틀(메뉴 버튼 정사각형)의 최소 크기.
export default function MobileHeaderFrame({ as, square, className, children, ...rest }: {
  as?: 'div' | 'button';
  /** 40px 정사각형으로 그린다 */
  square?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <HudPanel as={as} className={cx(square && 'h-10 w-10', className)} {...rest}>
      {children}
    </HudPanel>
  );
}
