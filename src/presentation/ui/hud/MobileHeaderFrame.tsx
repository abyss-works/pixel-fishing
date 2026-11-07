import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import HudPanel from './HudPanel';

// 헤더 틀 - 모바일 레이아웃의 자원 바, 의뢰 현황, 메뉴 버튼이 함께 쓰는 반투명 틀(HudPanel)과 높이의 단일 출처.
// 높이는 40px이다. square면 폭도 같아 정사각형(메뉴 버튼)이다. PC 레이아웃의 자원 바와 메뉴 버튼은 이 틀을 쓰지 않는다(예전 구성).
//
// 40px: 값 칸 한 줄 내용 13~16px(값 글자 13, 아이콘 12)에 테두리 4와 여백을 더해도 들어가는 높이이자, 누르는 틀(메뉴 버튼 정사각형)의 최소 크기.
// 360 폭(모바일 격자 한 행): 가장자리 4 + 자원 바 220 + 의뢰 현황 틀 84와 양옆 여백 8 + 메뉴 버튼 40과 오른쪽 여백 4 = 360.
export default function MobileHeaderFrame({ as, square, className, children, ...rest }: {
  as?: 'div' | 'button';
  /** 폭도 높이와 같게 한다 */
  square?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <HudPanel as={as} className={cx('h-10', square && 'w-10', className)} {...rest}>
      {children}
    </HudPanel>
  );
}
